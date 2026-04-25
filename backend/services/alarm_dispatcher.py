"""Alarm dispatcher — renders payload templates, applies auth, sends HTTP requests.

Three entry points:
  * dispatch_violation_start / dispatch_violation_end — called from
    flight_zones.update_violations after the DB transaction commits. Resolves
    matching AlarmRules, renders the interface payload template against a
    drone/zone/violation/tenant context, sends the request in a worker thread.
  * pull_out_tick — called from a background loop in app.py once per minute,
    walks all enabled pull_out interfaces and probes their URL for liveness.
  * test_dispatch — synchronous variant for the "Test"-button in the UI.

Auth secrets (passwords, tokens, api_keys) are encrypted at rest using Fernet
with a key derived from JWT_SECRET; only the dispatcher (server-side) ever
sees the cleartext.
"""
from __future__ import annotations

import base64
import copy
import hashlib
import json
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import chevron
import requests
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger("alarm_dispatcher")

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="alarm-dispatch")

_RESPONSE_BODY_LIMIT = 4096
_VARIABLE_PATHS = None  # populated lazily by build_variable_pool()


# ---------------------------------------------------------------------------
# Encryption
# ---------------------------------------------------------------------------

def _get_fernet() -> Fernet:
    secret = os.environ.get("JWT_SECRET", "flightarc-default-dev-secret")
    key_bytes = hashlib.sha256(secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key_bytes))


def encrypt_auth_config(config: dict) -> str | None:
    if not config:
        return None
    try:
        return _get_fernet().encrypt(json.dumps(config).encode()).decode()
    except Exception as exc:
        logger.error("encrypt_auth_config failed: %s", exc)
        return None


def decrypt_auth_config(ciphertext: str | None) -> dict:
    if not ciphertext:
        return {}
    try:
        plaintext = _get_fernet().decrypt(ciphertext.encode())
        return json.loads(plaintext.decode())
    except (InvalidToken, ValueError, json.JSONDecodeError) as exc:
        logger.warning("decrypt_auth_config failed: %s", exc)
        return {}


# ---------------------------------------------------------------------------
# Variable pool — what the UI shows in the picker / DnD palette
# ---------------------------------------------------------------------------

def build_variable_pool() -> list[dict]:
    """Static catalogue of every {{path}} the user can drop into a payload.

    Examples are illustrative — the dispatcher renders against the real values
    at trigger time.
    """
    return [
        # Drone
        {"path": "drone.id", "type": "string", "category": "drone", "example": "DRONE-A1B2"},
        {"path": "drone.name", "type": "string", "category": "drone", "example": "DJI Mavic"},
        {"path": "drone.model", "type": "string", "category": "drone", "example": "Mavic 3"},
        {"path": "drone.manufacturer", "type": "string", "category": "drone", "example": "DJI"},
        {"path": "drone.source", "type": "string", "category": "drone", "example": "receiver"},
        {"path": "drone.basic_id", "type": "string", "category": "drone", "example": "1581F5BB000000000000"},
        {"path": "drone.latitude", "type": "number", "category": "drone", "example": 52.0302},
        {"path": "drone.longitude", "type": "number", "category": "drone", "example": 8.5325},
        {"path": "drone.altitude", "type": "number", "category": "drone", "example": 120.5},
        {"path": "drone.speed", "type": "number", "category": "drone", "example": 14.2},
        {"path": "drone.bearing", "type": "number", "category": "drone", "example": 87.0},
        {"path": "drone.battery", "type": "number", "category": "drone", "example": 76},
        {"path": "drone.signal_strength", "type": "number", "category": "drone", "example": -54},
        {"path": "drone.pilot_latitude", "type": "number", "category": "drone", "example": 52.0298},
        {"path": "drone.pilot_longitude", "type": "number", "category": "drone", "example": 8.5320},
        # Zone
        {"path": "zone.id", "type": "string", "category": "zone", "example": "ZONE-X1Y2"},
        {"path": "zone.name", "type": "string", "category": "zone", "example": "Sperrzone Festival"},
        {"path": "zone.color", "type": "string", "category": "zone", "example": "#ef4444"},
        {"path": "zone.minAltitudeAGL", "type": "number", "category": "zone", "example": 0},
        {"path": "zone.maxAltitudeAGL", "type": "number", "category": "zone", "example": 50},
        # Violation
        {"path": "violation.id", "type": "string", "category": "violation", "example": "V-9F8E"},
        {"path": "violation.start_time", "type": "number", "category": "violation", "example": 1745433600.0},
        {"path": "violation.start_time_iso", "type": "string", "category": "violation", "example": "2026-04-25T10:00:00Z"},
        {"path": "violation.end_time", "type": "number", "category": "violation", "example": None},
        {"path": "violation.end_time_iso", "type": "string", "category": "violation", "example": None},
        {"path": "violation.is_active", "type": "boolean", "category": "violation", "example": True},
        {"path": "violation.duration_seconds", "type": "number", "category": "violation", "example": 42.5},
        # Tenant
        {"path": "tenant.id", "type": "string", "category": "tenant", "example": "default"},
        {"path": "tenant.name", "type": "string", "category": "tenant", "example": "default"},
        {"path": "tenant.display_name", "type": "string", "category": "tenant", "example": "Standard-Mandant"},
        # System
        {"path": "system.now", "type": "number", "category": "system", "example": 1745433600.0},
        {"path": "system.now_iso", "type": "string", "category": "system", "example": "2026-04-25T10:00:00Z"},
        {"path": "system.flightarc_version", "type": "string", "category": "system", "example": "1.10.0"},
        {"path": "trigger", "type": "string", "category": "system", "example": "violation_start"},
    ]


