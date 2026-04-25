"""Alarm interfaces + alarm rules + delivery log routes.

Two blueprints:
  * alarm_bp   — /api/admin/interfaces, /api/admin/alarm-rules,
                 /api/admin/alarm-deliveries (tenant_admin auth)
  * integrations_bp — /api/integrations/violations (service-token auth, pull-in)
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import logging
import os
import secrets
import socket
import time
from urllib.parse import urlparse

from flask import Blueprint, g, jsonify, request, current_app

from auth import login_required, role_required, service_token_required
from database import db
from models import (
    AlarmInterface, AlarmRule, AlarmDelivery, AlarmSubscription,
    FlightZone, ServiceToken, Tenant, TenantSettings, ViolationRecord,
)
from services.alarm_dispatcher import (
    build_variable_pool, build_example_context,
    encrypt_auth_config, merge_auth_for_update,
    render_payload, send_request,
    push_subscription_test, build_interface_stats, build_usage_examples,
)
from services.alarm_templates import list_templates, get_template
from services.audit import audit_log

logger = logging.getLogger("alarm_routes")

alarm_bp = Blueprint("alarm", __name__, url_prefix="/api/admin")
integrations_bp = Blueprint("integrations", __name__, url_prefix="/api/integrations")

# Version counters — frontend polls and refetches when these change
_interface_versions: dict[str, int] = {}
_rule_versions: dict[str, int] = {}


def get_interface_version(tid: str) -> int:
    return _interface_versions.get(tid, 0)


def get_rule_version(tid: str) -> int:
    return _rule_versions.get(tid, 0)


def _bump_iface(tid: str):
    _interface_versions[tid] = _interface_versions.get(tid, 0) + 1


def _bump_rule(tid: str):
    _rule_versions[tid] = _rule_versions.get(tid, 0) + 1


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_INTERFACE_FIELDS = {
    "name", "description", "interfaceType", "enabled", "url", "httpMethod",
    "extraHeaders", "timeoutSeconds", "retryMax", "retryBackoffSeconds",
    "authType", "authConfig", "pullIntervalSeconds", "payloadTemplate",
}


def _apply_interface_fields(iface: AlarmInterface, data: dict, *, is_create: bool):
    if "name" in data:
        iface.name = (data.get("name") or "").strip()[:100]
    if "description" in data:
        iface.description = (data.get("description") or "").strip() or None
    if "interfaceType" in data:
        t = (data.get("interfaceType") or "").strip()
        if t not in AlarmInterface.VALID_TYPES:
            raise ValueError(f"interfaceType muss aus {sorted(AlarmInterface.VALID_TYPES)} sein")
        iface.interface_type = t
    if "enabled" in data:
        iface.enabled = bool(data.get("enabled"))
    if "url" in data:
        iface.url = (data.get("url") or "").strip() or None
    if "httpMethod" in data:
        iface.http_method = (data.get("httpMethod") or "POST").strip().upper()[:10]
    if "extraHeaders" in data:
        eh = data.get("extraHeaders") or {}
        if not isinstance(eh, dict):
            raise ValueError("extraHeaders muss ein Objekt sein")
        iface.extra_headers = eh
    if "timeoutSeconds" in data:
        iface.timeout_seconds = max(1, min(120, int(data.get("timeoutSeconds") or 10)))
    if "retryMax" in data:
        iface.retry_max = max(1, min(10, int(data.get("retryMax") or 3)))
    if "retryBackoffSeconds" in data:
        iface.retry_backoff_seconds = max(0.0, min(60.0, float(data.get("retryBackoffSeconds") or 2.0)))
    if "authType" in data:
        at = (data.get("authType") or "none").strip()
        if at not in AlarmInterface.VALID_AUTH_TYPES:
            raise ValueError(f"authType muss aus {sorted(AlarmInterface.VALID_AUTH_TYPES)} sein")
        iface.auth_type = at
    if "authConfig" in data:
        if is_create:
            iface.auth_config_encrypted = encrypt_auth_config(data.get("authConfig") or {})
        else:
            iface.auth_config_encrypted = merge_auth_for_update(
                iface.auth_config_encrypted, data.get("authConfig") or {}
            )
    if "pullIntervalSeconds" in data:
        v = data.get("pullIntervalSeconds")
        iface.pull_interval_seconds = None if v in (None, "") else max(15, min(86400, int(v)))
    if "payloadTemplate" in data:
        iface.payload_template = data.get("payloadTemplate")
    if "responseMapping" in data:
        rm = data.get("responseMapping")
        if rm is not None and not isinstance(rm, dict):
            raise ValueError("responseMapping muss ein Objekt oder null sein")
        iface.response_mapping = rm


# ---------------------------------------------------------------------------
# /api/admin/interfaces
# ---------------------------------------------------------------------------

@alarm_bp.route("/interfaces", methods=["GET"])
@login_required
@role_required("tenant_admin")
def list_interfaces():
    tid = g.tenant_id
    items = AlarmInterface.query.filter_by(tenant_id=tid).order_by(AlarmInterface.created_at.desc()).all()
    return jsonify({
        "items": [i.to_dict() for i in items],
        "version": get_interface_version(tid),
    })


@alarm_bp.route("/interfaces", methods=["POST"])
@login_required
@role_required("tenant_admin")
def create_interface():
    tid = g.tenant_id
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name erforderlich"}), 400

    iface = AlarmInterface(
        tenant_id=tid, name=name,
        interface_type=data.get("interfaceType", "webhook"),
        created_by=g.current_user.username if hasattr(g, "current_user") else None,
    )
    try:
        _apply_interface_fields(iface, data, is_create=True)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    raw_pull_token = None
    raw_api_key = None
    if iface.interface_type == "pull_in":
        raw_pull_token, st = _create_pull_token(tid, name)
        iface.service_token_id = st.id
    elif iface.interface_type == "subscription":
        raw_api_key = _generate_api_key(iface)

    db.session.add(iface)
    db.session.commit()
    _bump_iface(tid)
    audit_log("create", "alarm_interface", iface.id, name)
    logger.info("interface created: %s (%s)", iface.id, iface.name)
    out = iface.to_dict(raw_pull_token=raw_pull_token)
    if raw_api_key:
        out["apiKey"] = raw_api_key
    return jsonify(out), 201


def _generate_api_key(iface: AlarmInterface) -> str:
    """Generate, hash and persist a subscription channel API key. Returns the
    raw key (returned ONCE in the API response — never readable again)."""
    raw = "flightarc_chan_" + secrets.token_hex(16)
    iface.api_key_hash = hashlib.sha256(raw.encode()).hexdigest()
    iface.api_key_prefix = raw[:12]   # column is VARCHAR(12) — keep consistent
    return raw


def _interface_for_api_key(channel_id: str, raw_key: str) -> AlarmInterface | None:
    """Look up + scope-check a channel by raw API key. Returns the interface
    if the key matches and the channel is a subscription type, else None.

    Uses `hmac.compare_digest` to keep the comparison timing-constant — the
    raw `==` operator on hex strings leaks the prefix length to a careful
    attacker, even when the inputs are SHA-256 hashes.
    """
    if not raw_key:
        return None
    iface = AlarmInterface.query.filter_by(id=channel_id).first()
    if not iface or iface.interface_type != "subscription":
        return None
    if not iface.api_key_hash:
        return None
    candidate = hashlib.sha256(raw_key.encode()).hexdigest()
    if not hmac.compare_digest(candidate, iface.api_key_hash):
        return None
    return iface


# ---------------------------------------------------------------------------
# Subscription hardening: SSRF protection + per-channel cap
# ---------------------------------------------------------------------------

# Hosts a third-party may register as callback. The default policy refuses
# loopback / link-local / private RFC 1918 / multicast / reserved ranges so a
# subscription channel cannot be pivoted into FlightArc's intranet.
# Override via env FLIGHTARC_ALLOW_PRIVATE_CALLBACKS=1 in dev/test setups.
def _allow_private_callbacks() -> bool:
    return os.environ.get("FLIGHTARC_ALLOW_PRIVATE_CALLBACKS", "").lower() in {"1", "true", "yes"}

# Hard cap on subscribers per channel — prevents an attacker with a leaked
# api_key from exhausting the DB / push fan-out budget. 50 is plenty for
# real integrations (each Channel maps to one third-party org typically).
_MAX_SUBSCRIBERS_PER_CHANNEL = 50

# Per-channel registration anti-burst. Soft signal — pairs with the hard cap.
_REGISTER_RATE_PER_CHANNEL_PER_MIN = 20


def _is_callback_url_safe(callback_url: str) -> tuple[bool, str]:
    """Validate a third-party-supplied callback URL against SSRF.

    Rejects: non-http(s), missing host, hostnames that resolve only to
    loopback / link-local / private / multicast / reserved IPs.
    """
    try:
        parsed = urlparse(callback_url)
    except ValueError:
        return False, "callback_url ist ungültig"
    if parsed.scheme not in ("http", "https"):
        return False, "callback_url muss http(s) sein"
    host = parsed.hostname
    if not host:
        return False, "callback_url ohne Host"
    if _allow_private_callbacks():
        return True, ""

    # Resolve hostname; if any returned address is unsafe, refuse the entire URL.
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False, f"callback_url-Host '{host}' nicht auflösbar"

    for family, _t, _p, _c, sockaddr in infos:
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if (ip.is_loopback or ip.is_private or ip.is_link_local
                or ip.is_multicast or ip.is_reserved or ip.is_unspecified):
            return False, f"callback_url-Host zeigt auf interne IP {ip_str}"
    return True, ""


_register_attempts: dict[str, list[float]] = {}


def _check_register_rate(channel_id: str) -> bool:
    """Returns True if the caller may proceed, False if over the rate limit."""
    now = time.time()
    cutoff = now - 60
    bucket = [t for t in _register_attempts.get(channel_id, []) if t > cutoff]
    if len(bucket) >= _REGISTER_RATE_PER_CHANNEL_PER_MIN:
        _register_attempts[channel_id] = bucket
        return False
    bucket.append(now)
    _register_attempts[channel_id] = bucket
    return True


def _create_pull_token(tid: str, label: str) -> tuple[str, ServiceToken]:
    raw = "flightarc_svc_" + secrets.token_hex(16)
    h = hashlib.sha256(raw.encode()).hexdigest()
    st = ServiceToken(
        tenant_id=tid,
        name=f"alarm-pull-{label}"[:100],
        token_hash=h,
        token_prefix=raw[:12],
        scopes="alarm_pull",
        created_by=g.current_user.username if hasattr(g, "current_user") else None,
    )
    db.session.add(st)
    db.session.flush()
    return raw, st


@alarm_bp.route("/interfaces/variables", methods=["GET"])
@login_required
@role_required("tenant_admin")
def list_variables():
    return jsonify({
        "variables": build_variable_pool(),
        "exampleContext": build_example_context(),
    })


@alarm_bp.route("/interfaces/templates", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_interface_templates():
    """Curated payload-template library — Alamos FE2, Slack, Discord, Teams,
    Generic, Subscription. See services/alarm_templates.py."""
    return jsonify({"items": list_templates()})


@alarm_bp.route("/interfaces/from-template", methods=["POST"])
@login_required
@role_required("tenant_admin")
def create_interface_from_template():
    """Instantiate a new interface from a server-side template, optionally
    overriding the name. The user can edit everything afterwards — the
    template only seeds the JSON template, type, headers, http method."""
    tid = g.tenant_id
    data = request.get_json(silent=True) or {}
    tpl_id = data.get("templateId")
    tpl = get_template(tpl_id) if tpl_id else None
    if not tpl:
        return jsonify({"error": "Unbekannte templateId"}), 400

    iface = AlarmInterface(
        tenant_id=tid,
        name=(data.get("name") or tpl["label"])[:100],
        description=tpl.get("description"),
        interface_type=tpl["interfaceType"],
        http_method=tpl.get("httpMethod", "POST"),
        extra_headers=tpl.get("extraHeaders") or {},
        auth_type=tpl.get("authType", "none"),
        payload_template=tpl.get("payloadTemplate"),
        enabled=False,                  # admin must wire URL + auth before enabling
        created_by=g.current_user.username if hasattr(g, "current_user") else None,
    )

    raw_pull_token = None
    raw_api_key = None
    if iface.interface_type == "pull_in":
        raw_pull_token, st = _create_pull_token(tid, iface.name)
        iface.service_token_id = st.id
    elif iface.interface_type == "subscription":
        raw_api_key = _generate_api_key(iface)

    db.session.add(iface)
    db.session.commit()
    _bump_iface(tid)
    audit_log("create_from_template", "alarm_interface", iface.id, iface.name, {"templateId": tpl_id})
    return jsonify(iface.to_dict(raw_pull_token=raw_pull_token,
                                  reveal_secrets=False)
                   | ({"apiKey": raw_api_key} if raw_api_key else {})), 201


@alarm_bp.route("/interfaces/import", methods=["POST"])
@login_required
@role_required("tenant_admin")
def import_interface():
    tid = g.tenant_id
    data = request.get_json(silent=True) or {}
    iface = AlarmInterface(
        tenant_id=tid,
        name=(data.get("name") or "Imported")[:100],
        interface_type=data.get("interfaceType", "webhook"),
        created_by=g.current_user.username if hasattr(g, "current_user") else None,
    )
    try:
        _apply_interface_fields(iface, data, is_create=True)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    db.session.add(iface)
    db.session.commit()
    _bump_iface(tid)
    audit_log("import", "alarm_interface", iface.id, iface.name)
    return jsonify(iface.to_dict()), 201


@alarm_bp.route("/interfaces/<iid>", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_interface(iid):
    tid = g.tenant_id
    iface = AlarmInterface.query.filter_by(id=iid, tenant_id=tid).first()
    if not iface:
        return jsonify({"error": "Schnittstelle nicht gefunden"}), 404
    return jsonify(iface.to_dict())


@alarm_bp.route("/interfaces/<iid>", methods=["PUT"])
@login_required
@role_required("tenant_admin")
def update_interface(iid):
    tid = g.tenant_id
    iface = AlarmInterface.query.filter_by(id=iid, tenant_id=tid).first()
    if not iface:
        return jsonify({"error": "Schnittstelle nicht gefunden"}), 404
    data = request.get_json(silent=True) or {}
    try:
        _apply_interface_fields(iface, data, is_create=False)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    db.session.commit()
    _bump_iface(tid)
    audit_log("update", "alarm_interface", iface.id, iface.name)
    return jsonify(iface.to_dict())


@alarm_bp.route("/interfaces/<iid>", methods=["DELETE"])
@login_required
@role_required("tenant_admin")
def delete_interface(iid):
    tid = g.tenant_id
    iface = AlarmInterface.query.filter_by(id=iid, tenant_id=tid).first()
    if not iface:
        return jsonify({"error": "Schnittstelle nicht gefunden"}), 404
    name = iface.name
    # Cascade-delete the dedicated service-token if pull_in
    if iface.service_token_id:
        st = ServiceToken.query.get(iface.service_token_id)
        if st and st.tenant_id == tid:
            db.session.delete(st)
    db.session.delete(iface)
    db.session.commit()
    _bump_iface(tid)
    audit_log("delete", "alarm_interface", iid, name)
    return jsonify({"ok": True})


@alarm_bp.route("/interfaces/<iid>/duplicate", methods=["POST"])
@login_required
@role_required("tenant_admin")
def duplicate_interface(iid):
    tid = g.tenant_id
    src = AlarmInterface.query.filter_by(id=iid, tenant_id=tid).first()
    if not src:
        return jsonify({"error": "Schnittstelle nicht gefunden"}), 404
    copy_iface = AlarmInterface(
        tenant_id=tid,
        name=f"{src.name} (Kopie)"[:100],
        description=src.description,
        interface_type=src.interface_type,
        enabled=False,                 # disabled by default — admin must re-enable
        url=src.url, http_method=src.http_method,
        extra_headers=dict(src.extra_headers or {}),
        timeout_seconds=src.timeout_seconds,
        retry_max=src.retry_max,
        retry_backoff_seconds=src.retry_backoff_seconds,
        auth_type=src.auth_type,
        auth_config_encrypted=src.auth_config_encrypted,
        pull_interval_seconds=src.pull_interval_seconds,
        payload_template=src.payload_template,
        created_by=g.current_user.username if hasattr(g, "current_user") else None,
    )
    db.session.add(copy_iface)
    db.session.commit()
    _bump_iface(tid)
    audit_log("duplicate", "alarm_interface", copy_iface.id, copy_iface.name)
    return jsonify(copy_iface.to_dict()), 201


@alarm_bp.route("/interfaces/<iid>/export", methods=["GET"])
@login_required
@role_required("tenant_admin")
def export_interface(iid):
    """JSON export — auth secrets are intentionally excluded so a leaked
    export file can't be used to authenticate."""
    tid = g.tenant_id
    iface = AlarmInterface.query.filter_by(id=iid, tenant_id=tid).first()
    if not iface:
        return jsonify({"error": "Schnittstelle nicht gefunden"}), 404
    out = iface.to_dict()
    # strip secrets, ids, tenant
    out.pop("id", None); out.pop("tenantId", None)
    out.pop("serviceTokenId", None); out.pop("createdAt", None); out.pop("updatedAt", None)
    out.pop("createdBy", None)
    out["authConfig"] = {}        # never export secrets
    out["_format"] = "flightarc-alarm-interface/v1"
    return jsonify(out)


