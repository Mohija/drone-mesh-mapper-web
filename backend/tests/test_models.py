"""Tests for SQLAlchemy models."""

import pytest
import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import db
from models import Tenant, User, TenantSettings, FlightZone, TrailArchive


class TestTenantModel:
    def test_create_tenant(self, app):
        with app.app_context():
            t = Tenant(name="test-co", display_name="Test Company")
            db.session.add(t)
            db.session.commit()
            assert t.id is not None
            assert len(t.id) == 8
            assert t.is_active is True
            assert t.created_at > 0

    def test_tenant_unique_name(self, app):
        with app.app_context():
            t1 = Tenant(name="unique-name", display_name="First")
            db.session.add(t1)
            db.session.commit()
            t2 = Tenant(name="unique-name", display_name="Second")
            db.session.add(t2)
            with pytest.raises(Exception):  # IntegrityError
                db.session.commit()
            db.session.rollback()

    def test_tenant_to_dict(self, app):
        with app.app_context():
            t = Tenant(name="dict-test", display_name="Dict Test")
            db.session.add(t)
            db.session.commit()
            d = t.to_dict()
            assert d["name"] == "dict-test"
            assert d["display_name"] == "Dict Test"
            assert d["is_active"] is True
            assert "id" in d
            assert "created_at" in d
            assert "updated_at" in d

    def test_default_tenant_exists(self, app):
        with app.app_context():
            default = Tenant.query.filter_by(name="default").first()
            assert default is not None
            assert default.display_name == "Standard"


class TestUserModel:
    def test_create_user(self, app, default_tenant_id):
        with app.app_context():
            u = User(
                username="testuser",
                email="test@example.com",
                password_hash="hashed",
                display_name="Test User",
                role="user",
                tenant_id=default_tenant_id,
            )
            db.session.add(u)
            db.session.commit()
            assert u.id is not None
            assert u.is_active is True

    def test_user_unique_username(self, app, default_tenant_id):
        with app.app_context():
            u1 = User(username="dupe", email="a@x.com", password_hash="h", display_name="A", tenant_id=default_tenant_id)
            db.session.add(u1)
            db.session.commit()
            u2 = User(username="dupe", email="b@x.com", password_hash="h", display_name="B", tenant_id=default_tenant_id)
            db.session.add(u2)
            with pytest.raises(Exception):
                db.session.commit()
            db.session.rollback()

    def test_user_unique_email(self, app, default_tenant_id):
        with app.app_context():
            u1 = User(username="user1", email="same@x.com", password_hash="h", display_name="A", tenant_id=default_tenant_id)
            db.session.add(u1)
            db.session.commit()
            u2 = User(username="user2", email="same@x.com", password_hash="h", display_name="B", tenant_id=default_tenant_id)
            db.session.add(u2)
            with pytest.raises(Exception):
                db.session.commit()
            db.session.rollback()

    def test_user_to_dict(self, app, default_tenant_id):
        with app.app_context():
            u = User(
                username="dictuser",
                email="dict@example.com",
                password_hash="hashed",
                display_name="Dict User",
                role="user",
                tenant_id=default_tenant_id,
            )
            db.session.add(u)
            db.session.commit()
            d = u.to_dict()
            assert d["username"] == "dictuser"
            assert d["email"] == "dict@example.com"
            assert "password_hash" not in d
            assert d["role"] == "user"

    def test_user_to_dict_include_tenant(self, app, default_tenant_id):
        with app.app_context():
            u = User(
                username="withtenant",
                email="wt@example.com",
                password_hash="hashed",
                display_name="With Tenant",
                role="user",
                tenant_id=default_tenant_id,
            )
            db.session.add(u)
            db.session.commit()
            d = u.to_dict(include_tenant=True)
            assert d["tenant_name"] == "Standard"

    def test_super_admin_null_tenant(self, app):
        with app.app_context():
            u = User(
                username="superadmin",
                email="admin@example.com",
                password_hash="hashed",
                display_name="Super Admin",
                role="super_admin",
                tenant_id=None,
            )
            db.session.add(u)
            db.session.commit()
            assert u.tenant_id is None

    def test_user_foreign_key_invalid_tenant(self, app):
        with app.app_context():
            u = User(
                username="orphan",
                email="orphan@x.com",
                password_hash="h",
                display_name="Orphan",
                tenant_id="INVALID",
            )
            db.session.add(u)
            with pytest.raises(Exception):
                db.session.commit()
            db.session.rollback()


class TestTenantSettingsModel:
    def test_default_tenant_has_settings(self, app, default_tenant_id):
        with app.app_context():
            ts = TenantSettings.query.filter_by(tenant_id=default_tenant_id).first()
            assert ts is not None
            assert "simulator" in ts.sources

    def test_settings_to_dict(self, app, default_tenant_id):
        with app.app_context():
            ts = TenantSettings.query.filter_by(tenant_id=default_tenant_id).first()
            d = ts.to_dict()
            assert "sources" in d
            assert "tenant_id" in d


