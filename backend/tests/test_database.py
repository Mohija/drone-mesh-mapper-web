"""Tests for database initialization and configuration."""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import db


class TestDatabaseConfig:
    def test_wal_mode_active(self, app):
        """SQLite WAL journal mode should be enabled."""
        with app.app_context():
            result = db.session.execute(db.text("PRAGMA journal_mode")).scalar()
            assert result == "wal"

    def test_foreign_keys_enforced(self, app):
        """SQLite foreign key enforcement should be ON."""
        with app.app_context():
            result = db.session.execute(db.text("PRAGMA foreign_keys")).scalar()
            assert result == 1

    def test_busy_timeout_set(self, app):
        """SQLite busy_timeout should be set."""
        with app.app_context():
            result = db.session.execute(db.text("PRAGMA busy_timeout")).scalar()
            assert result == 5000

    def test_tables_exist(self, app):
        """All expected tables should exist."""
        with app.app_context():
            result = db.session.execute(
                db.text("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            ).fetchall()
            table_names = {row[0] for row in result}
            assert "tenants" in table_names
            assert "users" in table_names
            assert "tenant_settings" in table_names
            assert "flight_zones" in table_names
            assert "trail_archives" in table_names

    def test_concurrent_reads(self, app):
        """Multiple reads in same context should work (WAL mode)."""
        with app.app_context():
            from models import Tenant
            # Two queries in same context
            t1 = Tenant.query.all()
            t2 = Tenant.query.all()
            assert len(t1) == len(t2)

    def test_db_create_all_idempotent(self, app):
        """Calling create_all multiple times should not error."""
        with app.app_context():
            db.create_all()
            db.create_all()
            from models import Tenant
            assert Tenant.query.count() >= 1