@alarm_bp.route("/interfaces/<iid>/test", methods=["POST"])
@login_required
@role_required("tenant_admin")
def test_interface(iid):
    """Send one request immediately, using the example context (or a real
    recent violation if `useLatestViolation: true`)."""
    tid = g.tenant_id
    iface = AlarmInterface.query.filter_by(id=iid, tenant_id=tid).first()
    if not iface:
        return jsonify({"error": "Schnittstelle nicht gefunden"}), 404
    if iface.interface_type == "pull_in":
        return jsonify({"error": "Pull-In-Schnittstellen werden vom Drittsystem abgefragt — kein Test-Send"}), 400
    if not iface.url:
        return jsonify({"error": "URL fehlt"}), 400
    body = request.get_json(silent=True) or {}
    ctx = build_example_context()
    if body.get("useLatestViolation"):
        latest = ViolationRecord.query.filter_by(tenant_id=tid).order_by(ViolationRecord.start_time.desc()).first()
        if latest:
            ctx = _ctx_from_violation(latest, tid)
    ctx["trigger"] = body.get("trigger") or "manual_test"
    result = send_request(iface, ctx, trigger_type="manual_test", rule_id=None, violation_id=None)
    audit_log("test", "alarm_interface", iface.id, iface.name, {"ok": result.get("ok")})
    return jsonify(result)


