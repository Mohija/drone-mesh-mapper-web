"""Tests for the DB lifecycle machinery: backups, migration runner, guard-rails.

These tests must not touch the production DB — see conftest.py for the
`DATABASE_URL` override that enforces an isolated temp file per test run.
"""

import os
import time
import pytest


def test_backup_creates_file_with_timestamp(tmp_path):
    """create_backup copies the live DB to a named file under BACKUP_DIR."""
    import backup as bkp

    # Isolate the backup dir for this test
    test_dir = tmp_path / "backups"
    original_dir = bkp.BACKUP_DIR
    bkp.BACKUP_DIR = str(test_dir)

    try:
        # Fake "live" DB
        live_db = tmp_path / "flightarc.db"
        live_db.write_bytes(b"SQLite format 3\x00" + b"\x00" * 200)  # enough to pass size>0

        path = bkp.create_backup("unit-test", db_path=str(live_db))
        assert path is not None
        assert os.path.isfile(path)
        assert os.path.basename(path).endswith("-unit-test.db")
    finally:
        bkp.BACKUP_DIR = original_dir


def test_backup_skips_when_source_missing(tmp_path):
    import backup as bkp
    missing = tmp_path / "does-not-exist.db"
    assert bkp.create_backup("skip-test", db_path=str(missing)) is None


def test_backup_rotation_keeps_newest(tmp_path):
    import backup as bkp
    test_dir = tmp_path / "backups"
    test_dir.mkdir()
    # Create 5 fake backups
    for i in range(5):
        p = test_dir / f"2026010{i+1}-000000-fake.db"
        p.write_text("x")
        os.utime(str(p), (time.time() - (5 - i) * 60, time.time() - (5 - i) * 60))

    original_dir = bkp.BACKUP_DIR
    bkp.BACKUP_DIR = str(test_dir)
    try:
        removed = bkp.rotate_backups(max_backups=3)
        assert removed == 2
        remaining = sorted(os.listdir(test_dir))
        assert len(remaining) == 3
        # Oldest (20260101 + 20260102) gone
        assert not any("20260101" in f or "20260102" in f for f in remaining)
    finally:
        bkp.BACKUP_DIR = original_dir


def test_migrations_record_applied_versions(app):
    """After run_migrations the schema_migrations table lists every version."""
    from database import db
    from migrations import applied_versions, MIGRATIONS
    with app.app_context():
        applied = applied_versions(db)
        # Every registry entry should be applied at this point (conftest runs
        # the app which triggers run_migrations).
        for m in MIGRATIONS:
            assert m["version"] in applied, f"missing {m['version']}"


def test_migrations_idempotent_on_rerun(app):
    """Running the runner again on a current DB must be a no-op."""
    from database import db
    from migrations import run_migrations
    with app.app_context():
        # The backup_fn is required to be callable — but must NOT fire, so
        # wrap a counter.
        calls = []
        applied = run_migrations(db, backup_fn=lambda r: calls.append(r))
        assert applied == []
        assert calls == []  # no pending → no backup


def test_migrations_refuse_without_backup_callable(app, monkeypatch):
    """If a pre-migration backup fails, the runner must abort — this is the
    load-bearing guard against silently-bad deployments."""
    from database import db
    from migrations import run_migrations, MIGRATIONS
    # Inject a fake pending migration so the runner has something to do.
    fake = {
        "version": "999_fake_never_applied",
        "description": "test-only fake migration",
        "statements": [],
    }
    MIGRATIONS.append(fake)
    try:
        with app.app_context():
            def failing_backup(_):
                raise RuntimeError("simulated disk full")
            with pytest.raises(RuntimeError, match="simulated disk full"):
                run_migrations(db, backup_fn=failing_backup)
            # The fake migration must NOT be recorded as applied
            from migrations import applied_versions
            assert "999_fake_never_applied" not in applied_versions(db)
    finally:
        MIGRATIONS.remove(fake)


def test_conftest_enforces_isolated_db(app):
    """Hard guard: the active SQLALCHEMY_DATABASE_URI must not point at the
    production file. If it does, pytest.exit was supposed to have fired —
    reaching this test means the guard is in place."""
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
    assert "flightarc-test-" in uri, (
        f"Test DB URI looks like the production DB! URI={uri}. "
        "Check conftest.py DATABASE_URL override."
    )
    assert "backend/data/flightarc.db" not in uri