def build_example_context() -> dict:
    """Sample context used by the UI's live preview and the ?test endpoint."""
    return {
        "drone": {
            "id": "DRONE-A1B2", "name": "DJI Mavic", "model": "Mavic 3",
            "manufacturer": "DJI", "source": "receiver",
            "basic_id": "1581F5BB000000000000",
            "latitude": 52.0302, "longitude": 8.5325, "altitude": 120.5,
            "speed": 14.2, "bearing": 87.0, "battery": 76, "signal_strength": -54,
            "pilot_latitude": 52.0298, "pilot_longitude": 8.5320,
        },
        "zone": {
            "id": "ZONE-X1Y2", "name": "Sperrzone Festival", "color": "#ef4444",
            "minAltitudeAGL": 0, "maxAltitudeAGL": 50,
        },
        "violation": {
            "id": "V-9F8E",
            "start_time": 1745433600.0,
            "start_time_iso": "2026-04-25T10:00:00Z",
            "end_time": None, "end_time_iso": None,
            "is_active": True, "duration_seconds": 42.5,
        },
        "tenant": {"id": "default", "name": "default", "display_name": "Standard-Mandant"},
        "system": {
            "now": time.time(),
            "now_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "flightarc_version": "1.10.0",
        },
        "trigger": "violation_start",
    }


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------

def _render_string(value: str, ctx: dict) -> str:
    """Mustache-render a single string. Returns the original value on render
    error so a malformed template never blocks dispatch silently."""
    try:
        return chevron.render(value, ctx)
    except Exception as exc:
        logger.warning("template render error %r: %s", value[:80], exc)
        return value


def render_payload(template: Any, ctx: dict) -> Any:
    """Walk a JSON-shaped template and render every string leaf via Mustache.

    Numbers, bools, None pass through unchanged. After rendering, strings that
    look like a JSON number/bool/null are NOT auto-coerced — the user picks
    the type by writing `123` (string) vs. inserting a number variable. To get
    a typed number from a variable, use the `${{drone.altitude}}` shortcut
    which is rendered then JSON-parsed.
    """
    if isinstance(template, str):
        if template.startswith("${{") and template.endswith("}}"):
            inner = "{{" + template[3:-2] + "}}"
            rendered = _render_string(inner, ctx)
            try:
                return json.loads(rendered)
            except (json.JSONDecodeError, ValueError):
                return rendered
        return _render_string(template, ctx)
    if isinstance(template, list):
        return [render_payload(v, ctx) for v in template]
    if isinstance(template, dict):
        return {k: render_payload(v, ctx) for k, v in template.items()}
    return template


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def apply_auth(headers: dict, params: dict, auth_type: str, auth_config: dict) -> tuple[dict, dict, tuple | None]:
    """Mutate-and-return (headers, params, requests_auth_tuple)."""
    headers = dict(headers or {})
    params = dict(params or {})
    auth = None

    if auth_type == "basic":
        username = auth_config.get("username", "")
        password = auth_config.get("password", "")
        auth = (username, password)
    elif auth_type == "bearer":
        token = auth_config.get("token", "")
        if token:
            headers["Authorization"] = f"Bearer {token}"
    elif auth_type == "api_key_header":
        header_name = auth_config.get("name") or "X-API-Key"
        value = auth_config.get("value", "")
        if value:
            headers[header_name] = value
    elif auth_type == "api_key_query":
        param_name = auth_config.get("name") or "api_key"
        value = auth_config.get("value", "")
        if value:
            params[param_name] = value
    return headers, params, auth