def _ctx_from_violation(violation, tid: str) -> dict:
    """Best-effort context from a stored ViolationRecord (no live drone data)."""
    iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t)) if t else None
    last_trail = (violation.trail_data or [{}])[-1] if violation.trail_data else {}
    tenant = Tenant.query.get(tid)
    return {
        "drone": {
            "id": violation.drone_id, "name": violation.drone_name,
            "latitude": last_trail.get("lat"), "longitude": last_trail.get("lon"),
            "altitude": last_trail.get("alt"), "speed": last_trail.get("speed"),
            "battery": last_trail.get("battery"), "signal_strength": last_trail.get("signal"),
        },
        "zone": {
            "id": violation.zone_id, "name": violation.zone_name,
            "color": violation.zone_color,
        },
        "violation": {
            "id": violation.id,
            "start_time": violation.start_time, "start_time_iso": iso(violation.start_time),
            "end_time": violation.end_time, "end_time_iso": iso(violation.end_time),
            "is_active": violation.end_time is None,
            "duration_seconds": round(((violation.end_time or time.time()) - violation.start_time), 1),
        },
        "tenant": {
            "id": tenant.id if tenant else None,
            "name": tenant.name if tenant else None,
            "display_name": tenant.display_name if tenant else None,
        },
        "system": {
            "now": time.time(),
            "now_iso": iso(time.time()),
            "flightarc_version": "1.10.0",
        },
        "trigger": "manual_test",
    }


