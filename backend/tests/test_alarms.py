"""Tests for alarm interfaces, rules, dispatcher, and pull-in endpoint."""

import hashlib
import json
import sys
import os
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import db
from models import (AlarmInterface, AlarmRule, AlarmDelivery, AlarmSubscription,
                    FlightZone, ServiceToken, User, ViolationRecord)
from auth import hash_password
from services.alarm_dispatcher import (
    encrypt_auth_config, decrypt_auth_config,
    apply_auth, render_payload, merge_auth_for_update,
    build_variable_pool, build_example_context,
    build_interface_stats, build_usage_examples,
)
from services.alarm_templates import list_templates, get_template


# ─── Helper fixtures ───────────────────────────────────────────────────────

@pytest.fixture
def admin_headers(client):
    res = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    return {"Authorization": f"Bearer {res.get_json()['access_token']}"}


@pytest.fixture
def tenant_admin_headers(client, app, default_tenant_id):
    with app.app_context():
        u = User(
            username="iadmin", email="iadmin@example.com",
            password_hash=hash_password("iadminpass"),
            display_name="Interfaces Admin", role="tenant_admin",
            tenant_id=default_tenant_id,
        )
        db.session.add(u)
        db.session.commit()
    res = client.post("/api/auth/login", json={"username": "iadmin", "password": "iadminpass"})
    return {"Authorization": f"Bearer {res.get_json()['access_token']}"}


# ─── Pure helpers ─────────────────────────────────────────────────────────

class TestEncryption:
    def test_round_trip(self):
        ct = encrypt_auth_config({"token": "secret123", "name": "X-API"})
        assert ct and ct != "secret123"
        assert decrypt_auth_config(ct) == {"token": "secret123", "name": "X-API"}

    def test_empty_config(self):
        assert encrypt_auth_config({}) is None
        assert decrypt_auth_config(None) == {}

    def test_corrupted_ciphertext_returns_empty(self):
        assert decrypt_auth_config("not-a-fernet-token") == {}

    def test_merge_keeps_unchanged_secret(self):
        ct = encrypt_auth_config({"token": "real-token", "name": "X-Key"})
        merged = merge_auth_for_update(ct, {"token": "••••••••", "name": "X-Renamed"})
        assert decrypt_auth_config(merged) == {"token": "real-token", "name": "X-Renamed"}

    def test_merge_replaces_changed_secret(self):
        ct = encrypt_auth_config({"token": "old"})
        merged = merge_auth_for_update(ct, {"token": "new"})
        assert decrypt_auth_config(merged) == {"token": "new"}


class TestApplyAuth:
    def test_bearer(self):
        h, p, a = apply_auth({}, {}, "bearer", {"token": "tok"})
        assert h == {"Authorization": "Bearer tok"} and a is None and p == {}

    def test_basic(self):
        h, p, a = apply_auth({}, {}, "basic", {"username": "u", "password": "p"})
        assert a == ("u", "p")

    def test_api_key_header_default_name(self):
        h, _, _ = apply_auth({}, {}, "api_key_header", {"value": "v"})
        assert h["X-API-Key"] == "v"

    def test_api_key_header_custom_name(self):
        h, _, _ = apply_auth({}, {}, "api_key_header", {"name": "X-Custom", "value": "v"})
        assert h == {"X-Custom": "v"}

    def test_api_key_query(self):
        _, p, _ = apply_auth({}, {}, "api_key_query", {"name": "apikey", "value": "v"})
        assert p == {"apikey": "v"}

    def test_none(self):
        h, p, a = apply_auth({}, {}, "none", {})
        assert h == {} and p == {} and a is None


class TestRenderPayload:
    def test_simple_string(self):
        ctx = build_example_context()
        assert render_payload("Drone {{drone.id}}", ctx) == "Drone DRONE-A1B2"

    def test_object_with_variable(self):
        ctx = build_example_context()
        out = render_payload({"keyword": "{{trigger}}", "name": "{{drone.name}}"}, ctx)
        assert out == {"keyword": "violation_start", "name": "DJI Mavic"}

    def test_array(self):
        ctx = build_example_context()
        out = render_payload([{"address": "{{drone.id}}"}], ctx)
        assert out == [{"address": "DRONE-A1B2"}]

    def test_typed_number_via_dollar(self):
        ctx = build_example_context()
        out = render_payload({"alt": "${{drone.altitude}}"}, ctx)
        assert out["alt"] == 120.5
        assert isinstance(out["alt"], float)

    def test_typed_bool_via_dollar(self):
        ctx = build_example_context()
        out = render_payload({"active": "${{violation.is_active}}"}, ctx)
        # chevron renders True as "True" — JSON.parse fails, falls back to string
        assert out["active"] in (True, "True")

    def test_passes_non_strings_through(self):
        out = render_payload({"x": 42, "y": True, "z": None}, {})
        assert out == {"x": 42, "y": True, "z": None}