def merge_auth_for_update(existing_encrypted: str | None, incoming: dict) -> str | None:
    """Take a partial auth_config from the user (frontend masks unchanged
    fields with empty string or '••••••••'), merge with stored secrets,
    re-encrypt. Returns the new ciphertext or None to clear."""
    existing = decrypt_auth_config(existing_encrypted)
    merged = dict(existing)
    for k, v in (incoming or {}).items():
        if v in ("", "••••••••"):
            # user didn't change this secret — keep existing
            continue
        merged[k] = v
    if not merged:
        return None
    return encrypt_auth_config(merged)


# ---------------------------------------------------------------------------
# Send
# ---------------------------------------------------------------------------

def _truncate(text: str, limit: int = _RESPONSE_BODY_LIMIT) -> str:
    if text is None:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n…[truncated, original {len(text)} bytes]"


def send_request(interface, ctx: dict, *, trigger_type: str, rule_id: str | None,
                 violation_id: str | None) -> dict:
    """Send one HTTP request, log delivery, retry up to retry_max times.

    Returns a dict suitable for to_dict()-style consumption (also persisted
    via AlarmDelivery rows).
    """
    from database import db
    from models import AlarmDelivery

    rendered = render_payload(interface.payload_template or {}, ctx)
    auth_config = decrypt_auth_config(interface.auth_config_encrypted)
    base_headers = dict(interface.extra_headers or {})
    base_params = {}
    headers, params, auth = apply_auth(base_headers, base_params, interface.auth_type or "none", auth_config)
    if interface.http_method.upper() in {"POST", "PUT", "PATCH"} and "Content-Type" not in headers:
        headers["Content-Type"] = "application/json"

    last_result = None
    for attempt in range(1, max(1, interface.retry_max) + 1):
        delivery = AlarmDelivery(
            tenant_id=interface.tenant_id,
            rule_id=rule_id,
            interface_id=interface.id,
            violation_id=violation_id,
            trigger_type=trigger_type,
            attempt=attempt,
            status="pending",
            request_payload=rendered,
            started_at=time.time(),
        )
        db.session.add(delivery)
        db.session.commit()

        try:
            method = (interface.http_method or "POST").upper()
            kwargs = {
                "headers": headers,
                "params": params,
                "timeout": interface.timeout_seconds or 10,
            }
            if auth is not None:
                kwargs["auth"] = auth
            if method in {"POST", "PUT", "PATCH"}:
                kwargs["json"] = rendered
            resp = requests.request(method, interface.url, **kwargs)
            delivery.http_status = resp.status_code
            delivery.response_status = resp.status_code
            delivery.response_body = _truncate(resp.text)
            delivery.completed_at = time.time()
            if 200 <= resp.status_code < 300:
                delivery.status = "success"
                db.session.commit()
                logger.info("alarm dispatch ok interface=%s status=%s attempt=%s",
                            interface.id, resp.status_code, attempt)
                return {"ok": True, "status": resp.status_code, "body": delivery.response_body}
            delivery.status = "failed" if attempt >= interface.retry_max else "retrying"
            delivery.error = f"HTTP {resp.status_code}"
            db.session.commit()
            last_result = {"ok": False, "status": resp.status_code, "body": delivery.response_body}
        except requests.RequestException as exc:
            delivery.status = "failed" if attempt >= interface.retry_max else "retrying"
            delivery.error = f"{exc.__class__.__name__}: {exc}"
            delivery.completed_at = time.time()
            db.session.commit()
            logger.warning("alarm dispatch error interface=%s attempt=%s: %s",
                           interface.id, attempt, exc)
            last_result = {"ok": False, "status": None, "error": str(exc)}

        if attempt < interface.retry_max:
            time.sleep((interface.retry_backoff_seconds or 2.0) * attempt)

    return last_result or {"ok": False, "error": "no attempts made"}