# ---------------------------------------------------------------------------
# /api/admin/alarm-rules
# ---------------------------------------------------------------------------

@alarm_bp.route("/alarm-rules", methods=["GET"])
@login_required
@role_required("tenant_admin")
def list_rules():
    tid = g.tenant_id
    items = AlarmRule.query.filter_by(tenant_id=tid).order_by(AlarmRule.created_at.desc()).all()
    return jsonify({"items": [r.to_dict() for r in items], "version": get_rule_version(tid)})


@alarm_bp.route("/alarm-rules", methods=["POST"])
@login_required
@role_required("tenant_admin")
def create_rule():
    tid = g.tenant_id
    data = request.get_json(silent=True) or {}
    iid = data.get("interfaceId")
    iface = AlarmInterface.query.filter_by(id=iid, tenant_id=tid).first() if iid else None
    if not iface:
        return jsonify({"error": "interfaceId ungültig"}), 400
    trig = (data.get("triggerType") or "violation_start").strip()
    if trig not in AlarmRule.VALID_TRIGGERS:
        return jsonify({"error": f"triggerType muss aus {sorted(AlarmRule.VALID_TRIGGERS)} sein"}), 400
    zone_id = data.get("zoneId") or None
    if zone_id and not FlightZone.query.filter_by(id=zone_id, tenant_id=tid).first():
        return jsonify({"error": "zoneId ungültig"}), 400

    rule = AlarmRule(
        tenant_id=tid, interface_id=iid, zone_id=zone_id,
        name=(data.get("name") or "")[:100] or None,
        trigger_type=trig,
        filters=data.get("filters") or {},
        enabled=bool(data.get("enabled", True)),
    )
    db.session.add(rule)
    db.session.commit()
    _bump_rule(tid)
    audit_log("create", "alarm_rule", rule.id, rule.name or rule.id)
    return jsonify(rule.to_dict()), 201