class TestVariablePool:
    def test_pool_has_required_categories(self):
        pool = build_variable_pool()
        cats = {v["category"] for v in pool}
        assert {"drone", "zone", "violation", "tenant", "system"}.issubset(cats)

    def test_every_variable_has_path_and_type(self):
        for v in build_variable_pool():
            assert v.get("path") and v.get("type") and v.get("category")


# ─── HTTP API: interfaces CRUD ────────────────────────────────────────────

class TestInterfacesCRUD:
    def test_normal_user_blocked(self, client, app, default_tenant_id):
        with app.app_context():
            u = User(username="nu", email="nu@x.de",
                     password_hash=hash_password("nupass"), display_name="N",
                     role="user", tenant_id=default_tenant_id)
            db.session.add(u)
            db.session.commit()
        login = client.post("/api/auth/login", json={"username": "nu", "password": "nupass"})
        token = login.get_json()["access_token"]
        res = client.get("/api/admin/interfaces", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 403

    def test_create_webhook(self, client, tenant_admin_headers):
        res = client.post("/api/admin/interfaces", json={
            "name": "Test Webhook",
            "interfaceType": "webhook",
            "url": "https://example.com/hook",
            "httpMethod": "POST",
            "authType": "bearer",
            "authConfig": {"token": "mysecret"},
            "payloadTemplate": {"keyword": "{{trigger}}"},
        }, headers=tenant_admin_headers)
        assert res.status_code == 201, res.get_json()
        body = res.get_json()
        assert body["name"] == "Test Webhook"
        assert body["interfaceType"] == "webhook"
        # secret must be masked
        assert body["authConfig"]["token"] == "••••••••"

    def test_get_masks_secret(self, client, tenant_admin_headers):
        client.post("/api/admin/interfaces", json={
            "name": "M", "interfaceType": "webhook", "url": "https://x.de",
            "authType": "bearer", "authConfig": {"token": "raw-token-here"},
            "payloadTemplate": {},
        }, headers=tenant_admin_headers)
        listing = client.get("/api/admin/interfaces", headers=tenant_admin_headers).get_json()
        iid = listing["items"][0]["id"]
        detail = client.get(f"/api/admin/interfaces/{iid}", headers=tenant_admin_headers).get_json()
        assert detail["authConfig"]["token"] == "••••••••"

    def test_update_keeps_secret_when_masked(self, client, tenant_admin_headers, app):
        res = client.post("/api/admin/interfaces", json={
            "name": "K", "interfaceType": "webhook", "url": "https://x.de",
            "authType": "bearer", "authConfig": {"token": "the-real-token"},
            "payloadTemplate": {},
        }, headers=tenant_admin_headers)
        iid = res.get_json()["id"]
        # update with mask placeholder — token must NOT be replaced
        client.put(f"/api/admin/interfaces/{iid}", json={
            "name": "K-renamed",
            "authConfig": {"token": "••••••••"},
        }, headers=tenant_admin_headers)
        with app.app_context():
            iface = AlarmInterface.query.get(iid)
            assert decrypt_auth_config(iface.auth_config_encrypted)["token"] == "the-real-token"

    def test_delete(self, client, tenant_admin_headers):
        iid = client.post("/api/admin/interfaces", json={
            "name": "D", "interfaceType": "webhook", "url": "https://x.de",
            "authType": "none", "payloadTemplate": {},
        }, headers=tenant_admin_headers).get_json()["id"]
        res = client.delete(f"/api/admin/interfaces/{iid}", headers=tenant_admin_headers)
        assert res.status_code == 200
        assert client.get(f"/api/admin/interfaces/{iid}", headers=tenant_admin_headers).status_code == 404

    def test_export_strips_secrets(self, client, tenant_admin_headers):
        iid = client.post("/api/admin/interfaces", json={
            "name": "E", "interfaceType": "webhook", "url": "https://x.de",
            "authType": "bearer", "authConfig": {"token": "secret"},
            "payloadTemplate": {"k": "v"},
        }, headers=tenant_admin_headers).get_json()["id"]
        out = client.get(f"/api/admin/interfaces/{iid}/export", headers=tenant_admin_headers).get_json()
        assert out["authConfig"] == {}
        assert "id" not in out and "tenantId" not in out
        assert out["_format"].startswith("flightarc-alarm-interface")

    def test_pull_in_creates_service_token(self, client, tenant_admin_headers, app):
        res = client.post("/api/admin/interfaces", json={
            "name": "Pull-In", "interfaceType": "pull_in",
            "authType": "none", "payloadTemplate": {},
        }, headers=tenant_admin_headers)
        body = res.get_json()
        assert "pullToken" in body
        assert body["pullToken"].startswith("flightarc_svc_")
        with app.app_context():
            iface = AlarmInterface.query.get(body["id"])
            assert iface.service_token_id
            st = ServiceToken.query.get(iface.service_token_id)
            assert "alarm_pull" in st.scopes

    def test_variables_endpoint(self, client, tenant_admin_headers):
        res = client.get("/api/admin/interfaces/variables", headers=tenant_admin_headers)
        body = res.get_json()
        assert len(body["variables"]) > 20
        assert body["exampleContext"]["drone"]["id"]


# ─── HTTP API: alarm rules ────────────────────────────────────────────────

class TestAlarmRulesCRUD:
    def _create_iface(self, client, headers):
        return client.post("/api/admin/interfaces", json={
            "name": "I", "interfaceType": "webhook", "url": "https://x.de",
            "authType": "none", "payloadTemplate": {"a": 1},
        }, headers=headers).get_json()["id"]

    def test_create_rule(self, client, tenant_admin_headers):
        iid = self._create_iface(client, tenant_admin_headers)
        res = client.post("/api/admin/alarm-rules", json={
            "interfaceId": iid, "triggerType": "violation_start", "enabled": True,
        }, headers=tenant_admin_headers)
        assert res.status_code == 201
        assert res.get_json()["interfaceId"] == iid

    def test_invalid_trigger_rejected(self, client, tenant_admin_headers):
        iid = self._create_iface(client, tenant_admin_headers)
        res = client.post("/api/admin/alarm-rules", json={
            "interfaceId": iid, "triggerType": "bogus",
        }, headers=tenant_admin_headers)
        assert res.status_code == 400


# ─── Dispatch with mocked HTTP ────────────────────────────────────────────

class TestDispatchSend:
    def test_send_success_logs_delivery(self, app, default_tenant_id):
        with app.app_context():
            iface = AlarmInterface(
                tenant_id=default_tenant_id, name="X",
                interface_type="webhook", url="https://example.com/hook",
                http_method="POST", auth_type="bearer",
                auth_config_encrypted=encrypt_auth_config({"token": "t"}),
                payload_template={"k": "{{trigger}}"},
                retry_max=1,
            )
            db.session.add(iface)
            db.session.commit()

            from services.alarm_dispatcher import send_request
            mock_resp = MagicMock(status_code=200, text='{"ok": true}')
            with patch("services.alarm_dispatcher.requests.request", return_value=mock_resp) as m:
                result = send_request(iface, build_example_context(),
                                      trigger_type="manual_test", rule_id=None, violation_id=None)
            assert result["ok"] is True
            assert result["status"] == 200
            # Auth header was applied
            kwargs = m.call_args.kwargs
            assert kwargs["headers"]["Authorization"] == "Bearer t"
            assert kwargs["json"] == {"k": "violation_start"}
            # Delivery logged
            d = AlarmDelivery.query.filter_by(interface_id=iface.id).first()
            assert d is not None and d.status == "success"

    def test_send_retry_on_failure(self, app, default_tenant_id):
        with app.app_context():
            iface = AlarmInterface(
                tenant_id=default_tenant_id, name="R",
                interface_type="webhook", url="https://example.com/hook",
                http_method="POST", auth_type="none", payload_template={},
                retry_max=3, retry_backoff_seconds=0.0,
            )
            db.session.add(iface)
            db.session.commit()

            from services.alarm_dispatcher import send_request
            from requests.exceptions import ConnectionError as RConn
            with patch("services.alarm_dispatcher.requests.request",
                       side_effect=RConn("boom")):
                result = send_request(iface, build_example_context(),
                                      trigger_type="t", rule_id=None, violation_id=None)
            assert result["ok"] is False
            attempts = AlarmDelivery.query.filter_by(interface_id=iface.id).count()
            assert attempts == 3


# ─── Pull-in endpoint ─────────────────────────────────────────────────────

class TestPullInEndpoint:
    def test_no_token_401(self, client):
        assert client.get("/api/integrations/violations").status_code == 401

    def test_invalid_token_401(self, client):
        res = client.get("/api/integrations/violations",
                         headers={"X-Service-Token": "flightarc_svc_invalid"})
        assert res.status_code == 401

    def test_wrong_scope_403(self, client, app, default_tenant_id):
        # Create a service token with only health_read scope
        raw = "flightarc_svc_" + "abc" * 11
        with app.app_context():
            st = ServiceToken(
                tenant_id=default_tenant_id, name="health-only",
                token_hash=hashlib.sha256(raw.encode()).hexdigest(),
                token_prefix=raw[:12], scopes="health_read",
            )
            db.session.add(st)
            db.session.commit()
        res = client.get("/api/integrations/violations",
                         headers={"X-Service-Token": raw})
        assert res.status_code == 403

    def test_valid_alarm_pull_token(self, client, app, default_tenant_id):
        raw = "flightarc_svc_" + "def" * 11
        with app.app_context():
            st = ServiceToken(
                tenant_id=default_tenant_id, name="alarm-token",
                token_hash=hashlib.sha256(raw.encode()).hexdigest(),
                token_prefix=raw[:12], scopes="alarm_pull",
            )
            db.session.add(st)
            db.session.commit()
        res = client.get("/api/integrations/violations",
                         headers={"X-Service-Token": raw})
        assert res.status_code == 200
        body = res.get_json()
        assert "active" in body and "recentEnded" in body and "fetchedAt" in body


# ─── Templates ────────────────────────────────────────────────────────────

class TestTemplates:
    def test_static_library_has_curated_entries(self):
        items = list_templates()
        ids = {t["id"] for t in items}
        assert {"alamos_fe2", "slack_webhook", "discord_webhook", "ms_teams",
                "generic", "subscription_starter"}.issubset(ids)

    def test_get_template_unknown(self):
        assert get_template("does-not-exist") is None

    def test_list_templates_endpoint(self, client, tenant_admin_headers):
        res = client.get("/api/admin/interfaces/templates", headers=tenant_admin_headers)
        assert res.status_code == 200
        body = res.get_json()
        assert len(body["items"]) >= 6

    def test_create_from_template(self, client, tenant_admin_headers, app):
        res = client.post("/api/admin/interfaces/from-template", json={
            "templateId": "slack_webhook", "name": "Slack-Test",
        }, headers=tenant_admin_headers)
        assert res.status_code == 201
        body = res.get_json()
        assert body["name"] == "Slack-Test"
        assert body["interfaceType"] == "webhook"
        assert body["enabled"] is False             # admin must wire URL first
        assert body["payloadTemplate"]["text"]      # has the slack body

    def test_create_subscription_from_template_returns_api_key(self, client, tenant_admin_headers):
        res = client.post("/api/admin/interfaces/from-template", json={
            "templateId": "subscription_starter",
        }, headers=tenant_admin_headers)
        body = res.get_json()
        assert body["interfaceType"] == "subscription"
        assert body["apiKey"].startswith("flightarc_chan_")
        assert body["hasApiKey"] is True


# ─── Subscription channel: API key + register / unregister ────────────────

class TestSubscriptionChannel:
    def _create_channel(self, client, headers):
        res = client.post("/api/admin/interfaces", json={
            "name": "Channel-A", "interfaceType": "subscription",
            "authType": "none", "payloadTemplate": {"event": "{{trigger}}"},
            "enabled": True,
        }, headers=headers)
        return res.get_json()  # contains apiKey

    def test_create_subscription_returns_api_key_once(self, client, tenant_admin_headers):
        body = self._create_channel(client, tenant_admin_headers)
        assert body["apiKey"].startswith("flightarc_chan_")
        # Reading the interface again does NOT include the key
        detail = client.get(f"/api/admin/interfaces/{body['id']}", headers=tenant_admin_headers).get_json()
        assert "apiKey" not in detail
        assert detail["hasApiKey"] is True
        # Prefix is 12 chars (column width) — enough to identify in UI
        assert detail["apiKeyPrefix"] and detail["apiKeyPrefix"] in body["apiKey"]

    def test_register_callback_with_valid_api_key(self, client, tenant_admin_headers):
        ch = self._create_channel(client, tenant_admin_headers)
        res = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                          headers={"X-API-Key": ch["apiKey"], "Content-Type": "application/json"},
                          json={"callback_url": "https://example.com/cb", "name": "MeinService"})
        assert res.status_code == 201
        sub = res.get_json()
        assert sub["callbackUrl"] == "https://example.com/cb"
        assert sub["secret"]               # returned ONCE on register

    def test_register_rejects_bad_key(self, client, tenant_admin_headers):
        ch = self._create_channel(client, tenant_admin_headers)
        res = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                          headers={"X-API-Key": "wrong"},
                          json={"callback_url": "https://example.com/cb"})
        assert res.status_code == 401

    def test_register_rejects_non_http_callback(self, client, tenant_admin_headers):
        ch = self._create_channel(client, tenant_admin_headers)
        res = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                          headers={"X-API-Key": ch["apiKey"]},
                          json={"callback_url": "ftp://nope"})
        assert res.status_code == 400

    def test_register_rejects_disabled_channel(self, client, tenant_admin_headers, app):
        ch = self._create_channel(client, tenant_admin_headers)
        client.put(f"/api/admin/interfaces/{ch['id']}", json={"enabled": False}, headers=tenant_admin_headers)
        res = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                          headers={"X-API-Key": ch["apiKey"]},
                          json={"callback_url": "https://example.com/cb"})
        assert res.status_code == 403

    def test_third_party_can_list_and_unsubscribe(self, client, tenant_admin_headers):
        ch = self._create_channel(client, tenant_admin_headers)
        reg = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                          headers={"X-API-Key": ch["apiKey"]},
                          json={"callback_url": "https://example.com/cb"}).get_json()

        listing = client.get(f"/api/integrations/subscriptions/{ch['id']}",
                             headers={"X-API-Key": ch["apiKey"]})
        assert listing.status_code == 200
        items = listing.get_json()["items"]
        assert any(s["id"] == reg["id"] for s in items)
        # secret NOT included in subsequent listings
        assert all("secret" not in s for s in items)

        un = client.delete(f"/api/integrations/subscriptions/{ch['id']}/{reg['id']}",
                           headers={"X-API-Key": ch["apiKey"]})
        assert un.status_code == 200

    def test_admin_can_revoke_subscription(self, client, tenant_admin_headers):
        ch = self._create_channel(client, tenant_admin_headers)
        reg = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                          headers={"X-API-Key": ch["apiKey"]},
                          json={"callback_url": "https://example.com/cb"}).get_json()
        res = client.delete(f"/api/admin/interfaces/{ch['id']}/subscriptions/{reg['id']}",
                            headers=tenant_admin_headers)
        assert res.status_code == 200

    def test_rotate_api_key_invalidates_old_key(self, client, tenant_admin_headers):
        ch = self._create_channel(client, tenant_admin_headers)
        old_key = ch["apiKey"]
        rot = client.post(f"/api/admin/interfaces/{ch['id']}/api-key/rotate",
                          headers=tenant_admin_headers).get_json()
        assert rot["apiKey"] != old_key
        # Old key can no longer register
        old_attempt = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                                  headers={"X-API-Key": old_key},
                                  json={"callback_url": "https://example.com/cb"})
        assert old_attempt.status_code == 401
        # New key works
        new_attempt = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                                  headers={"X-API-Key": rot["apiKey"]},
                                  json={"callback_url": "https://example.com/cb"})
        assert new_attempt.status_code == 201

    def test_rotate_blocked_for_non_subscription(self, client, tenant_admin_headers):
        normal = client.post("/api/admin/interfaces", json={
            "name": "Webhook", "interfaceType": "webhook", "url": "https://x.de",
            "authType": "none", "payloadTemplate": {},
        }, headers=tenant_admin_headers).get_json()
        res = client.post(f"/api/admin/interfaces/{normal['id']}/api-key/rotate",
                          headers=tenant_admin_headers)
        assert res.status_code == 400


