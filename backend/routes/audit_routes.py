"""Audit log routes — read-only access to the audit trail."""
import csv
import io
import json
import logging
import time

from flask import Blueprint, Response, g, jsonify, request
from auth import login_required, role_required
from models import AuditLog, TenantSettings
from database import db

logger = logging.getLogger("audit")

audit_bp = Blueprint("audit", __name__, url_prefix="/api/admin/audit")


@audit_bp.route("", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_audit_logs():
    """Get audit log entries for the current tenant."""
    tid = g.tenant_id
    query = AuditLog.query.filter_by(tenant_id=tid)

    action = request.args.get("action")
    if action:
        query = query.filter(AuditLog.action == action)

    resource_type = request.args.get("resource_type")
    if resource_type:
        query = query.filter(AuditLog.resource_type == resource_type)

    user = request.args.get("user")
    if user:
        query = query.filter(AuditLog.username.ilike(f"%{user}%"))

    search = request.args.get("search")
    if search:
        query = query.filter(
            db.or_(
                AuditLog.resource_name.ilike(f"%{search}%"),
                AuditLog.username.ilike(f"%{search}%"),
                AuditLog.resource_id.ilike(f"%{search}%"),
            )
        )

    limit = min(int(request.args.get("limit", 100)), 500)
    offset = int(request.args.get("offset", 0))

    total = query.count()
    entries = query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()

    return jsonify({
        "entries": [e.to_dict() for e in entries],
        "total": total,
        "limit": limit,
        "offset": offset,
    })


@audit_bp.route("/actions", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_audit_actions():
    """Get list of distinct actions in the audit log."""
    tid = g.tenant_id
    actions = db.session.query(AuditLog.action).filter_by(tenant_id=tid).distinct().all()
    return jsonify([a[0] for a in actions])


@audit_bp.route("/resource-types", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_audit_resource_types():
    """Get list of distinct resource types in the audit log."""
    tid = g.tenant_id
    types = db.session.query(AuditLog.resource_type).filter_by(tenant_id=tid).distinct().all()
    return jsonify([t[0] for t in types])


@audit_bp.route("/enabled", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_audit_enabled():
    """Check if audit logging is enabled for this tenant."""
    ts = TenantSettings.query.filter_by(tenant_id=g.tenant_id).first()
    return jsonify({"enabled": ts.audit_enabled if ts else False})


@audit_bp.route("/enabled", methods=["POST"])
@login_required
@role_required("tenant_admin")
def set_audit_enabled():
    """Enable or disable audit logging for this tenant."""
    data = request.get_json(silent=True) or {}
    enabled = bool(data.get("enabled", False))

    ts = TenantSettings.query.filter_by(tenant_id=g.tenant_id).first()
    if not ts:
        return jsonify({"error": "Mandant nicht gefunden"}), 404

    ts.audit_enabled = enabled
    db.session.commit()
    logger.info("Audit logging %s for tenant %s", "enabled" if enabled else "disabled", g.tenant_id)
    return jsonify({"enabled": enabled})


@audit_bp.route("/download", methods=["GET"])
@login_required
@role_required("tenant_admin")
def download_audit_log():
    """Download the full audit log as CSV."""
    tid = g.tenant_id
    fmt = request.args.get("format", "csv")

    entries = AuditLog.query.filter_by(tenant_id=tid).order_by(AuditLog.timestamp.desc()).all()

    if fmt == "json":
        data = json.dumps([e.to_dict() for e in entries], ensure_ascii=False, indent=2)
        return Response(
            data,
            mimetype="application/json",
            headers={"Content-Disposition": f"attachment; filename=audit-log-{tid}.json"},
        )

    # CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Zeitpunkt", "Benutzer", "Aktion", "Ressource-Typ", "Ressource-ID", "Ressource-Name", "Details", "IP"])
    for e in entries:
        from datetime import datetime
        ts = datetime.fromtimestamp(e.timestamp).strftime("%Y-%m-%d %H:%M:%S")
        details_str = json.dumps(e.details, ensure_ascii=False) if e.details else ""
        writer.writerow([ts, e.username, e.action, e.resource_type, e.resource_id or "", e.resource_name or "", details_str, e.ip_address or ""])

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=audit-log-{tid}.csv"},
    )