@alarm_bp.route("/alarm-rules/<rid>", methods=["PUT"])
@login_required
@role_required("tenant_admin")
def update_rule(rid):
    tid = g.tenant_id
    rule = AlarmRule.query.filter_by(id=rid, tenant_id=tid).first()
    if not rule:
        return jsonify({"error": "Regel nicht gefunden"}), 404
    data = request.get_json(silent=True) or {}
    if "interfaceId" in data:
        if not AlarmInterface.query.filter_by(id=data["interfaceId"], tenant_id=tid).first():
            return jsonify({"error": "interfaceId ungültig"}), 400
        rule.interface_id = data["interfaceId"]
    if "zoneId" in data:
        z = data["zoneId"] or None
        if z and not FlightZone.query.filter_by(id=z, tenant_id=tid).first():
            return jsonify({"error": "zoneId ungültig"}), 400
        rule.zone_id = z
    if "triggerType" in data:
        if data["triggerType"] not in AlarmRule.VALID_TRIGGERS:
            return jsonify({"error": "triggerType ungültig"}), 400
        rule.trigger_type = data["triggerType"]
    if "name" in data:
        rule.name = (data.get("name") or "")[:100] or None
    if "filters" in data:
        rule.filters = data.get("filters") or {}
    if "enabled" in data:
        rule.enabled = bool(data["enabled"])
    db.session.commit()
    _bump_rule(tid)
    audit_log("update", "alarm_rule", rule.id, rule.name or rule.id)
    return jsonify(rule.to_dict())


