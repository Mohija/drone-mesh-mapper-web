"""
Authentication module — JWT tokens, password hashing, decorators.
"""

import logging
import os
import time
from functools import wraps

import bcrypt
import jwt
from flask import g, jsonify, request
from database import db

logger = logging.getLogger("auth")

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRY = 3600  # 1 hour
REFRESH_TOKEN_EXPIRY = 604800  # 7 days


def hash_password(password: str) -> str:
    """Hash a password with bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def check_password(password: str, hashed: str) -> bool:
    """Verify a password against a bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def generate_tokens(user, tenant_id: str | None = None) -> dict:
    """Generate access and refresh tokens for a user.
    tenant_id: the tenant the user is logging into (from membership or selection).
    """
    effective_tenant = tenant_id or user.tenant_id
    # Determine effective role for this tenant
    effective_role = user.role
    if user.role != "super_admin" and effective_tenant:
        tenant_role = user.get_role_for_tenant(effective_tenant)
        if tenant_role:
            effective_role = tenant_role

    now = time.time()
    access_payload = {
        "user_id": user.id,
        "username": user.username,
        "role": effective_role,
        "tenant_id": effective_tenant,
        "type": "access",
        "iat": now,
        "exp": now + ACCESS_TOKEN_EXPIRY,
    }
    refresh_payload = {
        "user_id": user.id,
        "tenant_id": effective_tenant,
        "type": "refresh",
        "iat": now,
        "exp": now + REFRESH_TOKEN_EXPIRY,
    }
    return {
        "access_token": jwt.encode(access_payload, JWT_SECRET, algorithm=JWT_ALGORITHM),
        "refresh_token": jwt.encode(refresh_payload, JWT_SECRET, algorithm=JWT_ALGORITHM),
        "expires_in": ACCESS_TOKEN_EXPIRY,
    }


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT token. Returns payload or None."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def login_required(f):
    """Decorator: requires valid access token. Sets g.current_user, g.tenant_id, g.effective_role."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authentifizierung erforderlich"}), 401

        token = auth_header[7:]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token abgelaufen"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Ungültiger Token"}), 401

        if payload.get("type") != "access":
            return jsonify({"error": "Ungültiger Token"}), 401

        from models import User
        user = db.session.get(User, payload["user_id"])
        if not user or not user.is_active:
            return jsonify({"error": "Ungültiger Token"}), 401

        g.current_user = user
        # Read tenant_id from JWT (selected at login), not from user model
        g.tenant_id = payload.get("tenant_id") or user.tenant_id
        # Effective role for this tenant context
        g.effective_role = payload.get("role") or user.role
        return f(*args, **kwargs)
    return decorated


def role_required(*roles):
    """Decorator: requires user to have one of the specified roles.
    Must be used after @login_required.
    Supports role hierarchy: super_admin > tenant_admin > user.
    Uses g.effective_role (from JWT) which reflects the per-tenant role.
    """
    ROLE_HIERARCHY = {"super_admin": 3, "tenant_admin": 2, "user": 1}

    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = getattr(g, "current_user", None)
            if not user:
                return jsonify({"error": "Authentifizierung erforderlich"}), 401

            # Use effective role (per-tenant) rather than global role
            effective = getattr(g, "effective_role", user.role)
            user_level = ROLE_HIERARCHY.get(effective, 0)
            required_level = min(ROLE_HIERARCHY.get(r, 99) for r in roles)
            if user_level < required_level:
                return jsonify({"error": "Keine Berechtigung"}), 403

            return f(*args, **kwargs)
        return decorated
    return decorator


def node_auth_required(f):
    """Decorator: requires valid X-Node-Key header. Sets g.receiver_node, g.tenant_id."""
    @wraps(f)
    def decorated(*args, **kwargs):
        from services.connection_log import connection_log

        api_key = request.headers.get("X-Node-Key", "") or request.args.get("key", "")
        client_ip = request.remote_addr or ""

        if not api_key:
            # Log failed auth attempt (broadcast to all tenants that have logging enabled)
            connection_log.log("_global",
                receiver_id=None, receiver_name=None,
                endpoint=request.path, method=request.method,
                http_status=401, error="X-Node-Key header fehlt",
                ip=client_ip)
            return jsonify({"error": "X-Node-Key header erforderlich"}), 401

        from models import ReceiverNode, Tenant
        node = ReceiverNode.query.filter_by(api_key=api_key).first()
        if not node:
            connection_log.log("_global",
                receiver_id=None, receiver_name=None,
                endpoint=request.path, method=request.method,
                http_status=401, error=f"Ungültiger API-Key ({api_key[:8]}...)",
                ip=client_ip)
            return jsonify({"error": "Ungültiger API-Key"}), 401
        if not node.is_active:
            connection_log.log(node.tenant_id,
                receiver_id=node.id, receiver_name=node.name,
                endpoint=request.path, method=request.method,
                http_status=403, error="Empfänger deaktiviert",
                ip=client_ip)
            return jsonify({"error": "Empfänger deaktiviert"}), 403

        tenant = db.session.get(Tenant, node.tenant_id)
        if not tenant or not tenant.is_active:
            return jsonify({"error": "Mandant deaktiviert"}), 403

        g.receiver_node = node
        g.tenant_id = node.tenant_id
        return f(*args, **kwargs)
    return decorated


def seed_super_admin(app):
    """Create default super_admin user if none exists."""
    from models import User
    from database import db

    with app.app_context():
        if not User.query.filter_by(role="super_admin").first():
            admin = User(
                username="admin",
                email="admin@flightarc.local",
                password_hash=hash_password(os.environ.get("ADMIN_PASSWORD", "admin")),
                display_name="Administrator",
                role="super_admin",
                tenant_id=None,
            )
            db.session.add(admin)
            db.session.commit()
            logger.info("Created super_admin user: admin")
