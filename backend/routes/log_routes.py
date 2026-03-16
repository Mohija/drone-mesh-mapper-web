"""
Log routes — Admin log viewer API for per-tenant system logs.
"""

import logging

from flask import Blueprint, g, jsonify, request
from database import db
from auth import login_required, role_required

logger = logging.getLogger("logs")

log_bp = Blueprint("logs", __name__, url_prefix="/api/admin/logs")


@log_bp.route("", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_logs():
    """Get logs for current tenant.
    Query params: level, module, search, limit (default 200), offset (default 0)
    """
    from models import SystemLog

    tid = g.tenant_id
    limit = request.args.get("limit", 200, type=int)
    offset = request.args.get("offset", 0, type=int)
    level = request.args.get("level", "").strip().lower()
    module = request.args.get("module", "").strip()
    search = request.args.get("search", "").strip()

    # Clamp limits
    limit = max(1, min(limit, 1000))
    offset = max(0, offset)

    query = SystemLog.query.filter_by(tenant_id=tid)

    if level:
        query = query.filter(SystemLog.level == level)
    if module:
        query = query.filter(SystemLog.module == module)
    if search:
        query = query.filter(SystemLog.message.ilike(f"%{search}%"))

    total = query.count()
    logs = (
        query
        .order_by(SystemLog.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return jsonify({
        "logs": [log.to_dict() for log in logs],
        "total": total,
        "limit": limit,
        "offset": offset,
    })


@log_bp.route("/levels", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_log_level():
    """Get current log level for tenant."""
    from flask import current_app
    db_handler = current_app.config.get("_db_handler")
    if db_handler:
        level = db_handler.get_tenant_level(g.tenant_id)
    else:
        level = "info"
    return jsonify({"level": level})


@log_bp.route("/levels", methods=["POST"])
@login_required
@role_required("tenant_admin")
def set_log_level():
    """Set log level for tenant. Body: {"level": "debug|info|warning|error"}"""
    from flask import current_app

    data = request.get_json(silent=True) or {}
    level = (data.get("level") or "").strip().lower()

    valid_levels = ("debug", "info", "warning", "error")
    if level not in valid_levels:
        return jsonify({"error": f"Ungültiges Level. Erlaubt: {', '.join(valid_levels)}"}), 400

    db_handler = current_app.config.get("_db_handler")
    if db_handler:
        db_handler.set_tenant_level(g.tenant_id, level)

    # Also persist in tenant settings
    from models import TenantSettings
    ts = TenantSettings.query.filter_by(tenant_id=g.tenant_id).first()
    if ts:
        ts.log_level = level
        db.session.commit()

    logger.info("Log level set to %s for tenant %s", level, g.tenant_id,
                extra={"tenant_id": g.tenant_id})
    return jsonify({"level": level})


@log_bp.route("", methods=["DELETE"])
@login_required
@role_required("tenant_admin")
def clear_logs():
    """Clear all logs for current tenant."""
    from models import SystemLog

    tid = g.tenant_id
    count = SystemLog.query.filter_by(tenant_id=tid).delete()
    db.session.commit()

    logger.info("Cleared %d log entries for tenant %s", count, tid,
                extra={"tenant_id": tid})
    return jsonify({"status": "cleared", "count": count})


@log_bp.route("/modules", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_modules():
    """Return distinct module names for filtering."""
    from models import SystemLog

    tid = g.tenant_id
    rows = (
        db.session.query(SystemLog.module)
        .filter_by(tenant_id=tid)
        .distinct()
        .all()
    )
    modules = sorted([r[0] for r in rows])
    return jsonify({"modules": modules})