@alarm_bp.route("/alarm-rules/<rid>", methods=["DELETE"])
@login_required
@role_required("tenant_admin")
def delete_rule(rid):
    tid = g.tenant_id
    rule = AlarmRule.query.filter_by(id=rid, tenant_id=tid).first()
    if not rule:
        return jsonify({"error": "Regel nicht gefunden"}), 404
    db.session.delete(rule)
    db.session.commit()
    _bump_rule(tid)
    audit_log("delete", "alarm_rule", rid, "")
    return jsonify({"ok": True})


@alarm_bp.route("/alarm-rules/<rid>/test", methods=["POST"])
@login_required
@role_required("tenant_admin")
def test_rule(rid):
    tid = g.tenant_id
    rule = AlarmRule.query.filter_by(id=rid, tenant_id=tid).first()
    if not rule:
        return jsonify({"error": "Regel nicht gefunden"}), 404
    iface = AlarmInterface.query.get(rule.interface_id)
    if not iface or not iface.url:
        return jsonify({"error": "Schnittstelle ohne URL"}), 400
    latest = ViolationRecord.query.filter_by(tenant_id=tid).order_by(ViolationRecord.start_time.desc()).first()
    ctx = _ctx_from_violation(latest, tid) if latest else build_example_context()
    ctx["trigger"] = rule.trigger_type
    result = send_request(iface, ctx, trigger_type="manual_test", rule_id=rule.id, violation_id=getattr(latest, "id", None))
    audit_log("test", "alarm_rule", rule.id, rule.name or rule.id, {"ok": result.get("ok")})
    return jsonify(result)


# ---------------------------------------------------------------------------
# /api/admin/alarm-deliveries
# ---------------------------------------------------------------------------

@alarm_bp.route("/alarm-deliveries", methods=["GET"])
@login_required
@role_required("tenant_admin")
def list_deliveries():
    tid = g.tenant_id
    limit = min(500, int(request.args.get("limit", 100)))
    interface_id = request.args.get("interfaceId")
    status = request.args.get("status")

    q = AlarmDelivery.query.filter_by(tenant_id=tid)
    if interface_id:
        q = q.filter_by(interface_id=interface_id)
    if status:
        q = q.filter_by(status=status)
    items = q.order_by(AlarmDelivery.started_at.desc()).limit(limit).all()
    return jsonify({"items": [d.to_dict() for d in items]})


# ---------------------------------------------------------------------------
# /api/integrations/violations  (pull-in, service-token-secured)
# ---------------------------------------------------------------------------

@integrations_bp.route("/violations", methods=["GET"])
@service_token_required("alarm_pull")
def integrations_violations():
    """Read-only pull-in: external systems fetch active + recent violations.

    Tenant scope comes from the service token (set in g.tenant_id by the
    decorator). Returns active violations + those that ended in the last 24 h.
    """
    tid = g.tenant_id
    cutoff = time.time() - 24 * 3600
    active = ViolationRecord.query.filter_by(tenant_id=tid, end_time=None).all()
    recent_ended = ViolationRecord.query.filter(
        ViolationRecord.tenant_id == tid,
        ViolationRecord.end_time.isnot(None),
        ViolationRecord.end_time >= cutoff,
    ).all()
    return jsonify({
        "active": [v.to_dict(include_trail=False) for v in active],
        "recentEnded": [v.to_dict(include_trail=False) for v in recent_ended],
        "fetchedAt": time.time(),
    })


# ---------------------------------------------------------------------------
# Subscription API-Key admin (rotate / clear)
# ---------------------------------------------------------------------------

