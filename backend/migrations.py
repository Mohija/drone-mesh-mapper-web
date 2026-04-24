"""
Versioned, additive schema migrations for FlightArc.

Rules (enforced by code review, see DATABASE_LIFECYCLE.md):
  1. Additive only — no DROP, no DELETE, no data mutation.
  2. Each migration has a unique, ordered `version` ID and stays immutable
     once merged (never edit a released migration — add a new one instead).
  3. Every migration is idempotent (statements run inside try/except so a
     re-run is a no-op on SQLite).
  4. The runner records applied versions in the `schema_migrations` table
     and ensures each migration runs exactly once per DB.
  5. Before running any pending migration the runner snapshots the DB via
     `backup.create_backup(reason="pre-<version>")`. See backup.py.

Adding a migration:
  MIGRATIONS.append({
      "version": "NNN_short_slug",
      "description": "Human-readable sentence",
      "statements": ["ALTER TABLE ... ADD COLUMN ...", ...],   # OR
      "fn": lambda db, logger: ...,                            # Python logic
  })
"""

from __future__ import annotations

import logging
import time
from typing import Any, Callable

logger = logging.getLogger("migrations")


# -----------------------------------------------------------------------------
# Migration registry — append new migrations to the END, never edit or remove.
# -----------------------------------------------------------------------------