# ---------------------------------------------------------------------------
# Dispatch (called from flight_zones.update_violations)
# ---------------------------------------------------------------------------

def _dispatch_async(app, interface_id: str, ctx: dict, trigger_type: str,
                    rule_id: str | None, violation_id: str | None) -> None:
    def _run():
        with app.app_context():
            from models import AlarmInterface
            iface = AlarmInterface.query.get(interface_id)
            if not iface or not iface.enabled:
                return
            try:
                send_request(iface, ctx, trigger_type=trigger_type,
                             rule_id=rule_id, violation_id=violation_id)
            except Exception as exc:
                logger.exception("alarm dispatch crashed interface=%s: %s", interface_id, exc)
    _executor.submit(_run)


def _build_violation_context(violation, drone: dict | None, zone: dict | None,
                             tenant, trigger: str) -> dict:
    now = time.time()
    end_time = getattr(violation, "end_time", None)
    start_time = getattr(violation, "start_time", now)
    duration = (end_time or now) - start_time
    iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t)) if t else None
    return {
        "drone": drone or {},
        "zone": zone or {},
        "violation": {
            "id": getattr(violation, "id", None),
            "start_time": start_time,
            "start_time_iso": iso(start_time),
            "end_time": end_time,
            "end_time_iso": iso(end_time),
            "is_active": end_time is None,
            "duration_seconds": round(duration, 1),
        },
        "tenant": {
            "id": getattr(tenant, "id", None),
            "name": getattr(tenant, "name", None),
            "display_name": getattr(tenant, "display_name", None),
        },
        "system": {
            "now": now,
            "now_iso": iso(now),
            "flightarc_version": "1.10.0",
        },
        "trigger": trigger,
    }


def dispatch_violation_event(app, tenant_id: str, trigger_type: str,
                             violation, drone: dict | None, zone: dict | None) -> None:
    """Find all enabled rules matching tenant/zone/trigger and fire them.

    Supports both `webhook` (single fixed target) and `subscription`
    (broadcast to all registered subscribers) interface types.
    """
    from models import AlarmRule, Tenant

    tenant = Tenant.query.get(tenant_id)
    rules = AlarmRule.query.filter_by(
        tenant_id=tenant_id,
        trigger_type=trigger_type,
        enabled=True,
    ).all()
    if not rules:
        return

    zone_id = (zone or {}).get("id") if zone else None
    drone_source = (drone or {}).get("source") if drone else None

    ctx = _build_violation_context(violation, drone, zone, tenant, trigger_type)

    for rule in rules:
        if rule.zone_id and rule.zone_id != zone_id:
            continue
        if not rule.interface or not rule.interface.enabled:
            continue
        # Filter check
        f = rule.filters or {}
        if f.get("drone_source") and f["drone_source"] != drone_source:
            continue
        min_alt = f.get("min_altitude")
        if min_alt is not None and (drone or {}).get("altitude", 0) < min_alt:
            continue

        if rule.interface.interface_type == "webhook":
            _dispatch_async(app, rule.interface_id, copy.deepcopy(ctx),
                            trigger_type, rule.id, getattr(violation, "id", None))
        elif rule.interface.interface_type == "subscription":
            _dispatch_subscription_async(app, rule.interface_id, copy.deepcopy(ctx),
                                         trigger_type, rule.id, getattr(violation, "id", None))
        # pull_out / pull_in do not push on violations.


# ---------------------------------------------------------------------------
# Pull-out worker
# ---------------------------------------------------------------------------

_pull_out_thread: threading.Thread | None = None
_pull_out_stop = threading.Event()


def _pull_out_tick(app) -> None:
    """One iteration: probe every enabled pull_out interface that is due."""
    from models import AlarmInterface
    from database import db

    with app.app_context():
        interfaces = AlarmInterface.query.filter_by(
            interface_type="pull_out", enabled=True
        ).all()
        now = time.time()
        for iface in interfaces:
            interval = iface.pull_interval_seconds or 60
            # quick last-attempt lookup
            from models import AlarmDelivery as AD
            last = AD.query.filter_by(interface_id=iface.id).order_by(AD.started_at.desc()).first()
            if last and (now - last.started_at) < interval:
                continue
            ctx = build_example_context()
            ctx["trigger"] = "pull_out_check"
            try:
                send_request(iface, ctx, trigger_type="pull_out_check",
                             rule_id=None, violation_id=None)
            except Exception as exc:
                logger.exception("pull_out tick failed interface=%s: %s", iface.id, exc)