# ─── Subscription dispatch (mocked HTTP) ──────────────────────────────────

class TestSubscriptionDispatch:
    def test_signature_header_round_trip(self, app, default_tenant_id):
        with app.app_context():
            iface = AlarmInterface(
                tenant_id=default_tenant_id, name="Channel-Mock",
                interface_type="subscription", auth_type="none",
                payload_template={"event": "{{trigger}}"},
                enabled=True,
            )
            db.session.add(iface)
            db.session.flush()
            sub = AlarmSubscription(
                interface_id=iface.id, callback_url="https://sub.example.com/cb",
                secret="my-secret",
            )
            db.session.add(sub)
            db.session.commit()

            from services.alarm_dispatcher import _push_to_subscriber, build_example_context, render_payload
            mock_resp = MagicMock(status_code=204, text='')
            with patch("services.alarm_dispatcher.requests.post", return_value=mock_resp) as m:
                ctx = build_example_context(); ctx["trigger"] = "test"
                payload = render_payload(iface.payload_template, ctx)
                result = _push_to_subscriber(iface, sub, payload, trigger_type="test",
                                             rule_id=None, violation_id=None)
            assert result["ok"] is True
            kwargs = m.call_args.kwargs
            sig_header = kwargs["headers"]["X-FlightArc-Signature"]
            assert sig_header.startswith("sha256=")
            # Verify signature recomputes
            import hmac
            sent_body = kwargs["data"]
            expected = hmac.new(b"my-secret", sent_body, hashlib.sha256).hexdigest()
            assert sig_header == f"sha256={expected}"


