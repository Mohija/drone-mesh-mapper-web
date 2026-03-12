"""Tests for admin API endpoints — tenant and user management."""

import json
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import db
from models import Tenant, User, TenantSettings, FlightZone, TrailArchive
from auth import hash_password


@pytest.fixture
def admin_headers(client):
    """Login as super_admin and return auth headers."""
    res = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin",
    })
    token = res.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def tenant_admin_headers(client, app, default_tenant_id):
    """Create a tenant_admin user and return auth headers."""
    with app.app_context():
        u = User(
            username="tadmin",
            email="tadmin@example.com",
            password_hash=hash_password("tadminpass"),
            display_name="Tenant Admin",
            role="tenant_admin",
            tenant_id=default_tenant_id,
        )
        db.session.add(u)
        db.session.commit()

    res = client.post("/api/auth/login", json={
        "username": "tadmin",
        "password": "tadminpass",
    })
    token = res.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def normal_user_headers(client, app, default_tenant_id):
    """Create a normal user and return auth headers."""
    with app.app_context():
        u = User(
            username="normaluser",
            email="normal@example.com",
            password_hash=hash_password("normalpass"),
            display_name="Normal User",
            role="user",
            tenant_id=default_tenant_id,
        )
        db.session.add(u)
        db.session.commit()

    res = client.post("/api/auth/login", json={
        "username": "normaluser",
        "password": "normalpass",
    })
    token = res.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def second_tenant(app):
    """Create a second tenant for isolation tests."""
    with app.app_context():
        t = Tenant(name="second-tenant", display_name="Second Tenant")
        db.session.add(t)
        db.session.flush()
        s = TenantSettings(tenant_id=t.id, sources={"simulator": {"enabled": True}})
        db.session.add(s)
        db.session.commit()
        tid = t.id
    yield tid
    with app.app_context():
        t = db.session.get(Tenant, tid)
        if t:
            db.session.delete(t)
            db.session.commit()


# ─── Tenant CRUD Tests ───────────────────────────────────────