def start_pull_out_worker(app, *, tick_seconds: int = 30) -> threading.Thread:
    """Start a background thread that calls _pull_out_tick periodically."""
    global _pull_out_thread

    if _pull_out_thread and _pull_out_thread.is_alive():
        return _pull_out_thread

    def _loop():
        logger.info("pull_out worker started, tick=%ss", tick_seconds)
        while not _pull_out_stop.wait(tick_seconds):
            try:
                _pull_out_tick(app)
            except Exception as exc:
                logger.exception("pull_out worker error: %s", exc)

    _pull_out_thread = threading.Thread(target=_loop, name="alarm-pull-out", daemon=True)
    _pull_out_thread.start()
    return _pull_out_thread


def stop_pull_out_worker() -> None:
    _pull_out_stop.set()


# ---------------------------------------------------------------------------
# Subscription broadcast
# ---------------------------------------------------------------------------

import hmac as _hmac


def _push_to_subscriber(interface, subscription, payload: dict, *,
                        trigger_type: str, rule_id: str | None,
                        violation_id: str | None) -> dict:
    """One HTTP POST to a single subscriber's callback URL, signed with
    HMAC-SHA256(secret, body). Records an AlarmDelivery row keyed to the
    interface (subscription id is embedded in the trigger_type for filtering).
    """
    from database import db
    from models import AlarmDelivery

    body = json.dumps(payload, separators=(",", ":"), default=str).encode()
    sig = _hmac.new(subscription.secret.encode(), body, hashlib.sha256).hexdigest()
    headers = {
        "Content-Type": "application/json",
        "X-FlightArc-Signature": f"sha256={sig}",
        "X-FlightArc-Subscription-Id": subscription.id,
    }

    delivery = AlarmDelivery(
        tenant_id=interface.tenant_id,
        rule_id=rule_id,
        interface_id=interface.id,
        violation_id=violation_id,
        trigger_type=f"{trigger_type}/sub:{subscription.id}",
        status="pending",
        request_payload=payload,
        started_at=time.time(),
    )
    db.session.add(delivery)
    db.session.commit()

    subscription.last_attempt_at = time.time()
    try:
        resp = requests.post(
            subscription.callback_url,
            data=body, headers=headers,
            timeout=interface.timeout_seconds or 10,
        )
        delivery.http_status = resp.status_code
        delivery.response_status = resp.status_code
        delivery.response_body = _truncate(resp.text)
        delivery.completed_at = time.time()
        if 200 <= resp.status_code < 300:
            delivery.status = "success"
            subscription.last_success_at = time.time()
            subscription.last_error = None
            subscription.fail_count = 0
            db.session.commit()
            return {"ok": True, "status": resp.status_code}
        delivery.status = "failed"
        delivery.error = f"HTTP {resp.status_code}"
        subscription.last_error = delivery.error
        subscription.fail_count += 1
        db.session.commit()
        return {"ok": False, "status": resp.status_code}
    except requests.RequestException as exc:
        delivery.status = "failed"
        delivery.error = f"{exc.__class__.__name__}: {exc}"
        delivery.completed_at = time.time()
        subscription.last_error = delivery.error
        subscription.fail_count += 1
        db.session.commit()
        return {"ok": False, "error": str(exc)}


def _dispatch_subscription_async(app, interface_id: str, ctx: dict, trigger_type: str,
                                  rule_id: str | None, violation_id: str | None) -> None:
    """Render once, fan out to every active subscriber on this channel."""
    def _run():
        with app.app_context():
            from models import AlarmInterface, AlarmSubscription
            iface = AlarmInterface.query.get(interface_id)
            if not iface or not iface.enabled:
                return
            subs = AlarmSubscription.query.filter_by(interface_id=iface.id, revoked_at=None).all()
            if not subs:
                return
            payload = render_payload(iface.payload_template or {}, ctx)
            for sub in subs:
                try:
                    _push_to_subscriber(iface, sub, payload,
                                        trigger_type=trigger_type,
                                        rule_id=rule_id, violation_id=violation_id)
                except Exception as exc:
                    logger.exception("subscription push crashed sub=%s: %s", sub.id, exc)
    _executor.submit(_run)