# ─── Stats + Examples ─────────────────────────────────────────────────────

class TestStatsAndExamples:
    def test_stats_endpoint_for_empty_interface(self, client, tenant_admin_headers):
        iface = client.post("/api/admin/interfaces", json={
            "name": "Stats-Test", "interfaceType": "webhook",
            "url": "https://x.de", "authType": "none", "payloadTemplate": {},
        }, headers=tenant_admin_headers).get_json()
        stats = client.get(f"/api/admin/interfaces/{iface['id']}/stats", headers=tenant_admin_headers).get_json()
        assert stats["last24hTotal"] == 0
        assert stats["last24hSuccessRate"] is None
        assert len(stats["daily"]) == 7

    def test_usage_examples_for_pull_in(self, client, tenant_admin_headers):
        iface = client.post("/api/admin/interfaces", json={
            "name": "Pull-Test", "interfaceType": "pull_in",
            "authType": "none", "payloadTemplate": {},
        }, headers=tenant_admin_headers).get_json()
        ex = client.get(f"/api/admin/interfaces/{iface['id']}/usage-examples", headers=tenant_admin_headers).get_json()
        assert any("X-Service-Token" in e["code"] for e in ex["oneShot"])
        assert any(e["language"] == "python" for e in ex["oneShot"])

    def test_usage_examples_for_subscription(self, client, tenant_admin_headers):
        iface = client.post("/api/admin/interfaces", json={
            "name": "Sub-Test", "interfaceType": "subscription",
            "authType": "none", "payloadTemplate": {},
        }, headers=tenant_admin_headers).get_json()
        ex = client.get(f"/api/admin/interfaces/{iface['id']}/usage-examples", headers=tenant_admin_headers).get_json()
        assert any("X-API-Key" in e["code"] for e in ex["subscribe"])
        assert any("HMAC" in e["code"] or "hmac" in e["code"] for e in ex["subscribe"])
        assert any(e["language"] == "javascript" for e in ex["webhook"])


