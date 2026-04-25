"""Alarm interfaces + alarm rules + delivery log routes.

Two blueprints:
  * alarm_bp   — /api/admin/interfaces, /api/admin/alarm-rules,
                 /api/admin/alarm-deliveries (tenant_admin auth)
  * integrations_bp — /api/integrations/violations (service-token auth, pull-in)
"""
from __future__ import annotations

import hashlib
import json
import logging
import secrets
import time

from flask import Blueprint, g, jsonify, request, current_app

from auth import login_required, role_required, service_token_required
from database import db
from models import (
    AlarmInterface, AlarmRule, AlarmDelivery,
    FlightZone, ServiceToken, Tenant, ViolationRecord,
)
from services.alarm_dispatcher import (
    build_variable_pool, build_example_context,
    encrypt_auth_config, merge_auth_for_update,
    render_payload, send_request,
)
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
    if iface.interface_type == "pull_in":
        raw_pull_token, st = _create_pull_token(tid, name)
        iface.service_token_id = st.id

    db.session.add(iface)
    db.session.commit()
    _bump_iface(tid)
    audit_log("create", "alarm_interface", iface.id, name)
    logger.info("interface created: %s (%s)", iface.id, iface.name)
    return jsonify(iface.to_dict(raw_pull_token=raw_pull_token)), 201


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
def list_templates():
    """Phase 3 fills this with curated templates (Alamos FE2, Slack, …).
    Phase 1 returns an empty list so the frontend's UI doesn't break."""
    return jsonify({"items": []})


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