class TestTenantList:
    def test_list_tenants(self, client, admin_headers):
        res = client.get("/api/admin/tenants", headers=admin_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert isinstance(data, list)
        assert len(data) >= 1  # at least default tenant
        assert any(t["name"] == "default" for t in data)

    def test_list_tenants_has_counts(self, client, admin_headers):
        res = client.get("/api/admin/tenants", headers=admin_headers)
        data = res.get_json()
        for t in data:
            assert "user_count" in t
            assert "zone_count" in t

    def test_list_tenants_forbidden_for_normal_user(self, client, normal_user_headers):
        res = client.get("/api/admin/tenants", headers=normal_user_headers)
        assert res.status_code == 403

    def test_list_tenants_unauthorized(self, client):
        res = client.get("/api/admin/tenants")
        assert res.status_code == 401


class TestTenantCreate:
    def test_create_tenant(self, client, admin_headers):
        res = client.post("/api/admin/tenants", headers=admin_headers, json={
            "name": "test-tenant",
            "display_name": "Test Tenant",
        })
        assert res.status_code == 201
        data = res.get_json()
        assert data["name"] == "test-tenant"
        assert data["display_name"] == "Test Tenant"
        assert data["is_active"] is True

    def test_create_tenant_duplicate_name(self, client, admin_headers):
        client.post("/api/admin/tenants", headers=admin_headers, json={
            "name": "dup-tenant",
            "display_name": "First",
        })
        res = client.post("/api/admin/tenants", headers=admin_headers, json={
            "name": "dup-tenant",
            "display_name": "Second",
        })
        assert res.status_code == 409

    def test_create_tenant_invalid_name(self, client, admin_headers):
        res = client.post("/api/admin/tenants", headers=admin_headers, json={
            "name": "Invalid Name!",
            "display_name": "Invalid",
        })
        assert res.status_code == 400

    def test_create_tenant_missing_fields(self, client, admin_headers):
        res = client.post("/api/admin/tenants", headers=admin_headers, json={
            "name": "no-display",
        })
        assert res.status_code == 400

    def test_create_tenant_forbidden_for_tenant_admin(self, client, tenant_admin_headers):
        res = client.post("/api/admin/tenants", headers=tenant_admin_headers, json={
            "name": "forbidden",
            "display_name": "Forbidden",
        })
        assert res.status_code == 403


class TestTenantGet:
    def test_get_tenant(self, client, admin_headers, default_tenant_id):
        res = client.get(f"/api/admin/tenants/{default_tenant_id}", headers=admin_headers)
        assert res.status_code == 200
        assert res.get_json()["name"] == "default"

    def test_get_tenant_not_found(self, client, admin_headers):
        res = client.get("/api/admin/tenants/nonexist", headers=admin_headers)
        assert res.status_code == 404


class TestTenantUpdate:
    def test_update_tenant(self, client, admin_headers):
        # Create a tenant first
        create_res = client.post("/api/admin/tenants", headers=admin_headers, json={
            "name": "upd-tenant",
            "display_name": "Before Update",
        })
        tid = create_res.get_json()["id"]

        res = client.put(f"/api/admin/tenants/{tid}", headers=admin_headers, json={
            "display_name": "After Update",
        })
        assert res.status_code == 200
        assert res.get_json()["display_name"] == "After Update"

    def test_deactivate_tenant(self, client, admin_headers):
        create_res = client.post("/api/admin/tenants", headers=admin_headers, json={
            "name": "deact-tenant",
            "display_name": "Deactivate Me",
        })
        tid = create_res.get_json()["id"]

        res = client.put(f"/api/admin/tenants/{tid}", headers=admin_headers, json={
            "is_active": False,
        })
        assert res.status_code == 200
        assert res.get_json()["is_active"] is False


class TestTenantDelete:
    def test_delete_tenant(self, client, admin_headers, app):
        # Create tenant with users and zones
        create_res = client.post("/api/admin/tenants", headers=admin_headers, json={
            "name": "del-tenant",
            "display_name": "Delete Me",
        })
        tid = create_res.get_json()["id"]

        # Add a user to the tenant
        client.post("/api/admin/users", headers=admin_headers, json={
            "username": "deluser",
            "email": "del@example.com",
            "password": "password123",
            "display_name": "Del User",
            "role": "user",
            "tenant_id": tid,
        })

        res = client.delete(f"/api/admin/tenants/{tid}", headers=admin_headers)
        assert res.status_code == 200

        # Verify cascade
        with app.app_context():
            assert db.session.get(Tenant, tid) is None
            assert User.query.filter_by(username="deluser").first() is None

    def test_delete_default_tenant_forbidden(self, client, admin_headers, default_tenant_id):
        res = client.delete(f"/api/admin/tenants/{default_tenant_id}", headers=admin_headers)
        assert res.status_code == 403

    def test_delete_tenant_not_found(self, client, admin_headers):
        res = client.delete("/api/admin/tenants/nonexist", headers=admin_headers)
        assert res.status_code == 404


# ─── User CRUD Tests ─────────────────────────────────────────


class TestUserList:
    def test_list_users_as_admin(self, client, admin_headers):
        res = client.get("/api/admin/users", headers=admin_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert isinstance(data, list)

    def test_list_users_filter_by_tenant(self, client, admin_headers, default_tenant_id):
        res = client.get(f"/api/admin/users?tenant_id={default_tenant_id}", headers=admin_headers)
        assert res.status_code == 200

    def test_list_users_tenant_admin_sees_own(self, client, tenant_admin_headers, admin_headers, default_tenant_id, second_tenant):
        # Create user in second tenant
        client.post("/api/admin/users", headers=admin_headers, json={
            "username": "other-user",
            "email": "other@example.com",
            "password": "password123",
            "display_name": "Other User",
            "role": "user",
            "tenant_id": second_tenant,
        })

        res = client.get("/api/admin/users", headers=tenant_admin_headers)
        data = res.get_json()
        # tenant_admin should NOT see users from other tenants
        for u in data:
            assert u["tenant_id"] == default_tenant_id or u["tenant_id"] is None

    def test_list_users_forbidden_for_normal_user(self, client, normal_user_headers):
        res = client.get("/api/admin/users", headers=normal_user_headers)
        assert res.status_code == 403


class TestUserCreate:
    def test_create_user(self, client, admin_headers, default_tenant_id):
        res = client.post("/api/admin/users", headers=admin_headers, json={
            "username": "newuser",
            "email": "new@example.com",
            "password": "password123",
            "display_name": "New User",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        assert res.status_code == 201
        data = res.get_json()
        assert data["username"] == "newuser"
        assert data["role"] == "user"

    def test_create_user_duplicate_username(self, client, admin_headers, default_tenant_id):
        client.post("/api/admin/users", headers=admin_headers, json={
            "username": "dupeuser",
            "email": "dupe1@example.com",
            "password": "password123",
            "display_name": "Dupe 1",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        res = client.post("/api/admin/users", headers=admin_headers, json={
            "username": "dupeuser",
            "email": "dupe2@example.com",
            "password": "password123",
            "display_name": "Dupe 2",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        assert res.status_code == 409

    def test_create_user_duplicate_email(self, client, admin_headers, default_tenant_id):
        client.post("/api/admin/users", headers=admin_headers, json={
            "username": "emailuser1",
            "email": "same@example.com",
            "password": "password123",
            "display_name": "Email 1",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        res = client.post("/api/admin/users", headers=admin_headers, json={
            "username": "emailuser2",
            "email": "same@example.com",
            "password": "password123",
            "display_name": "Email 2",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        assert res.status_code == 409

    def test_create_user_short_password(self, client, admin_headers, default_tenant_id):
        res = client.post("/api/admin/users", headers=admin_headers, json={
            "username": "shortpw",
            "email": "short@example.com",
            "password": "short",
            "display_name": "Short PW",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        assert res.status_code == 400

    def test_tenant_admin_cannot_create_super_admin(self, client, tenant_admin_headers, default_tenant_id):
        res = client.post("/api/admin/users", headers=tenant_admin_headers, json={
            "username": "badadmin",
            "email": "bad@example.com",
            "password": "password123",
            "display_name": "Bad Admin",
            "role": "super_admin",
            "tenant_id": default_tenant_id,
        })
        assert res.status_code == 403

    def test_tenant_admin_cannot_create_tenant_admin(self, client, tenant_admin_headers, default_tenant_id):
        res = client.post("/api/admin/users", headers=tenant_admin_headers, json={
            "username": "badtadmin",
            "email": "badt@example.com",
            "password": "password123",
            "display_name": "Bad TAdmin",
            "role": "tenant_admin",
            "tenant_id": default_tenant_id,
        })
        assert res.status_code == 403

    def test_tenant_admin_cannot_create_in_other_tenant(self, client, tenant_admin_headers, second_tenant):
        res = client.post("/api/admin/users", headers=tenant_admin_headers, json={
            "username": "otheruser",
            "email": "other2@example.com",
            "password": "password123",
            "display_name": "Other",
            "role": "user",
            "tenant_id": second_tenant,
        })
        assert res.status_code == 403

    def test_super_admin_can_create_in_any_tenant(self, client, admin_headers, second_tenant):
        res = client.post("/api/admin/users", headers=admin_headers, json={
            "username": "anyuser",
            "email": "any@example.com",
            "password": "password123",
            "display_name": "Any User",
            "role": "user",
            "tenant_id": second_tenant,
        })
        assert res.status_code == 201

    def test_create_user_invalid_role(self, client, admin_headers, default_tenant_id):
        res = client.post("/api/admin/users", headers=admin_headers, json={
            "username": "badrole",
            "email": "badrole@example.com",
            "password": "password123",
            "display_name": "Bad Role",
            "role": "invalid_role",
            "tenant_id": default_tenant_id,
        })
        assert res.status_code == 400


class TestUserGet:
    def test_get_user(self, client, admin_headers, default_tenant_id):
        create_res = client.post("/api/admin/users", headers=admin_headers, json={
            "username": "getme",
            "email": "getme@example.com",
            "password": "password123",
            "display_name": "Get Me",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        uid = create_res.get_json()["id"]

        res = client.get(f"/api/admin/users/{uid}", headers=admin_headers)
        assert res.status_code == 200
        assert res.get_json()["username"] == "getme"

    def test_get_user_not_found(self, client, admin_headers):
        res = client.get("/api/admin/users/nonexist", headers=admin_headers)
        assert res.status_code == 404


class TestUserUpdate:
    def test_update_user(self, client, admin_headers, default_tenant_id):
        create_res = client.post("/api/admin/users", headers=admin_headers, json={
            "username": "upduser",
            "email": "upd@example.com",
            "password": "password123",
            "display_name": "Before",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        uid = create_res.get_json()["id"]

        res = client.put(f"/api/admin/users/{uid}", headers=admin_headers, json={
            "display_name": "After",
        })
        assert res.status_code == 200
        assert res.get_json()["display_name"] == "After"

    def test_deactivate_user(self, client, admin_headers, default_tenant_id):
        create_res = client.post("/api/admin/users", headers=admin_headers, json={
            "username": "deactuser",
            "email": "deact@example.com",
            "password": "password123",
            "display_name": "Deactivate",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        uid = create_res.get_json()["id"]

        res = client.put(f"/api/admin/users/{uid}", headers=admin_headers, json={
            "is_active": False,
        })
        assert res.status_code == 200
        assert res.get_json()["is_active"] is False

    def test_update_user_duplicate_email(self, client, admin_headers, default_tenant_id):
        client.post("/api/admin/users", headers=admin_headers, json={
            "username": "emaildup1",
            "email": "dup@example.com",
            "password": "password123",
            "display_name": "E1",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        create_res = client.post("/api/admin/users", headers=admin_headers, json={
            "username": "emaildup2",
            "email": "nodup@example.com",
            "password": "password123",
            "display_name": "E2",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        uid = create_res.get_json()["id"]

        res = client.put(f"/api/admin/users/{uid}", headers=admin_headers, json={
            "email": "dup@example.com",
        })
        assert res.status_code == 409


class TestUserDelete:
    def test_delete_user(self, client, admin_headers, default_tenant_id):
        create_res = client.post("/api/admin/users", headers=admin_headers, json={
            "username": "delme",
            "email": "delme@example.com",
            "password": "password123",
            "display_name": "Delete Me",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        uid = create_res.get_json()["id"]

        res = client.delete(f"/api/admin/users/{uid}", headers=admin_headers)
        assert res.status_code == 200

        # Verify deleted
        res = client.get(f"/api/admin/users/{uid}", headers=admin_headers)
        assert res.status_code == 404

    def test_cannot_delete_super_admin(self, client, admin_headers, app):
        with app.app_context():
            admin = User.query.filter_by(username="admin").first()
            admin_id = admin.id

        res = client.delete(f"/api/admin/users/{admin_id}", headers=admin_headers)
        assert res.status_code == 403

    def test_delete_user_not_found(self, client, admin_headers):
        res = client.delete("/api/admin/users/nonexist", headers=admin_headers)
        assert res.status_code == 404


class TestPasswordReset:
    def test_reset_password(self, client, admin_headers, default_tenant_id):
        create_res = client.post("/api/admin/users", headers=admin_headers, json={
            "username": "pwreset",
            "email": "pwr@example.com",
            "password": "oldpassword",
            "display_name": "PW Reset",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        uid = create_res.get_json()["id"]

        res = client.post(f"/api/admin/users/{uid}/password", headers=admin_headers, json={
            "new_password": "newpassword123",
        })
        assert res.status_code == 200

        # Verify new password works
        login_res = client.post("/api/auth/login", json={
            "username": "pwreset",
            "password": "newpassword123",
        })
        assert login_res.status_code == 200

    def test_reset_password_too_short(self, client, admin_headers, default_tenant_id):
        create_res = client.post("/api/admin/users", headers=admin_headers, json={
            "username": "pwshort",
            "email": "pws@example.com",
            "password": "password123",
            "display_name": "PW Short",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        uid = create_res.get_json()["id"]

        res = client.post(f"/api/admin/users/{uid}/password", headers=admin_headers, json={
            "new_password": "short",
        })
        assert res.status_code == 400

    def test_reset_password_missing_field(self, client, admin_headers, default_tenant_id):
        create_res = client.post("/api/admin/users", headers=admin_headers, json={
            "username": "pwmiss",
            "email": "pwm@example.com",
            "password": "password123",
            "display_name": "PW Miss",
            "role": "user",
            "tenant_id": default_tenant_id,
        })
        uid = create_res.get_json()["id"]

        res = client.post(f"/api/admin/users/{uid}/password", headers=admin_headers, json={})
        assert res.status_code == 400