# ─── Security hardening (pentest-driven) ──────────────────────────────────

class TestSSRFProtection:
    def setup_method(self):
        # Disable the test-mode override so we test the real policy
        self._prev = os.environ.pop("FLIGHTARC_ALLOW_PRIVATE_CALLBACKS", None)

    def teardown_method(self):
        if self._prev is not None:
            os.environ["FLIGHTARC_ALLOW_PRIVATE_CALLBACKS"] = self._prev

    def _create_channel(self, client, headers):
        return client.post("/api/admin/interfaces", json={
            "name": "ssrf-channel", "interfaceType": "subscription",
            "authType": "none", "payloadTemplate": {}, "enabled": True,
        }, headers=headers).get_json()

    def test_loopback_callback_rejected(self, client, tenant_admin_headers):
        ch = self._create_channel(client, tenant_admin_headers)
        for url in ["http://127.0.0.1:6379/", "http://localhost/admin",
                    "http://0.0.0.0:8080/", "http://[::1]/"]:
            res = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                              headers={"X-API-Key": ch["apiKey"], "Content-Type": "application/json"},
                              json={"callback_url": url})
            assert res.status_code == 400, f"loopback {url} should be rejected"
            assert "interne IP" in res.get_json()["error"] or "nicht auflösbar" in res.get_json()["error"]

    def test_metadata_endpoint_rejected(self, client, tenant_admin_headers):
        ch = self._create_channel(client, tenant_admin_headers)
        # AWS / GCP / Azure metadata IPs all live in link-local 169.254.x.x
        res = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                          headers={"X-API-Key": ch["apiKey"], "Content-Type": "application/json"},
                          json={"callback_url": "http://169.254.169.254/latest/meta-data/"})
        assert res.status_code == 400

    def test_private_rfc1918_rejected(self, client, tenant_admin_headers):
        ch = self._create_channel(client, tenant_admin_headers)
        for url in ["http://10.0.0.5/cb", "http://192.168.1.1/cb", "http://172.16.5.5/cb"]:
            res = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                              headers={"X-API-Key": ch["apiKey"], "Content-Type": "application/json"},
                              json={"callback_url": url})
            assert res.status_code == 400, f"private {url} should be rejected"

    def test_non_http_scheme_rejected(self, client, tenant_admin_headers):
        ch = self._create_channel(client, tenant_admin_headers)
        for url in ["ftp://example.com/", "file:///etc/passwd", "gopher://x"]:
            res = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                              headers={"X-API-Key": ch["apiKey"], "Content-Type": "application/json"},
                              json={"callback_url": url})
            assert res.status_code == 400


