"""Audit logging service — records user actions for security compliance."""
import time
from flask import g, request
from database import db


def audit_log(action: str, resource_type: str, resource_id: str = None,
              resource_name: str = None, details: dict = None):
    """Record an audit event. Must be called within a Flask request context.

    Only logs if audit is enabled for the current tenant.
    Automatically prunes entries older than 48 hours.
    """
    from models import AuditLog, TenantSettings

    tid = getattr(g, 'tenant_id', None)
    if not tid:
        return

    # Check if audit is enabled for this tenant
    ts = TenantSettings.query.filter_by(tenant_id=tid).first()
    if not ts or not ts.audit_enabled:
        return

    entry = AuditLog(
        tenant_id=tid,
        timestamp=time.time(),
        user_id=getattr(g.current_user, 'id', 'system') if hasattr(g, 'current_user') else 'system',
        username=getattr(g.current_user, 'username', 'system') if hasattr(g, 'current_user') else 'system',
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        resource_name=resource_name,
        details=details,
        ip_address=request.remote_addr if request else None,
    )
    db.session.add(entry)

    # Ring buffer: prune entries older than 48 hours (runs every ~50th call to avoid overhead)
    import random
    if random.random() < 0.02:  # ~2% chance per call
        cutoff = time.time() - 48 * 3600
        AuditLog.query.filter(
            AuditLog.tenant_id == tid,
            AuditLog.timestamp < cutoff,
        ).delete()