def push_subscription_test(interface, ctx: dict | None = None) -> list[dict]:
    """Synchronous variant for the admin „Test"-Knopf — pushes once to every
    active subscriber and returns a per-subscriber result list."""
    from models import AlarmSubscription
    if ctx is None:
        ctx = build_example_context()
        ctx["trigger"] = "manual_test"
    subs = AlarmSubscription.query.filter_by(interface_id=interface.id, revoked_at=None).all()
    payload = render_payload(interface.payload_template or {}, ctx)
    out = []
    for sub in subs:
        result = _push_to_subscriber(interface, sub, payload,
                                     trigger_type="manual_test",
                                     rule_id=None, violation_id=None)
        out.append({"subscriptionId": sub.id, "name": sub.name,
                    "callbackUrl": sub.callback_url, **result})
    return out


# ---------------------------------------------------------------------------
# Stats — 24h success rate, 7d trend, last delivery
# ---------------------------------------------------------------------------

def build_interface_stats(interface_id: str, tenant_id: str) -> dict:
    """24h success/total counts, last delivery, 7d daily breakdown.

    Cheap query: scans alarm_deliveries by interface_id within the last 7 days.
    Pull-In stats come from ServiceToken.last_used_at (tracked elsewhere).
    """
    from models import AlarmDelivery, AlarmInterface, AlarmSubscription, ServiceToken

    iface = AlarmInterface.query.filter_by(id=interface_id, tenant_id=tenant_id).first()
    if not iface:
        return {}

    now = time.time()
    cutoff_24h = now - 24 * 3600
    cutoff_7d = now - 7 * 86400

    rows = (AlarmDelivery.query
            .filter_by(interface_id=interface_id, tenant_id=tenant_id)
            .filter(AlarmDelivery.started_at >= cutoff_7d)
            .all())

    last24 = [r for r in rows if r.started_at >= cutoff_24h]
    success24 = sum(1 for r in last24 if r.status == "success")

    # 7d daily buckets (today is bucket 6 = last)
    daily: list[dict] = []
    for i in range(7):
        bucket_start = now - (6 - i) * 86400 - (now % 86400)
        bucket_end = bucket_start + 86400
        in_bucket = [r for r in rows if bucket_start <= r.started_at < bucket_end]
        ok = sum(1 for r in in_bucket if r.status == "success")
        daily.append({
            "dayOffset": -(6 - i),
            "total": len(in_bucket),
            "success": ok,
            "failed": len(in_bucket) - ok,
        })

    last_delivery = max(rows, key=lambda r: r.started_at, default=None)

    out: dict = {
        "interfaceId": interface_id,
        "last24hTotal": len(last24),
        "last24hSuccess": success24,
        "last24hSuccessRate": (success24 / len(last24)) if last24 else None,
        "lastDeliveryAt": last_delivery.started_at if last_delivery else None,
        "lastDeliveryStatus": last_delivery.status if last_delivery else None,
        "daily": daily,
    }

    if iface.interface_type == "subscription":
        active_subs = AlarmSubscription.query.filter_by(
            interface_id=interface_id, revoked_at=None
        ).count()
        out["activeSubscribers"] = active_subs

    if iface.interface_type == "pull_in" and iface.service_token_id:
        st = ServiceToken.query.get(iface.service_token_id)
        if st:
            out["lastPullAt"] = st.last_used_at

    return out


# ---------------------------------------------------------------------------
# Usage examples — ready-to-copy snippets shown in the admin UI
# ---------------------------------------------------------------------------