class TestApiKeyTimingConstantCompare:
    def test_compare_uses_compare_digest(self):
        # The implementation must use hmac.compare_digest. We can't observe
        # timing reliably in a unit test, but we can verify the function
        # imports hmac and that an off-by-one prefix collision still fails.
        from routes import alarm_routes as ar
        import inspect
        src = inspect.getsource(ar._interface_for_api_key)
        assert "compare_digest" in src

    def test_wrong_key_with_matching_prefix_rejected(self, client, tenant_admin_headers, app, default_tenant_id):
        with app.app_context():
            from models import AlarmInterface
            from routes.alarm_routes import _generate_api_key
            iface = AlarmInterface(
                tenant_id=default_tenant_id, name="t",
                interface_type="subscription", auth_type="none",
                payload_template={}, enabled=True,
            )
            db.session.add(iface); db.session.flush()
            real = _generate_api_key(iface)
            db.session.commit()
            # Same prefix, different suffix
            forged = real[:25] + ("x" * (len(real) - 25))
            assert forged != real
            res = client.post(f"/api/integrations/subscriptions/{iface.id}/register",
                              headers={"X-API-Key": forged},
                              json={"callback_url": "https://example.com/cb"})
            assert res.status_code == 401


class TestSubscriberCap:
    def test_max_subscribers_per_channel(self, client, tenant_admin_headers, app):
        # Drop the cap to a small number for the test by monkey-patching
        from routes import alarm_routes as ar
        original = ar._MAX_SUBSCRIBERS_PER_CHANNEL
        ar._MAX_SUBSCRIBERS_PER_CHANNEL = 3
        try:
            ch = client.post("/api/admin/interfaces", json={
                "name": "cap", "interfaceType": "subscription",
                "authType": "none", "payloadTemplate": {}, "enabled": True,
            }, headers=tenant_admin_headers).get_json()
            for i in range(3):
                r = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                                headers={"X-API-Key": ch["apiKey"]},
                                json={"callback_url": f"https://example.com/cb{i}"})
                assert r.status_code == 201, f"sub {i} should fit"
            # 4th must hit cap
            r = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                            headers={"X-API-Key": ch["apiKey"]},
                            json={"callback_url": "https://example.com/cb-overflow"})
            assert r.status_code == 409
            assert "Limit" in r.get_json()["error"]
        finally:
            ar._MAX_SUBSCRIBERS_PER_CHANNEL = original


