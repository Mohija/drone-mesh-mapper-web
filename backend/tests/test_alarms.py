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