@alarm_bp.route("/interfaces/<iid>/api-key/rotate", methods=["POST"])
@login_required
@role_required("tenant_admin")
def rotate_api_key(iid):
    tid = g.tenant_id
    iface = AlarmInterface.query.filter_by(id=iid, tenant_id=tid).first()
    if not iface:
        return jsonify({"error": "Schnittstelle nicht gefunden"}), 404
    if iface.interface_type != "subscription":
        return jsonify({"error": "API-Key nur für Subscription-Schnittstellen"}), 400
    raw = _generate_api_key(iface)
    db.session.commit()
    _bump_iface(tid)
    audit_log("rotate_api_key", "alarm_interface", iface.id, iface.name)
    return jsonify({"apiKey": raw, "apiKeyPrefix": iface.api_key_prefix})


# ---------------------------------------------------------------------------
# Admin views of subscriptions / stats / examples / templates
# ---------------------------------------------------------------------------

@alarm_bp.route("/interfaces/<iid>/subscriptions", methods=["GET"])
@login_required
@role_required("tenant_admin")
def admin_list_subscriptions(iid):
    tid = g.tenant_id
    iface = AlarmInterface.query.filter_by(id=iid, tenant_id=tid).first()
    if not iface:
        return jsonify({"error": "Schnittstelle nicht gefunden"}), 404
    subs = AlarmSubscription.query.filter_by(interface_id=iid).order_by(AlarmSubscription.created_at.desc()).all()
    return jsonify({"items": [s.to_dict() for s in subs]})


@alarm_bp.route("/interfaces/<iid>/subscriptions/<sid>", methods=["DELETE"])
@login_required
@role_required("tenant_admin")
def admin_revoke_subscription(iid, sid):
    """Admin override: revoke a subscriber even if the third party didn't
    unregister itself (e.g. callback URL is dead, security incident)."""
    tid = g.tenant_id
    iface = AlarmInterface.query.filter_by(id=iid, tenant_id=tid).first()
    if not iface:
        return jsonify({"error": "Schnittstelle nicht gefunden"}), 404
    sub = AlarmSubscription.query.filter_by(id=sid, interface_id=iid).first()
    if not sub:
        return jsonify({"error": "Abonnement nicht gefunden"}), 404
    db.session.delete(sub)
    db.session.commit()
    audit_log("delete", "alarm_subscription", sid, sub.name or sub.callback_url)
    return jsonify({"ok": True})


@alarm_bp.route("/interfaces/<iid>/subscriptions/<sid>/deliveries", methods=["GET"])
@login_required
@role_required("tenant_admin")
def admin_subscription_deliveries(iid, sid):
    """Per-subscriber delivery audit — useful for diagnosing one bad
    callback without scrolling through the whole channel's log."""
    tid = g.tenant_id
    iface = AlarmInterface.query.filter_by(id=iid, tenant_id=tid).first()
    if not iface:
        return jsonify({"error": "Schnittstelle nicht gefunden"}), 404
    sub = AlarmSubscription.query.filter_by(id=sid, interface_id=iid).first()
    if not sub:
        return jsonify({"error": "Abonnement nicht gefunden"}), 404
    limit = min(200, int(request.args.get("limit", 50)))
    items = (AlarmDelivery.query
             .filter_by(tenant_id=tid, interface_id=iid, subscription_id=sid)
             .order_by(AlarmDelivery.started_at.desc())
             .limit(limit).all())
    return jsonify({"items": [d.to_dict() for d in items]})


@alarm_bp.route("/interfaces/<iid>/subscriptions/<sid>/test", methods=["POST"])
@login_required
@role_required("tenant_admin")
def admin_test_subscription(iid, sid):
    """Admin „Test-Push" to one specific subscriber (useful for diagnosing
    a single dead callback URL without spamming the rest of the channel)."""
    tid = g.tenant_id
    iface = AlarmInterface.query.filter_by(id=iid, tenant_id=tid).first()
    if not iface or iface.interface_type != "subscription":
        return jsonify({"error": "Schnittstelle nicht gefunden"}), 404
    sub = AlarmSubscription.query.filter_by(id=sid, interface_id=iid).first()
    if not sub:
        return jsonify({"error": "Abonnement nicht gefunden"}), 404
    from services.alarm_dispatcher import _push_to_subscriber, build_example_context, render_payload  # type: ignore
    ctx = build_example_context(); ctx["trigger"] = "manual_test"
    payload = render_payload(iface.payload_template or {}, ctx)
    return jsonify(_push_to_subscriber(iface, sub, payload,
                                       trigger_type="manual_test",
                                       rule_id=None, violation_id=None))