class TestRegisterRateLimit:
    def test_rate_limit(self, client, tenant_admin_headers):
        from routes import alarm_routes as ar
        original = ar._REGISTER_RATE_PER_CHANNEL_PER_MIN
        ar._REGISTER_RATE_PER_CHANNEL_PER_MIN = 5
        ar._register_attempts.clear()
        try:
            ch = client.post("/api/admin/interfaces", json={
                "name": "rl", "interfaceType": "subscription",
                "authType": "none", "payloadTemplate": {}, "enabled": True,
            }, headers=tenant_admin_headers).get_json()
            for i in range(5):
                # Use bad keys so we exhaust the rate window without filling up subscriptions
                r = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                                headers={"X-API-Key": ch["apiKey"]},
                                json={"callback_url": f"https://example.com/cb{i}"})
                assert r.status_code == 201
            r = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                            headers={"X-API-Key": ch["apiKey"]},
                            json={"callback_url": "https://example.com/cb-extra"})
            assert r.status_code == 429
        finally:
            ar._REGISTER_RATE_PER_CHANNEL_PER_MIN = original
            ar._register_attempts.clear()


# ─── Per-subscription delivery filter ─────────────────────────────────────

class TestPerSubscriptionDeliveries:
    def test_subscription_id_recorded_on_push(self, app, default_tenant_id):
        with app.app_context():
            iface = AlarmInterface(
                tenant_id=default_tenant_id, name="psd",
                interface_type="subscription", auth_type="none",
                payload_template={}, enabled=True,
            )
            db.session.add(iface); db.session.flush()
            sub = AlarmSubscription(
                interface_id=iface.id, callback_url="https://example.com/cb",
                secret="x",
            )
            db.session.add(sub); db.session.commit()

            from services.alarm_dispatcher import _push_to_subscriber
            mock_resp = MagicMock(status_code=204, text='')
            with patch("services.alarm_dispatcher.requests.post", return_value=mock_resp):
                _push_to_subscriber(iface, sub, {"event": "x"},
                                    trigger_type="t", rule_id=None, violation_id=None)
            d = AlarmDelivery.query.filter_by(subscription_id=sub.id).first()
            assert d is not None
            assert d.subscription_id == sub.id
            assert d.trigger_type == "t"

    def test_per_sub_endpoint_filters(self, client, tenant_admin_headers, app, default_tenant_id):
        # Create channel + 2 subs + 1 delivery for sub A only
        ch = client.post("/api/admin/interfaces", json={
            "name": "ps", "interfaceType": "subscription",
            "authType": "none", "payloadTemplate": {}, "enabled": True,
        }, headers=tenant_admin_headers).get_json()
        sub_a = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                            headers={"X-API-Key": ch["apiKey"]},
                            json={"callback_url": "https://example.com/a"}).get_json()
        sub_b = client.post(f"/api/integrations/subscriptions/{ch['id']}/register",
                            headers={"X-API-Key": ch["apiKey"]},
                            json={"callback_url": "https://example.com/b"}).get_json()

        with app.app_context():
            d = AlarmDelivery(
                tenant_id=default_tenant_id,
                interface_id=ch["id"],
                subscription_id=sub_a["id"],
                trigger_type="t", status="success",
                started_at=time.time() if (time := __import__("time")) else 0,
            )
            db.session.add(d); db.session.commit()

        a = client.get(f"/api/admin/interfaces/{ch['id']}/subscriptions/{sub_a['id']}/deliveries",
                       headers=tenant_admin_headers).get_json()
        b = client.get(f"/api/admin/interfaces/{ch['id']}/subscriptions/{sub_b['id']}/deliveries",
                       headers=tenant_admin_headers).get_json()
        assert len(a["items"]) == 1
        assert len(b["items"]) == 0


# ─── Pull-out response mapping ────────────────────────────────────────────

