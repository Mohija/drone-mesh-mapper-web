"""Tests for authentication system — login, tokens, decorators."""

import json
import time
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import jwt as pyjwt
from auth import (
    hash_password, check_password, generate_tokens, decode_token,
    JWT_SECRET, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY,
)
from database import db
from models import User, Tenant


@pytest.fixture
def test_user(app, default_tenant_id):
    """Create a test user for auth tests."""
    with app.app_context():
        user = User(
            username="testauth",
            email="testauth@example.com",
            password_hash=hash_password("testpass123"),
            display_name="Test Auth User",
            role="user",
            tenant_id=default_tenant_id,
        )
        db.session.add(user)
        db.session.commit()
        uid = user.id
    yield {"id": uid, "username": "testauth", "password": "testpass123"}
    with app.app_context():
        u = db.session.get(User, uid)
        if u:
            db.session.delete(u)
            db.session.commit()


@pytest.fixture
def admin_user(app):
    """Get the seeded super_admin user."""
    with app.app_context():
        user = User.query.filter_by(username="admin").first()
        return {"id": user.id, "username": "admin", "password": "admin"}


@pytest.fixture
def inactive_user(app, default_tenant_id):
    """Create a deactivated user."""
    with app.app_context():
        user = User(
            username="inactive",
            email="inactive@example.com",
            password_hash=hash_password("pass123"),
            display_name="Inactive User",
            role="user",
            is_active=False,
            tenant_id=default_tenant_id,
        )
        db.session.add(user)
        db.session.commit()
        uid = user.id
    yield {"id": uid, "username": "inactive", "password": "pass123"}
    with app.app_context():
        u = db.session.get(User, uid)
        if u:
            db.session.delete(u)
            db.session.commit()


# ─── Password Hashing Tests ─────────────────────────────────


class TestPasswordHashing:
    def test_hash_and_verify(self):
        hashed = hash_password("mypassword")
        assert check_password("mypassword", hashed) is True

    def test_wrong_password(self):
        hashed = hash_password("correct")
        assert check_password("wrong", hashed) is False

    def test_different_hashes(self):
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2  # bcrypt uses random salt

    def test_both_verify(self):
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert check_password("same", h1) is True
        assert check_password("same", h2) is True


# ─── Token Tests ─────────────────────────────────────────────


class TestTokens:
    def test_generate_tokens(self, app, test_user):
        with app.app_context():
            user = db.session.get(User, test_user["id"])
            tokens = generate_tokens(user)
            assert "access_token" in tokens
            assert "refresh_token" in tokens
            assert tokens["expires_in"] == ACCESS_TOKEN_EXPIRY

    def test_access_token_payload(self, app, test_user):
        with app.app_context():
            user = db.session.get(User, test_user["id"])
            tokens = generate_tokens(user)
            payload = pyjwt.decode(tokens["access_token"], JWT_SECRET, algorithms=[JWT_ALGORITHM])
            assert payload["user_id"] == user.id
            assert payload["username"] == "testauth"
            assert payload["role"] == "user"
            assert payload["type"] == "access"
            assert payload["tenant_id"] == user.tenant_id

    def test_refresh_token_payload(self, app, test_user):
        with app.app_context():
            user = db.session.get(User, test_user["id"])
            tokens = generate_tokens(user)
            payload = pyjwt.decode(tokens["refresh_token"], JWT_SECRET, algorithms=[JWT_ALGORITHM])
            assert payload["user_id"] == user.id
            assert payload["type"] == "refresh"

    def test_decode_valid_token(self, app, test_user):
        with app.app_context():
            user = db.session.get(User, test_user["id"])
            tokens = generate_tokens(user)
            payload = decode_token(tokens["access_token"])
            assert payload is not None
            assert payload["user_id"] == user.id

    def test_decode_expired_token(self):
        payload = {
            "user_id": "test",
            "type": "access",
            "exp": time.time() - 100,
        }
        token = pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        assert decode_token(token) is None

    def test_decode_invalid_token(self):
        assert decode_token("garbage.token.here") is None

    def test_decode_wrong_secret(self):
        payload = {"user_id": "test", "type": "access", "exp": time.time() + 3600}
        token = pyjwt.encode(payload, "wrong-secret", algorithm=JWT_ALGORITHM)
        assert decode_token(token) is None


# ─── Login Endpoint Tests ────────────────────────────────────