def build_usage_examples(interface, *, request_origin: str) -> dict:
    """Return curl / python / JS snippets per interface type.

    `request_origin` is e.g. "https://hub.dasilvafelix.de" — taken from the
    incoming request so the examples reflect the actual public URL.
    """
    base = request_origin.rstrip("/")
    examples: dict[str, list[dict]] = {"oneShot": [], "subscribe": [], "webhook": []}

    if interface.interface_type == "pull_in":
        url = f"{base}/api/integrations/violations"
        examples["oneShot"] = [
            {"label": "curl",
             "language": "bash",
             "code": (
                f"curl -H 'X-Service-Token: <DEIN_TOKEN>' \\\n"
                f"     '{url}'"
             )},
            {"label": "Python (requests)",
             "language": "python",
             "code": (
                "import requests\n"
                f"r = requests.get('{url}',\n"
                "    headers={'X-Service-Token': '<DEIN_TOKEN>'}, timeout=10)\n"
                "for v in r.json()['active']:\n"
                "    print(v['drone_id'], v['zone_name'])"
             )},
            {"label": "JavaScript (fetch)",
             "language": "javascript",
             "code": (
                f"const res = await fetch('{url}', {{\n"
                f"  headers: {{ 'X-Service-Token': '<DEIN_TOKEN>' }}\n"
                f"}});\n"
                f"const data = await res.json();\n"
                f"console.log(data.active);"
             )},
        ]

    if interface.interface_type == "subscription":
        register_url = f"{base}/api/integrations/subscriptions/{interface.id}/register"
        list_url = f"{base}/api/integrations/subscriptions/{interface.id}"
        examples["subscribe"] = [
            {"label": "1. Registrieren (curl)",
             "language": "bash",
             "code": (
                f"curl -X POST '{register_url}' \\\n"
                f"     -H 'X-API-Key: <KANAL_API_KEY>' \\\n"
                f"     -H 'Content-Type: application/json' \\\n"
                f"     -d '{{\"callback_url\": \"https://meinservice.example.com/flightarc-events\", \"name\": \"Mein Service\"}}'"
             )},
            {"label": "1. Registrieren (Python)",
             "language": "python",
             "code": (
                "import requests\n"
                f"r = requests.post('{register_url}',\n"
                "    headers={'X-API-Key': '<KANAL_API_KEY>'},\n"
                "    json={'callback_url': 'https://meinservice.example.com/flightarc-events',\n"
                "          'name': 'Mein Service'})\n"
                "sub = r.json()  # enthält id + secret — dauerhaft speichern!\n"
                "print(sub['id'], sub['secret'])"
             )},
            {"label": "2. Empfangen + Signatur prüfen (Flask)",
             "language": "python",
             "code": (
                "import hmac, hashlib\n"
                "from flask import Flask, request, abort\n"
                "app = Flask(__name__)\n"
                "SECRET = '<bei_registrierung_erhaltenes_secret>'\n\n"
                "@app.post('/flightarc-events')\n"
                "def recv():\n"
                "    sig = request.headers.get('X-FlightArc-Signature', '').replace('sha256=', '')\n"
                "    expected = hmac.new(SECRET.encode(), request.data, hashlib.sha256).hexdigest()\n"
                "    if not hmac.compare_digest(sig, expected):\n"
                "        abort(401)\n"
                "    print(request.json)\n"
                "    return '', 204"
             )},
            {"label": "3. Eigene Subscriptions auflisten",
             "language": "bash",
             "code": (
                f"curl -H 'X-API-Key: <KANAL_API_KEY>' \\\n"
                f"     '{list_url}'"
             )},
            {"label": "4. Abmelden",
             "language": "bash",
             "code": (
                f"curl -X DELETE -H 'X-API-Key: <KANAL_API_KEY>' \\\n"
                f"     '{base}/api/integrations/subscriptions/{interface.id}/<SUBSCRIPTION_ID>'"
             )},
        ]

    if interface.interface_type in ("webhook", "subscription"):
        # Show what the receiving service will see in their callback handler
        examples["webhook"] = [
            {"label": "Beispiel-Empfangshandler (Express.js)",
             "language": "javascript",
             "code": (
                "const crypto = require('crypto');\n"
                "const SECRET = '<bei_registrierung_erhaltenes_secret>';  // nur subscription\n\n"
                "app.post('/flightarc-events', express.raw({ type: 'application/json' }), (req, res) => {\n"
                "  const sig = (req.headers['x-flightarc-signature'] || '').replace('sha256=', '');\n"
                "  const expected = crypto.createHmac('sha256', SECRET).update(req.body).digest('hex');\n"
                "  if (sig && !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {\n"
                "    return res.sendStatus(401);\n"
                "  }\n"
                "  const event = JSON.parse(req.body);\n"
                "  console.log(event);\n"
                "  res.sendStatus(204);\n"
                "});"
             )},
        ]

    return examples