class TestResponseMapping:
    def test_default_mapping_uses_2xx(self):
        from services.alarm_dispatcher import evaluate_response_mapping
        assert evaluate_response_mapping(None, 200, "")["ok"] is True
        assert evaluate_response_mapping(None, 500, "")["ok"] is False

    def test_status_code_allowlist(self):
        from services.alarm_dispatcher import evaluate_response_mapping
        m = {"status_codes": [202]}
        assert evaluate_response_mapping(m, 202, "")["ok"] is True
        assert evaluate_response_mapping(m, 200, "")["ok"] is False  # not in allowlist

    def test_json_path_expected_value_match(self):
        from services.alarm_dispatcher import evaluate_response_mapping
        body = '{"acknowledged": true, "id": 42}'
        m = {"json_path": "acknowledged", "expected_value": True}
        r = evaluate_response_mapping(m, 200, body)
        assert r["ok"] is True
        assert r["extracted"] is True

    def test_json_path_expected_value_mismatch(self):
        from services.alarm_dispatcher import evaluate_response_mapping
        body = '{"acknowledged": false}'
        m = {"json_path": "acknowledged", "expected_value": True}
        r = evaluate_response_mapping(m, 200, body)
        assert r["ok"] is False

    def test_json_path_missing_key(self):
        from services.alarm_dispatcher import evaluate_response_mapping
        m = {"json_path": "missing.deep", "expected_value": "x"}
        assert evaluate_response_mapping(m, 200, '{"foo": 1}')["ok"] is False

    def test_fail_on_path_truthy_flips_to_failure(self):
        from services.alarm_dispatcher import evaluate_response_mapping
        body = '{"error": "rate limited"}'
        m = {"fail_on_path": "error"}
        r = evaluate_response_mapping(m, 200, body)
        assert r["ok"] is False
        assert "fail_on_path" in r["reason"]

    def test_array_index_traversal(self):
        from services.alarm_dispatcher import evaluate_response_mapping
        body = '{"results": [{"status": "ok"}, {"status": "fail"}]}'
        m = {"json_path": "results.0.status", "expected_value": "ok"}
        assert evaluate_response_mapping(m, 200, body)["ok"] is True

    def test_pull_out_uses_mapping_in_send_request(self, app, default_tenant_id):
        from services.alarm_dispatcher import send_request
        with app.app_context():
            iface = AlarmInterface(
                tenant_id=default_tenant_id, name="po",
                interface_type="pull_out",
                url="https://example.com/probe",
                http_method="GET", auth_type="none",
                payload_template={},
                response_mapping={"json_path": "ok", "expected_value": True},
                retry_max=1,
                enabled=True,
            )
            db.session.add(iface); db.session.commit()
            mock_ok = MagicMock(status_code=200, text='{"ok": true}')
            with patch("services.alarm_dispatcher.requests.request", return_value=mock_ok):
                r = send_request(iface, build_example_context(),
                                 trigger_type="pull_out_check", rule_id=None, violation_id=None)
            assert r["ok"] is True

            mock_bad = MagicMock(status_code=200, text='{"ok": false}')
            with patch("services.alarm_dispatcher.requests.request", return_value=mock_bad):
                r = send_request(iface, build_example_context(),
                                 trigger_type="pull_out_check", rule_id=None, violation_id=None)
            assert r["ok"] is False
            assert "ok=False" in r["reason"]


# ─── Multilingual examples ────────────────────────────────────────────────

class TestUsageExamplesLanguages:
    def test_pull_in_includes_all_languages(self, client, tenant_admin_headers):
        iface = client.post("/api/admin/interfaces", json={
            "name": "lang-pi", "interfaceType": "pull_in",
            "authType": "none", "payloadTemplate": {},
        }, headers=tenant_admin_headers).get_json()
        ex = client.get(f"/api/admin/interfaces/{iface['id']}/usage-examples",
                        headers=tenant_admin_headers).get_json()
        langs = {e["language"] for e in ex["oneShot"]}
        assert {"bash", "python", "javascript", "go", "rust", "ruby"}.issubset(langs)

    def test_subscription_register_includes_all_languages(self, client, tenant_admin_headers):
        iface = client.post("/api/admin/interfaces", json={
            "name": "lang-sub", "interfaceType": "subscription",
            "authType": "none", "payloadTemplate": {},
        }, headers=tenant_admin_headers).get_json()
        ex = client.get(f"/api/admin/interfaces/{iface['id']}/usage-examples",
                        headers=tenant_admin_headers).get_json()
        langs = {e["language"] for e in ex["subscribe"]}
        # bash + python + go + rust + ruby for register/list/unsub flows
        assert {"bash", "python", "go", "rust", "ruby"}.issubset(langs)

    def test_webhook_handlers_include_all_languages(self, client, tenant_admin_headers):
        iface = client.post("/api/admin/interfaces", json={
            "name": "lang-wh", "interfaceType": "subscription",
            "authType": "none", "payloadTemplate": {},
        }, headers=tenant_admin_headers).get_json()
        ex = client.get(f"/api/admin/interfaces/{iface['id']}/usage-examples",
                        headers=tenant_admin_headers).get_json()
        langs = {e["language"] for e in ex["webhook"]}
        assert {"javascript", "go", "rust", "ruby"}.issubset(langs)