@alarm_bp.route("/interfaces/<iid>/stats", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_interface_stats(iid):
    tid = g.tenant_id
    return jsonify(build_interface_stats(iid, tid))


def _resolve_external_base_url(tenant_id: str) -> str:
    """Prefer the tenant's configured external URL ("Externe URL" setting),
    fall back to the host the request arrived on. Used for all snippets and
    Copy-Buttons that show third-party-facing endpoints.
    """
    settings = TenantSettings.query.filter_by(tenant_id=tenant_id).first()
    configured = (settings.firmware_backend_url or "").strip() if settings else ""
    if configured:
        return configured.rstrip("/")
    return request.host_url.rstrip("/")


@alarm_bp.route("/interfaces/<iid>/usage-examples", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_interface_usage_examples(iid):
    tid = g.tenant_id
    iface = AlarmInterface.query.filter_by(id=iid, tenant_id=tid).first()
    if not iface:
        return jsonify({"error": "Schnittstelle nicht gefunden"}), 404
    origin = _resolve_external_base_url(tid)
    return jsonify(build_usage_examples(iface, request_origin=origin))


# ---------------------------------------------------------------------------
# Subscription registration (third-party-facing, api-key-secured)
# ---------------------------------------------------------------------------

def _resolve_channel_from_request(channel_id: str) -> AlarmInterface | None:
    """Look up the channel from header X-API-Key (preferred) or
    Authorization: Bearer. The api_key authenticates the caller as someone
    who knows the channel's shared secret — effectively the operator that
    holds the key. We don't bind it to a specific tenant identity beyond
    the channel ownership.
    """
    raw = request.headers.get("X-API-Key", "").strip()
    if not raw:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            raw = auth[7:].strip()
    return _interface_for_api_key(channel_id, raw)


@integrations_bp.route("/subscriptions/<channel_id>/register", methods=["POST"])
def integrations_subscribe(channel_id):
    iface = _resolve_channel_from_request(channel_id)
    if not iface:
        return jsonify({"error": "Ungültiger API-Key oder Kanal"}), 401
    if not iface.enabled:
        return jsonify({"error": "Kanal ist deaktiviert"}), 403

    # Anti-burst: cap registration attempts per channel per minute. Pairs
    # with the per-channel subscriber cap below.
    if not _check_register_rate(iface.id):
        return jsonify({"error": "Zu viele Registrierungs-Versuche — bitte später erneut versuchen"}), 429

    data = request.get_json(silent=True) or {}
    callback_url = (data.get("callback_url") or "").strip()
    if not callback_url:
        return jsonify({"error": "callback_url muss eine http(s)-URL sein"}), 400
    ok, reason = _is_callback_url_safe(callback_url)
    if not ok:
        logger.warning("subscription register refused channel=%s url=%s reason=%s",
                       iface.id, callback_url[:200], reason)
        return jsonify({"error": reason}), 400

    # Hard cap on active subscribers per channel
    active_count = AlarmSubscription.query.filter_by(
        interface_id=iface.id, revoked_at=None
    ).count()
    if active_count >= _MAX_SUBSCRIBERS_PER_CHANNEL:
        return jsonify({
            "error": f"Kanal-Limit erreicht ({_MAX_SUBSCRIBERS_PER_CHANNEL} Subscriber). "
                     "Bitte alte Subscriber abmelden oder Admin-Hilfe anfragen."
        }), 409

    name = (data.get("name") or "")[:100] or None
    secret = secrets.token_hex(24)         # raw — returned ONCE
    sub = AlarmSubscription(
        interface_id=iface.id, name=name,
        callback_url=callback_url, secret=secret,
    )
    db.session.add(sub)
    db.session.commit()
    logger.info("subscription registered channel=%s sub=%s url=%s",
                iface.id, sub.id, callback_url[:80])
    return jsonify(sub.to_dict(include_secret=True)), 201


@integrations_bp.route("/subscriptions/<channel_id>", methods=["GET"])
def integrations_list_subs(channel_id):
    """List my own subscriptions on this channel — useful for a third-party
    operator to audit which callbacks they previously registered."""
    iface = _resolve_channel_from_request(channel_id)
    if not iface:
        return jsonify({"error": "Ungültiger API-Key oder Kanal"}), 401
    subs = AlarmSubscription.query.filter_by(interface_id=iface.id).all()
    # secret intentionally NOT included — the third party already has it from
    # the register response
    return jsonify({"items": [s.to_dict() for s in subs]})


@integrations_bp.route("/subscriptions/<channel_id>/<sub_id>", methods=["DELETE"])
def integrations_unsubscribe(channel_id, sub_id):
    iface = _resolve_channel_from_request(channel_id)
    if not iface:
        return jsonify({"error": "Ungültiger API-Key oder Kanal"}), 401
    sub = AlarmSubscription.query.filter_by(id=sub_id, interface_id=iface.id).first()
    if not sub:
        return jsonify({"error": "Abonnement nicht gefunden"}), 404
    db.session.delete(sub)
    db.session.commit()
    return jsonify({"ok": True})
