"""Authentication routes — login, refresh, me, tenants, switch-tenant."""

import logging
import time

from flask import Blueprint, jsonify, request, g
from database import db
from auth import (
    check_password, generate_tokens, login_required, decode_token, hash_password,
)

logger = logging.getLogger("auth")

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/tenants", methods=["GET"])
def list_login_tenants():
    """Public endpoint: list all active tenants for the login form dropdown."""
    from models import Tenant
    tenants = Tenant.query.filter_by(is_active=True).all()
    return jsonify([
        {"id": t.id, "name": t.name, "display_name": t.display_name}
        for t in tenants
    ])


@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate with username, password, and tenant_id. Return JWT tokens."""
    data = request.get_json()
    if not data or "username" not in data or "password" not in data:
        return jsonify({"error": "Benutzername und Passwort erforderlich"}), 400

    from models import User, Tenant
    user = User.query.filter_by(username=data["username"]).first()

    if not user or not check_password(data["password"], user.password_hash):
        logger.warning("Failed login attempt for user: %s", data.get("username"))
        return jsonify({"error": "Ungültige Anmeldedaten"}), 401

    if not user.is_active:
        logger.warning("Login attempt for deactivated user: %s", user.username)
        return jsonify({"error": "Konto deaktiviert"}), 401

    # Determine target tenant
    tenant_id = data.get("tenant_id")

    if user.role == "super_admin":
        # Super admin can log into any active tenant
        if tenant_id:
            tenant = db.session.get(Tenant, tenant_id)
            if not tenant or not tenant.is_active:
                return jsonify({"error": "Mandant nicht gefunden oder inaktiv"}), 400
        else:
            # Default to first active tenant
            tenant = Tenant.query.filter_by(is_active=True).first()
            tenant_id = tenant.id if tenant else None
    else:
        # Non-super_admin: must have a membership for the selected tenant
        if tenant_id:
            role_for_tenant = user.get_role_for_tenant(tenant_id)
            if not role_for_tenant:
                return jsonify({"error": "Kein Zugriff auf diesen Mandanten"}), 403
            tenant = db.session.get(Tenant, tenant_id)
            if not tenant or not tenant.is_active:
                return jsonify({"error": "Mandant nicht gefunden oder inaktiv"}), 400
        else:
            # No tenant selected — use default tenant or first membership
            if user.tenant_id:
                tenant_id = user.tenant_id
            elif user.memberships:
                tenant_id = user.memberships[0].tenant_id
            else:
                return jsonify({"error": "Kein Mandant zugewiesen"}), 400

    # Update last_login
    user.last_login = time.time()
    db.session.commit()

    tokens = generate_tokens(user, tenant_id=tenant_id)
    logger.info("User logged in: %s (role=%s, tenant=%s)", user.username, user.role, tenant_id)

    # Include tenant list in login response for the frontend
    user_tenants = user.get_tenants()

    user_dict = user.to_dict(include_tenant=True, tenant_id=tenant_id)
    # Add effective role for this tenant
    effective_role = user.get_role_for_tenant(tenant_id) if tenant_id else user.role
    user_dict["effective_role"] = effective_role or user.role

    return jsonify({
        **tokens,
        "user": user_dict,
        "tenants": user_tenants,
    })


@auth_bp.route("/refresh", methods=["POST"])
def refresh():
    """Refresh an access token using a refresh token."""
    data = request.get_json()
    if not data or "refresh_token" not in data:
        return jsonify({"error": "Refresh-Token erforderlich"}), 400

    payload = decode_token(data["refresh_token"])
    if not payload or payload.get("type") != "refresh":
        return jsonify({"error": "Ungültiger Refresh-Token"}), 401

    from models import User
    user = db.session.get(User, payload["user_id"])
    if not user or not user.is_active:
        return jsonify({"error": "Ungültiger Refresh-Token"}), 401

    # Preserve the tenant_id from the refresh token
    tenant_id = payload.get("tenant_id") or user.tenant_id
    tokens = generate_tokens(user, tenant_id=tenant_id)
    logger.info("Token refreshed for user: %s (tenant=%s)", user.username, tenant_id)

    return jsonify(tokens)


@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    """Get current authenticated user info including tenant list."""
    user = g.current_user
    tenant_id = g.tenant_id
    user_dict = user.to_dict(include_tenant=True, tenant_id=tenant_id)
    effective_role = user.get_role_for_tenant(tenant_id) if tenant_id else user.role
    user_dict["effective_role"] = effective_role or user.role
    user_dict["tenants"] = user.get_tenants()
    return jsonify(user_dict)


@auth_bp.route("/switch-tenant", methods=["POST"])
@login_required
def switch_tenant():
    """Switch to a different tenant. Returns new tokens."""
    data = request.get_json()
    if not data or "tenant_id" not in data:
        return jsonify({"error": "tenant_id erforderlich"}), 400

    from models import Tenant
    tenant_id = data["tenant_id"]
    user = g.current_user

    tenant = db.session.get(Tenant, tenant_id)
    if not tenant or not tenant.is_active:
        return jsonify({"error": "Mandant nicht gefunden oder inaktiv"}), 404

    # Check access
    if user.role != "super_admin":
        role_for_tenant = user.get_role_for_tenant(tenant_id)
        if not role_for_tenant:
            return jsonify({"error": "Kein Zugriff auf diesen Mandanten"}), 403

    tokens = generate_tokens(user, tenant_id=tenant_id)
    user_dict = user.to_dict(include_tenant=True, tenant_id=tenant_id)
    effective_role = user.get_role_for_tenant(tenant_id) if tenant_id else user.role
    user_dict["effective_role"] = effective_role or user.role

    logger.info("User %s switched to tenant %s", user.username, tenant_id)

    return jsonify({
        **tokens,
        "user": user_dict,
    })
