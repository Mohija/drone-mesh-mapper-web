"""Tests for the retention framework: prune old logs + respect per-tenant overrides."""

import time
import pytest


def test_retention_prunes_old_system_logs(app, default_tenant_id):
    """system_logs older than N days must be deleted; newer rows kept."""
    from database import db
    from models import SystemLog
    from retention import run_retention, DEFAULT_SYSTEM_LOG_DAYS

    now = time.time()
    old_ts = now - (DEFAULT_SYSTEM_LOG_DAYS + 1) * 86400
    fresh_ts = now - 60  # 1 min old

    with app.app_context():
        db.session.add(SystemLog(tenant_id=default_tenant_id, timestamp=old_ts, level="info", module="test", message="old"))
        db.session.add(SystemLog(tenant_id=default_tenant_id, timestamp=fresh_ts, level="info", module="test", message="fresh"))
        db.session.commit()
        before = SystemLog.query.count()
        assert before >= 2

    stats = run_retention(app)
    assert stats["system_logs_pruned"] >= 1

    with app.app_context():
        remaining = [r.message for r in SystemLog.query.all()]
        assert "fresh" in remaining
        assert "old" not in remaining


def test_retention_honors_per_tenant_override(app, default_tenant_id):
    """If tenant overrides retention_system_logs_days=2, rows >=2d old are gone."""
    from database import db
    from models import SystemLog, TenantSettings
    from retention import run_retention

    now = time.time()
    with app.app_context():
        ts = TenantSettings.query.filter_by(tenant_id=default_tenant_id).first()
        ts.retention_system_logs_days = 2
        db.session.add(SystemLog(tenant_id=default_tenant_id, timestamp=now - 3 * 86400, level="info", module="t", message="3d-old"))
        db.session.add(SystemLog(tenant_id=default_tenant_id, timestamp=now - 1 * 86400, level="info", module="t", message="1d-old"))
        db.session.commit()

    run_retention(app)

    with app.app_context():
        msgs = [r.message for r in SystemLog.query.all()]
        assert "1d-old" in msgs
        assert "3d-old" not in msgs


def test_retention_prunes_old_audit_logs(app, default_tenant_id):
    from database import db
    from models import AuditLog
    from retention import run_retention, DEFAULT_AUDIT_LOG_DAYS

    now = time.time()
    with app.app_context():
        db.session.add(AuditLog(
            tenant_id=default_tenant_id,
            timestamp=now - (DEFAULT_AUDIT_LOG_DAYS + 10) * 86400,
            user_id="u", username="u", action="create", resource_type="zone", resource_name="old-one",
        ))
        db.session.add(AuditLog(
            tenant_id=default_tenant_id,
            timestamp=now - 3600,
            user_id="u", username="u", action="create", resource_type="zone", resource_name="fresh-one",
        ))
        db.session.commit()

    run_retention(app)

    with app.app_context():
        names = [a.resource_name for a in AuditLog.query.all()]
        assert "fresh-one" in names
        assert "old-one" not in names


def test_retention_hard_count_cap(app, default_tenant_id):
    """If time-based retention leaves > SYSTEM_LOG_HARD_CAP rows, oldest are culled."""
    from database import db
    from models import SystemLog
    from retention import run_retention, SYSTEM_LOG_HARD_CAP

    # Make the cap tiny for the test — patch the module constant.
    import retention
    original_cap = retention.SYSTEM_LOG_HARD_CAP
    retention.SYSTEM_LOG_HARD_CAP = 5
    try:
        now = time.time()
        with app.app_context():
            # All rows are very fresh, but we still want count cap to kick in.
            for i in range(10):
                db.session.add(SystemLog(
                    tenant_id=default_tenant_id,
                    timestamp=now - (10 - i),  # i=0 is oldest (9 sec ago), i=9 is newest
                    level="info", module="t", message=f"msg-{i}",
                ))
            db.session.commit()

        stats = run_retention(app)
        assert stats["system_logs_pruned"] >= 5  # culled down to cap

        with app.app_context():
            remaining = SystemLog.query.filter_by(tenant_id=default_tenant_id).all()
            assert len(remaining) <= retention.SYSTEM_LOG_HARD_CAP
            # The ones kept should be the newest (highest i)
            kept_messages = [r.message for r in remaining]
            assert "msg-9" in kept_messages
            assert "msg-0" not in kept_messages
    finally:
        retention.SYSTEM_LOG_HARD_CAP = original_cap


def test_retention_clamps_invalid_days(app, default_tenant_id):
    """A tenant setting of 0 or negative must not silently wipe everything."""
    from database import db
    from models import SystemLog, TenantSettings
    from retention import run_retention

    now = time.time()
    with app.app_context():
        ts = TenantSettings.query.filter_by(tenant_id=default_tenant_id).first()
        ts.retention_system_logs_days = 0  # would wipe ALL rows if honored literally
        db.session.add(SystemLog(tenant_id=default_tenant_id, timestamp=now - 10, level="info", module="t", message="recent"))
        db.session.commit()

    run_retention(app)

    with app.app_context():
        msgs = [r.message for r in SystemLog.query.filter_by(tenant_id=default_tenant_id).all()]
        assert "recent" in msgs


def test_db_stats_returns_counts(app):
    from retention import db_stats
    stats = db_stats(app)
    assert "tables" in stats
    assert "tenants" in stats["tables"]
    assert stats["tables"]["tenants"] >= 1
    # DB file may not exist for in-memory tests; both cases are ok
    assert "db_file" in stats


def test_health_summary_includes_db_stats(client, app, default_tenant_id):
    """The agent's endpoint must expose retention_days + row counts so the
    monitor can detect runaway growth."""
    import hashlib, secrets
    from models import ServiceToken
    from database import db
    raw = "flightarc_svc_" + secrets.token_hex(32)
    with app.app_context():
        tok = ServiceToken(
            tenant_id=default_tenant_id, name="t",
            token_hash=hashlib.sha256(raw.encode()).hexdigest(),
            token_prefix=raw[:12], scopes="health_read",
        )
        db.session.add(tok)
        db.session.commit()

    res = client.get("/api/receivers/health-summary",
                     headers={"Authorization": f"Bearer {raw}"})
    assert res.status_code == 200
    data = res.get_json()
    assert "db_stats" in data
    assert "tables" in data["db_stats"]
    assert "retention_days" in data["db_stats"]
    assert data["db_stats"]["retention_days"]["system_logs"] >= 1