class TestLogin:
    def test_login_success(self, client, test_user):
        res = client.post("/api/auth/login", json={
            "username": test_user["username"],
            "password": test_user["password"],
        })
        assert res.status_code == 200
        data = res.get_json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert "user" in data
        assert data["user"]["username"] == "testauth"

    def test_login_wrong_password(self, client, test_user):
        res = client.post("/api/auth/login", json={
            "username": test_user["username"],
            "password": "wrongpass",
        })
        assert res.status_code == 401
        assert "Ungültige" in res.get_json()["error"]

    def test_login_unknown_user(self, client):
        res = client.post("/api/auth/login", json={
            "username": "nonexistent",
            "password": "pass",
        })
        assert res.status_code == 401

    def test_login_inactive_user(self, client, inactive_user):
        res = client.post("/api/auth/login", json={
            "username": inactive_user["username"],
            "password": inactive_user["password"],
        })
        assert res.status_code == 401
        assert "deaktiviert" in res.get_json()["error"]

    def test_login_missing_fields(self, client):
        res = client.post("/api/auth/login", json={"username": "test"})
        assert res.status_code == 400

    def test_login_no_body(self, client):
        res = client.post("/api/auth/login", data="", content_type="application/json")
        assert res.status_code == 400

    def test_login_updates_last_login(self, client, app, test_user):
        client.post("/api/auth/login", json={
            "username": test_user["username"],
            "password": test_user["password"],
        })
        with app.app_context():
            user = db.session.get(User, test_user["id"])
            assert user.last_login is not None
            assert user.last_login > 0

    def test_login_admin(self, client, admin_user):
        res = client.post("/api/auth/login", json={
            "username": admin_user["username"],
            "password": admin_user["password"],
        })
        assert res.status_code == 200
        data = res.get_json()
        assert data["user"]["role"] == "super_admin"

    def test_login_returns_tenant_name(self, client, test_user):
        res = client.post("/api/auth/login", json={
            "username": test_user["username"],
            "password": test_user["password"],
        })
        data = res.get_json()
        assert data["user"]["tenant_name"] == "Standard"


# ─── Refresh Endpoint Tests ─────────────────────────────────


class TestRefresh:
    def test_refresh_success(self, client, test_user):
        login_res = client.post("/api/auth/login", json={
            "username": test_user["username"],
            "password": test_user["password"],
        })
        refresh_token = login_res.get_json()["refresh_token"]

        res = client.post("/api/auth/refresh", json={
            "refresh_token": refresh_token,
        })
        assert res.status_code == 200
        data = res.get_json()
        assert "access_token" in data
        assert "refresh_token" in data

    def test_refresh_invalid_token(self, client):
        res = client.post("/api/auth/refresh", json={
            "refresh_token": "invalid.token.here",
        })
        assert res.status_code == 401

    def test_refresh_expired_token(self, client, app, test_user):
        with app.app_context():
            user = db.session.get(User, test_user["id"])
            payload = {
                "user_id": user.id,
                "type": "refresh",
                "exp": time.time() - 100,
            }
            expired = pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

        res = client.post("/api/auth/refresh", json={
            "refresh_token": expired,
        })
        assert res.status_code == 401

    def test_refresh_with_access_token_rejected(self, client, test_user):
        """Using an access_token for refresh should fail."""
        login_res = client.post("/api/auth/login", json={
            "username": test_user["username"],
            "password": test_user["password"],
        })
        access_token = login_res.get_json()["access_token"]

        res = client.post("/api/auth/refresh", json={
            "refresh_token": access_token,
        })
        assert res.status_code == 401

    def test_refresh_missing_body(self, client):
        res = client.post("/api/auth/refresh", json={})
        assert res.status_code == 400


# ─── /me Endpoint Tests ─────────────────────────────────────


class TestMe:
    def test_me_with_token(self, client, test_user):
        login_res = client.post("/api/auth/login", json={
            "username": test_user["username"],
            "password": test_user["password"],
        })
        token = login_res.get_json()["access_token"]

        res = client.get("/api/auth/me", headers={
            "Authorization": f"Bearer {token}",
        })
        assert res.status_code == 200
        data = res.get_json()
        assert data["username"] == "testauth"
        assert data["tenant_name"] == "Standard"

    def test_me_no_token(self, client):
        res = client.get("/api/auth/me")
        assert res.status_code == 401
        assert "Authentifizierung" in res.get_json()["error"]

    def test_me_invalid_token(self, client):
        res = client.get("/api/auth/me", headers={
            "Authorization": "Bearer invalid.token",
        })
        assert res.status_code == 401

    def test_me_expired_token(self, client, app, test_user):
        with app.app_context():
            user = db.session.get(User, test_user["id"])
            payload = {
                "user_id": user.id,
                "type": "access",
                "username": "testauth",
                "role": "user",
                "tenant_id": user.tenant_id,
                "exp": time.time() - 100,
            }
            expired = pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

        res = client.get("/api/auth/me", headers={
            "Authorization": f"Bearer {expired}",
        })
        assert res.status_code == 401
        assert "abgelaufen" in res.get_json()["error"]


# ─── Decorator Tests ─────────────────────────────────────────


class TestDecorators:
    def _get_token(self, client, username, password):
        res = client.post("/api/auth/login", json={
            "username": username,
            "password": password,
        })
        return res.get_json()["access_token"]

    def test_login_required_sets_g_user(self, client, test_user):
        """login_required should set g.current_user visible via /me."""
        token = self._get_token(client, test_user["username"], test_user["password"])
        res = client.get("/api/auth/me", headers={
            "Authorization": f"Bearer {token}",
        })
        assert res.status_code == 200
        assert res.get_json()["username"] == "testauth"

    def test_no_bearer_prefix(self, client):
        res = client.get("/api/auth/me", headers={
            "Authorization": "Token abc",
        })
        assert res.status_code == 401


# ─── Super Admin Seeding Tests ───────────────────────────────


class TestSuperAdminSeed:
    def test_admin_user_exists(self, app):
        with app.app_context():
            admin = User.query.filter_by(username="admin").first()
            assert admin is not None
            assert admin.role == "super_admin"
            assert admin.tenant_id is None

    def test_admin_can_login(self, client):
        res = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin",
        })
        assert res.status_code == 200