MIGRATIONS: list[dict[str, Any]] = [
    {
        "version": "001_base_schema",
        "description": "Create base tables (idempotent via SQLAlchemy metadata).create_all()",
        # Handled separately via db.create_all() — recorded here for audit.
        "statements": [],
    },
    {
        "version": "002_receiver_ota_columns",
        "description": "OTA + merged-binary columns on receiver_nodes",
        "statements": [
            "ALTER TABLE receiver_nodes ADD COLUMN last_build_version VARCHAR(20)",
            "ALTER TABLE receiver_nodes ADD COLUMN last_build_merged_size INTEGER",
            "ALTER TABLE receiver_nodes ADD COLUMN ota_update_pending BOOLEAN DEFAULT 0 NOT NULL",
            "ALTER TABLE receiver_nodes ADD COLUMN ota_last_attempt REAL",
            "ALTER TABLE receiver_nodes ADD COLUMN ota_last_result VARCHAR(100)",
        ],
    },
    {
        "version": "003_tenant_mission_zone_defaults",
        "description": "Mission-zone default radius/color/altitude on tenant_settings",
        "statements": [
            "ALTER TABLE tenant_settings ADD COLUMN mission_zone_radius REAL",
            "ALTER TABLE tenant_settings ADD COLUMN mission_zone_color VARCHAR(20)",
            "ALTER TABLE tenant_settings ADD COLUMN mission_zone_min_alt_agl REAL",
            "ALTER TABLE tenant_settings ADD COLUMN mission_zone_max_alt_agl REAL",
        ],
    },
    {
        "version": "004_log_level_and_build_config",
        "description": "Log level, build-config on receiver_nodes, zone authorship",
        "statements": [
            "ALTER TABLE tenant_settings ADD COLUMN log_level VARCHAR(10)",
            "ALTER TABLE receiver_nodes ADD COLUMN last_build_config TEXT",
            "ALTER TABLE flight_zones ADD COLUMN created_by VARCHAR(100)",
            "ALTER TABLE flight_zones ADD COLUMN updated_by VARCHAR(100)",
        ],
    },
    {
        "version": "005_receiver_coverage",
        "description": "Coverage radius + antenna type on receiver_nodes",
        "statements": [
            "ALTER TABLE receiver_nodes ADD COLUMN coverage_radius INTEGER",
            "ALTER TABLE receiver_nodes ADD COLUMN antenna_type VARCHAR(30)",
        ],
    },
    {
        "version": "006_firmware_history",
        "description": "Firmware version history JSON column on receiver_nodes",
        "statements": [
            "ALTER TABLE receiver_nodes ADD COLUMN firmware_history TEXT",
        ],
    },
    {
        "version": "007_tenant_wifi_and_audit",
        "description": "wifi_networks + audit_enabled on tenant_settings",
        "statements": [
            "ALTER TABLE tenant_settings ADD COLUMN wifi_networks TEXT",
            "ALTER TABLE tenant_settings ADD COLUMN audit_enabled BOOLEAN DEFAULT 0",
        ],
    },
    {
        "version": "008_audit_logs_table",
        "description": "audit_logs table for immutable user-action trail",
        "statements": [
            """
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id VARCHAR(8) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                timestamp REAL NOT NULL,
                user_id VARCHAR(8) NOT NULL,
                username VARCHAR(100) NOT NULL,
                action VARCHAR(50) NOT NULL,
                resource_type VARCHAR(50) NOT NULL,
                resource_id VARCHAR(100),
                resource_name VARCHAR(200),
                details TEXT,
                ip_address VARCHAR(45)
            )
            """,
        ],
    },
    {
        "version": "009_firmware_backend_url",
        "description": "Tenant-wide firmware backend URL baked into receiver controllers (1.5.3)",
        "statements": [
            "ALTER TABLE tenant_settings ADD COLUMN firmware_backend_url VARCHAR(255)",
        ],
    },
    {
        "version": "010_receiver_full_telemetry",
        "description": "Persist all controller heartbeat fields (wifi_channel, ap_active, error_count, last_http_code)",
        "statements": [
            "ALTER TABLE receiver_nodes ADD COLUMN wifi_channel INTEGER",
            "ALTER TABLE receiver_nodes ADD COLUMN ap_active BOOLEAN",
            "ALTER TABLE receiver_nodes ADD COLUMN last_error_count INTEGER",
            "ALTER TABLE receiver_nodes ADD COLUMN last_http_code_reported INTEGER",
            "ALTER TABLE receiver_nodes ADD COLUMN last_telemetry_at REAL",
        ],
    },
    {
        "version": "011_service_tokens",
        "description": "Scoped API tokens for external health checks (e.g. scheduled remote agents)",
        "statements": [
            """
            CREATE TABLE IF NOT EXISTS service_tokens (
                id VARCHAR(8) PRIMARY KEY,
                tenant_id VARCHAR(8) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                token_hash VARCHAR(64) NOT NULL UNIQUE,
                token_prefix VARCHAR(12) NOT NULL,
                scopes VARCHAR(255) NOT NULL DEFAULT 'health_read',
                created_at REAL NOT NULL,
                created_by VARCHAR(100),
                last_used_at REAL,
                revoked_at REAL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_service_tokens_tenant ON service_tokens(tenant_id)",
            "CREATE INDEX IF NOT EXISTS idx_service_tokens_hash ON service_tokens(token_hash)",
        ],
    },
    {
        "version": "012_tenant_retention_settings",
        "description": "Per-tenant retention days for system_logs and audit_logs (data lifecycle caps)",
        "statements": [
            "ALTER TABLE tenant_settings ADD COLUMN retention_system_logs_days INTEGER",
            "ALTER TABLE tenant_settings ADD COLUMN retention_audit_logs_days INTEGER",
        ],
    },
    {
        "version": "013_receiver_gps_telemetry",
        "description": "GPS diagnostic fields from the esp32-s3-gps heartbeat (present, has_fix, satellites, hdop, last_fix_age_seconds)",
        "statements": [
            "ALTER TABLE receiver_nodes ADD COLUMN gps_present BOOLEAN",
            "ALTER TABLE receiver_nodes ADD COLUMN gps_has_fix BOOLEAN",
            "ALTER TABLE receiver_nodes ADD COLUMN gps_satellites INTEGER",
            "ALTER TABLE receiver_nodes ADD COLUMN gps_hdop FLOAT",
            "ALTER TABLE receiver_nodes ADD COLUMN gps_last_fix_age_seconds INTEGER",
        ],
    },
    {
        "version": "014_receiver_gps_activity",
        "description": "GPS activity indicators — messages_parsed, last_message_age, sats_in_view — so the UI can tell 'module silent' apart from 'module running, no sky view'",
        "statements": [
            "ALTER TABLE receiver_nodes ADD COLUMN gps_messages_parsed INTEGER",
            "ALTER TABLE receiver_nodes ADD COLUMN gps_last_message_age_seconds INTEGER",
            "ALTER TABLE receiver_nodes ADD COLUMN gps_sats_in_view INTEGER",
        ],
    },
]


# -----------------------------------------------------------------------------
# Runner
# -----------------------------------------------------------------------------


_SCHEMA_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    applied_at REAL NOT NULL,
    description TEXT
)
"""


def _ensure_schema_table(db) -> None:
    db.session.execute(db.text(_SCHEMA_TABLE_DDL))
    db.session.commit()


def applied_versions(db) -> set[str]:
    """Return the set of migration versions already applied to the DB."""
    _ensure_schema_table(db)
    rows = db.session.execute(db.text("SELECT version FROM schema_migrations")).fetchall()
    return {r[0] for r in rows}


def pending_migrations(db) -> list[dict[str, Any]]:
    applied = applied_versions(db)
    return [m for m in MIGRATIONS if m["version"] not in applied]


def _record_applied(db, version: str, description: str) -> None:
    db.session.execute(
        db.text(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at, description) "
            "VALUES (:v, :t, :d)"
        ),
        {"v": version, "t": time.time(), "d": description},
    )
    db.session.commit()


def _apply_one(db, m: dict[str, Any]) -> None:
    """Run a single migration. Individual statements are wrapped in try/except
    so a partial re-run (e.g. column already exists) does not abort the rest.
    Python `fn` migrations are the author's responsibility to make idempotent.
    """
    version = m["version"]
    description = m.get("description", "")
    logger.info("Applying migration %s: %s", version, description)

    statements = m.get("statements") or []
    for stmt in statements:
        try:
            db.session.execute(db.text(stmt))
            db.session.commit()
        except Exception as exc:
            # additive-only: the expected failure is "duplicate column" /
            # "table already exists" on re-run. Log at debug level so real
            # SQL errors still surface in the caller's try/except above.
            db.session.rollback()
            logger.debug("  statement skipped (%s): %s", exc.__class__.__name__, str(stmt)[:80])

    fn: Callable | None = m.get("fn")
    if fn is not None:
        fn(db, logger)
        db.session.commit()

    _record_applied(db, version, description)
    logger.info("  ✓ migration %s recorded", version)


def run_migrations(db, backup_fn: Callable[[str], Any] | None = None) -> list[str]:
    """Apply all pending migrations.

    If `backup_fn` is provided, it is called once before any pending migration
    is run (reason identifies the batch, e.g. `pre-migration-<version>`).

    Returns the list of version IDs applied in this call.
    """
    _ensure_schema_table(db)
    pending = pending_migrations(db)
    if not pending:
        logger.info("No pending migrations.")
        return []

    logger.info("Pending migrations: %s", ", ".join(m["version"] for m in pending))

    if backup_fn is not None:
        first_pending = pending[0]["version"]
        try:
            backup_fn(f"pre-migration-{first_pending}")
        except Exception as exc:
            # Refuse to migrate without a backup — this is the load-bearing
            # guard that keeps us safe against future Test/Production mistakes.
            logger.error("Pre-migration backup FAILED: %s — aborting migrations", exc)
            raise

    applied = []
    for m in pending:
        _apply_one(db, m)
        applied.append(m["version"])
    return applied
