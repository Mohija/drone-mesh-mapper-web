"""Tests for the service-token auth + /api/receivers/health-summary endpoint.

Covers the contract the scheduled remote agent depends on:
  - Unauthenticated → 401
  - Wrong token → 401
  - Revoked token → 403
  - Wrong scope → 403
  - Valid token (header or Authorization: Bearer) → 200 with full schema
  - Response contains every persisted heartbeat field
  - Audit + backup sections present
"""

import hashlib
import secrets
import time
import pytest


@pytest.fixture
def service_token(app, default_tenant_id):
    """Create a health_read service token for tests. Returns (raw, id).

    Note: the app_context is closed BEFORE yielding so tests that then open
    their own context see a fresh SQLAlchemy session — critical for the
    revoked-token test, which mutates the row and expects the next request
    to observe the change.
    """
    from models import ServiceToken
    from database import db
    raw = "flightarc_svc_" + secrets.token_hex(32)
    with app.app_context():
        tok = ServiceToken(
            tenant_id=default_tenant_id,
            name="pytest-agent",
            token_hash=hashlib.sha256(raw.encode()).hexdigest(),
            token_prefix=raw[:12],
            scopes="health_read",
        )
        db.session.add(tok)
        db.session.commit()
        tok_id = tok.id
    yield (raw, tok_id)


def test_health_summary_rejects_missing_auth(client):
    res = client.get("/api/receivers/health-summary")
    assert res.status_code == 401


def test_health_summary_rejects_wrong_token(client):
    res = client.get("/api/receivers/health-summary",
                     headers={"X-Service-Token": "flightarc_svc_wrong"})
    assert res.status_code == 401


def test_health_summary_accepts_x_service_token(client, service_token):
    raw, _ = service_token
    res = client.get("/api/receivers/health-summary",
                     headers={"X-Service-Token": raw})
    assert res.status_code == 200
    data = res.get_json()
    # Shape expected by the remote agent
    for key in ("tenant_id", "server_time", "online_threshold_seconds",
                "stale_threshold_seconds", "counts", "receivers",
                "audit_24h", "backups"):
        assert key in data, f"missing top-level key {key}"
    assert data["online_threshold_seconds"] == 120
    assert isinstance(data["receivers"], list)
    assert isinstance(data["audit_24h"], list)


def test_health_summary_accepts_bearer_token(client, service_token):
    """Live-View-proxy strips X-* headers — the remote agent uses Authorization."""
    raw, _ = service_token
    res = client.get("/api/receivers/health-summary",
                     headers={"Authorization": f"Bearer {raw}"})
    assert res.status_code == 200


def test_health_summary_rejects_non_service_bearer(client):
    """A JWT that isn't our service-token format must not pass auth — prevents
    accidental cross-contamination with the user-JWT flow."""
    res = client.get("/api/receivers/health-summary",
                     headers={"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.random"})
    assert res.status_code == 401


def test_health_summary_rejects_revoked_token(client, service_token, app):
    from models import ServiceToken
    from database import db
    raw, tok_id = service_token
    with app.app_context():
        tok = db.session.get(ServiceToken, tok_id)
        tok.revoked_at = time.time()
        db.session.commit()
    res = client.get("/api/receivers/health-summary",
                     headers={"X-Service-Token": raw})
    assert res.status_code == 403


def test_health_summary_rejects_wrong_scope(client, app, default_tenant_id):
    """Token without health_read scope must be rejected."""
    from models import ServiceToken
    from database import db
    raw = "flightarc_svc_" + secrets.token_hex(32)
    with app.app_context():
        tok = ServiceToken(
            tenant_id=default_tenant_id,
            name="no-scope",
            token_hash=hashlib.sha256(raw.encode()).hexdigest(),
            token_prefix=raw[:12],
            scopes="other_scope",
        )
        db.session.add(tok)
        db.session.commit()
    res = client.get("/api/receivers/health-summary",
                     headers={"X-Service-Token": raw})
    assert res.status_code == 403


def test_health_summary_exposes_every_telemetry_field(client, service_token, app, default_tenant_id):
    """The remote agent needs ALL heartbeat fields. Build a receiver with
    every telemetry column populated and verify each appears in the response."""
    from models import ReceiverNode
    from database import db
    raw, _ = service_token
    with app.app_context():
        r = ReceiverNode(
            tenant_id=default_tenant_id,
            name="telemetry-test",
            hardware_type="esp32-s3",
            firmware_version="1.5.3",
            last_heartbeat=time.time() - 10,
            last_telemetry_at=time.time() - 10,
            last_ip="192.168.200.200",
            wifi_ssid="TestNet",
            wifi_rssi=-55,
            wifi_channel=6,
            ap_active=False,
            free_heap=180000,
            uptime_seconds=12345,
            last_error_count=2,
            last_http_code_reported=200,
            detections_since_boot=42,
            total_detections=999,
            last_latitude=52.03,
            last_longitude=8.53,
            last_location_accuracy=8.0,
        )
        db.session.add(r)
        db.session.commit()

    res = client.get("/api/receivers/health-summary",
                     headers={"X-Service-Token": raw})
    assert res.status_code == 200
    data = res.get_json()

    row = next((x for x in data["receivers"] if x["name"] == "telemetry-test"), None)
    assert row is not None, "new receiver must show up"
    assert row["status"] == "online"
    assert row["wifi_ssid"] == "TestNet"
    assert row["wifi_rssi"] == -55
    assert row["wifi_channel"] == 6
    assert row["ap_active"] is False
    assert row["free_heap"] == 180000
    assert row["uptime_seconds"] == 12345
    assert row["last_error_count"] == 2
    assert row["last_http_code_reported"] == 200
    assert row["detections_since_boot"] == 42
    assert row["total_detections"] == 999
    assert row["latitude"] == 52.03
    assert row["longitude"] == 8.53
    assert row["location_accuracy"] == 8.0
    assert row["firmware_version"] == "1.5.3"
    assert row["last_heartbeat_age_seconds"] is not None


def test_heartbeat_persists_new_telemetry_fields(client, app, default_tenant_id):
    """Every new heartbeat field must land in receiver_nodes — otherwise the
    health-summary endpoint has nothing to report."""
    from models import ReceiverNode
    from database import db
    with app.app_context():
        r = ReceiverNode(
            tenant_id=default_tenant_id,
            name="heartbeat-target",
            hardware_type="esp32-s3",
        )
        db.session.add(r)
        db.session.commit()
        api_key = r.api_key
        rid = r.id

    payload = {
        "firmware_version": "1.5.3",
        "wifi_ssid": "X",
        "wifi_rssi": -60,
        "wifi_channel": 11,
        "free_heap": 150000,
        "uptime_seconds": 999,
        "detections_since_boot": 5,
        "ap_active": True,
        "error_count": 3,
        "last_http_code": 502,
    }
    res = client.post("/api/receivers/heartbeat", json=payload,
                      headers={"X-Node-Key": api_key})
    assert res.status_code == 200

    with app.app_context():
        n = db.session.get(ReceiverNode, rid)
        assert n.wifi_channel == 11
        assert n.ap_active is True
        assert n.last_error_count == 3
        assert n.last_http_code_reported == 502
        assert n.last_telemetry_at is not None