class TestFlightZoneModel:
    def test_create_flight_zone(self, app, default_tenant_id):
        with app.app_context():
            z = FlightZone(
                tenant_id=default_tenant_id,
                name="Test Zone",
                polygon=[[0, 0], [0, 10], [10, 10], [10, 0]],
            )
            db.session.add(z)
            db.session.commit()
            assert z.id is not None
            assert z.color == "#3b82f6"

    def test_flight_zone_to_dict_camelcase(self, app, default_tenant_id):
        with app.app_context():
            z = FlightZone(
                tenant_id=default_tenant_id,
                name="CamelCase",
                polygon=[[1, 2], [3, 4], [5, 6]],
                min_altitude_agl=50,
                max_altitude_agl=120,
                assigned_drones=["D1", "D2"],
            )
            db.session.add(z)
            db.session.commit()
            d = z.to_dict()
            assert d["minAltitudeAGL"] == 50
            assert d["maxAltitudeAGL"] == 120
            assert d["assignedDrones"] == ["D1", "D2"]
            assert "createdAt" in d
            assert "updatedAt" in d

    def test_flight_zone_json_fields(self, app, default_tenant_id):
        with app.app_context():
            z = FlightZone(
                tenant_id=default_tenant_id,
                name="JSON",
                polygon=[[52.0, 8.5], [52.0, 8.6], [52.1, 8.6]],
                assigned_drones=["A", "B", "C"],
            )
            db.session.add(z)
            db.session.commit()
            loaded = db.session.get(FlightZone, z.id)
            assert loaded.polygon == [[52.0, 8.5], [52.0, 8.6], [52.1, 8.6]]
            assert loaded.assigned_drones == ["A", "B", "C"]


class TestTrailArchiveModel:
    def test_create_trail_archive(self, app, default_tenant_id):
        with app.app_context():
            now = time.time()
            t = TrailArchive(
                tenant_id=default_tenant_id,
                drone_id="D1",
                drone_name="Drone 1",
                trail=[{"lat": 52.0, "lon": 8.5}, {"lat": 52.1, "lon": 8.6}],
                started_at=now,
                archived_at=now,
                expires_at=now + 86400,
            )
            db.session.add(t)
            db.session.commit()
            assert t.id is not None

    def test_trail_archive_to_dict(self, app, default_tenant_id):
        with app.app_context():
            now = time.time()
            t = TrailArchive(
                tenant_id=default_tenant_id,
                drone_id="D1",
                drone_name="Trail Drone",
                source="simulator",
                color="#ff0000",
                trail=[{"lat": 1}, {"lat": 2}, {"lat": 3}],
                started_at=now - 100,
                archived_at=now,
                expires_at=now + 86400,
            )
            db.session.add(t)
            db.session.commit()
            d = t.to_dict(include_trail=True)
            assert d["droneId"] == "D1"
            assert d["droneName"] == "Trail Drone"
            assert d["pointCount"] == 3
            assert "trail" in d

    def test_trail_archive_to_dict_no_trail(self, app, default_tenant_id):
        with app.app_context():
            now = time.time()
            t = TrailArchive(
                tenant_id=default_tenant_id,
                drone_id="D2",
                trail=[{"lat": 1}, {"lat": 2}],
                started_at=now,
                archived_at=now,
                expires_at=now + 86400,
            )
            db.session.add(t)
            db.session.commit()
            d = t.to_dict(include_trail=False)
            assert "trail" not in d
            assert d["pointCount"] == 2


class TestCascadeDelete:
    def test_delete_tenant_cascades(self, app):
        """Deleting a tenant cascades to users, settings, zones, and trail archives."""
        with app.app_context():
            t = Tenant(name="cascade-test", display_name="Cascade")
            db.session.add(t)
            db.session.flush()

            u = User(username="cascade-user", email="c@x.com", password_hash="h",
                     display_name="CU", tenant_id=t.id)
            s = TenantSettings(tenant_id=t.id, sources={"simulator": {"enabled": True}})
            z = FlightZone(tenant_id=t.id, name="CZ", polygon=[[0, 0], [1, 1], [2, 2]])
            now = time.time()
            a = TrailArchive(tenant_id=t.id, drone_id="X", trail=[{"a": 1}, {"b": 2}],
                             started_at=now, archived_at=now, expires_at=now + 86400)
            db.session.add_all([u, s, z, a])
            db.session.commit()

            tid = t.id
            uid = u.id
            zid = z.id
            aid = a.id

            db.session.delete(t)
            db.session.commit()

            assert db.session.get(Tenant, tid) is None
            assert db.session.get(User, uid) is None
            assert db.session.get(FlightZone, zid) is None
            assert db.session.get(TrailArchive, aid) is None
