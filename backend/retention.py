"""
Data retention — periodic cleanup of log tables so the DB doesn't grow forever.

Tables we prune:
  - system_logs   : request / module logs. Default 14 days. Per-tenant override via TenantSettings.retention_system_logs_days.
  - audit_logs    : immutable audit trail. Default 90 days (compliance buffer). Per-tenant override.
  - trail_archives: already self-rotates via its own Manager (`expires_at`), but we defensively drop anything past expires_at here too.

Tables we DON'T prune (small / reference):
  tenants, users, memberships, tenant_settings, receiver_nodes, flight_zones,
  violation_records, drone_address_book, service_tokens, schema_migrations.

Also separately: `connection_log` is in-memory (bounded deque) — no DB cleanup needed.

Entry points:
  - `run_retention(app)` — run once; called at startup and hourly from the
    background thread started by `start_retention_thread(app)`.
  - `manage.py cleanup` — manual trigger (see backend/manage.py).
  - `db_stats()` — returns a snapshot of row counts + DB file size so the
    health-summary endpoint / frontend can surface "is the DB growing?".
"""

from __future__ import annotations

import logging
import os
import threading
import time

logger = logging.getLogger("retention")

# Defaults — can be overridden per-tenant via TenantSettings columns.
DEFAULT_SYSTEM_LOG_DAYS = 14
DEFAULT_AUDIT_LOG_DAYS = 90
SYSTEM_LOG_HARD_CAP = 20000  # per tenant: count-based fallback if time-based is too lax

RETENTION_INTERVAL_SECONDS = 3600  # hourly


def _resolve_days(per_tenant_value: int | None, default_days: int) -> int:
    """Clamp to [1, 365] so a misconfigured 0 or negative value doesn't wipe data."""
    val = per_tenant_value if per_tenant_value is not None else default_days
    if val is None or val <= 0:
        val = default_days
    return min(max(int(val), 1), 365)


def run_retention(app) -> dict:
    """Prune expired rows for every tenant. Returns stats dict.

    Safe to call concurrently — SQLite handles row-level DELETEs fine. If this
    races with the request path we accept a short retry on a busy table.
    """
    from database import db
    from models import Tenant, TenantSettings, SystemLog, AuditLog, TrailArchive

    stats: dict = {
        "started_at": time.time(),
        "tenants_processed": 0,
        "system_logs_pruned": 0,
        "audit_logs_pruned": 0,
        "trail_archives_pruned": 0,
    }

    with app.app_context():
        now = time.time()

        # trail_archives — global (expires_at is authoritative)
        expired = TrailArchive.query.filter(TrailArchive.expires_at < now).count()
        if expired:
            TrailArchive.query.filter(TrailArchive.expires_at < now).delete()
            stats["trail_archives_pruned"] = expired

        # Per-tenant pruning for time-series tables
        for tenant in Tenant.query.all():
            tid = tenant.id
            ts = TenantSettings.query.filter_by(tenant_id=tid).first()

            sys_days = _resolve_days(
                ts.retention_system_logs_days if ts else None,
                DEFAULT_SYSTEM_LOG_DAYS,
            )
            aud_days = _resolve_days(
                ts.retention_audit_logs_days if ts else None,
                DEFAULT_AUDIT_LOG_DAYS,
            )

            # system_logs: time-based prune + hard count cap as safety net
            sys_cutoff = now - sys_days * 86400
            sys_pruned = (SystemLog.query
                          .filter(SystemLog.tenant_id == tid)
                          .filter(SystemLog.timestamp < sys_cutoff)
                          .delete())
            remaining = SystemLog.query.filter_by(tenant_id=tid).count()
            if remaining > SYSTEM_LOG_HARD_CAP:
                excess = remaining - SYSTEM_LOG_HARD_CAP
                # delete the oldest `excess` rows — use primary key subquery so
                # it works on SQLite which can't DELETE with LIMIT directly.
                victim_ids = [
                    r.id for r in (
                        SystemLog.query
                        .filter_by(tenant_id=tid)
                        .order_by(SystemLog.timestamp.asc())
                        .limit(excess)
                        .all()
                    )
                ]
                if victim_ids:
                    SystemLog.query.filter(SystemLog.id.in_(victim_ids)).delete(synchronize_session=False)
                    sys_pruned += len(victim_ids)
            stats["system_logs_pruned"] += sys_pruned

            # audit_logs: time-based only (keep compliance trail for 90 days)
            aud_cutoff = now - aud_days * 86400
            aud_pruned = (AuditLog.query
                          .filter(AuditLog.tenant_id == tid)
                          .filter(AuditLog.timestamp < aud_cutoff)
                          .delete())
            stats["audit_logs_pruned"] += aud_pruned

            stats["tenants_processed"] += 1

        db.session.commit()
        stats["duration_seconds"] = round(time.time() - stats["started_at"], 3)
        logger.info(
            "Retention run complete: %d tenants, -%d system_logs, -%d audit_logs, -%d trail_archives in %.3fs",
            stats["tenants_processed"],
            stats["system_logs_pruned"],
            stats["audit_logs_pruned"],
            stats["trail_archives_pruned"],
            stats["duration_seconds"],
        )
    return stats


_retention_thread: threading.Thread | None = None
_retention_stop = threading.Event()


def start_retention_thread(app) -> threading.Thread:
    """Kick off a daemon thread that runs retention every RETENTION_INTERVAL_SECONDS.

    The thread is fire-and-forget and exits with the process. Only one instance
    is started even if this is called multiple times (guards against repeated
    imports during test collection).
    """
    global _retention_thread
    if _retention_thread is not None and _retention_thread.is_alive():
        return _retention_thread

    def _loop():
        # initial run at startup — sync with `run_retention(app)` but isolated
        # so a failure here doesn't crash the import path.
        try:
            run_retention(app)
        except Exception:
            logger.exception("initial retention run failed")
        while not _retention_stop.wait(RETENTION_INTERVAL_SECONDS):
            try:
                run_retention(app)
            except Exception:
                logger.exception("retention run failed")

    _retention_thread = threading.Thread(target=_loop, daemon=True, name="retention")
    _retention_thread.start()
    return _retention_thread


def db_stats(app) -> dict:
    """Row counts per relevant table + DB file size. Used by /health-summary + CLI."""
    from database import db
    out: dict = {"tables": {}, "db_file": {}}
    with app.app_context():
        tables_of_interest = [
            "tenants", "users", "receiver_nodes", "flight_zones",
            "trail_archives", "violation_records", "system_logs", "audit_logs",
            "drone_address_book", "service_tokens",
        ]
        for t in tables_of_interest:
            try:
                r = db.session.execute(db.text(f"SELECT COUNT(*) FROM {t}")).fetchone()
                out["tables"][t] = r[0]
            except Exception:
                out["tables"][t] = None

        uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
        if uri.startswith("sqlite:///"):
            path = uri[len("sqlite:///"):]
            if os.path.isfile(path):
                out["db_file"] = {
                    "path": path,
                    "size_bytes": os.path.getsize(path),
                    "wal_size_bytes": (os.path.getsize(path + "-wal") if os.path.exists(path + "-wal") else 0),
                }
    return out
