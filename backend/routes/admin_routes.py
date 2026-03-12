"""Admin routes — tenant, user, and membership management."""

import logging
import re

from flask import Blueprint, jsonify, request, g
from database import db
from auth import login_required, role_required, hash_password

logger = logging.getLogger("admin")

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


# ─── Tenant Management (super_admin only) ────────────────────


@admin_bp.route("/tenants", methods=["GET"])
@login_required
@role_required("super_admin")
def list_tenants():
    """List all tenants with user/zone counts."""
    from models import Tenant, User, FlightZone, UserTenantMembership
    tenants = Tenant.query.all()
    result = []
    for t in tenants:
        d = t.to_dict()
        d["user_count"] = UserTenantMembership.query.filter_by(tenant_id=t.id).count()
        d["zone_count"] = FlightZone.query.filter_by(tenant_id=t.id).count()
        result.append(d)
    return jsonify(result)


@admin_bp.route("/tenants", methods=["POST"])
@login_required
@role_required("super_admin")
def create_tenant():
    """Create a new tenant."""
    from models import Tenant, TenantSettings
    from settings import DEFAULT_SOURCES
    import json

    data = request.get_json()
    if not data or "name" not in data or "display_name" not in data:
        return jsonify({"error": "name und display_name erforderlich"}), 400

    name = data["name"].strip().lower()
    if not re.match(r"^[a-z0-9][a-z0-9-]*$", name):
        return jsonify({"error": "Name darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten"}), 400

    if Tenant.query.filter_by(name=name).first():
        return jsonify({"error": "Mandant mit diesem Namen existiert bereits"}), 409

    display_name = data["display_name"].strip()
    if not display_name:
        return jsonify({"error": "Anzeigename erforderlich"}), 400

    tenant = Tenant(name=name, display_name=display_name)
    db.session.add(tenant)
    db.session.flush()

    settings = TenantSettings(
        tenant_id=tenant.id,
        sources=json.loads(json.dumps(DEFAULT_SOURCES)),
        center_lat=52.0302,
        center_lon=8.5325,
        radius=50000,
    )
    db.session.add(settings)
    db.session.commit()

    logger.info("Tenant created: %s (%s)", name, tenant.id)
    return jsonify(tenant.to_dict()), 201


@admin_bp.route("/tenants/<tenant_id>", methods=["GET"])
@login_required
@role_required("super_admin")
def get_tenant(tenant_id):
    """Get tenant details."""
    from models import Tenant, FlightZone, UserTenantMembership
    tenant = db.session.get(Tenant, tenant_id)
    if not tenant:
        return jsonify({"error": "Mandant nicht gefunden"}), 404
    d = tenant.to_dict()
    d["user_count"] = UserTenantMembership.query.filter_by(tenant_id=tenant.id).count()
    d["zone_count"] = FlightZone.query.filter_by(tenant_id=tenant.id).count()
    return jsonify(d)


@admin_bp.route("/tenants/<tenant_id>", methods=["PUT"])
@login_required
@role_required("super_admin")
def update_tenant(tenant_id):
    """Update a tenant."""
    from models import Tenant
    tenant = db.session.get(Tenant, tenant_id)
    if not tenant:
        return jsonify({"error": "Mandant nicht gefunden"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    if "display_name" in data:
        display_name = data["display_name"].strip()
        if not display_name:
            return jsonify({"error": "Anzeigename erforderlich"}), 400
        tenant.display_name = display_name
    if "is_active" in data:
        tenant.is_active = bool(data["is_active"])

    db.session.commit()
    logger.info("Tenant updated: %s", tenant_id)
    return jsonify(tenant.to_dict())


@admin_bp.route("/tenants/<tenant_id>", methods=["DELETE"])
@login_required
@role_required("super_admin")
def delete_tenant(tenant_id):
    """Delete a tenant (cascade: users, zones, trails, settings, memberships)."""
    from models import Tenant
    tenant = db.session.get(Tenant, tenant_id)
    if not tenant:
        return jsonify({"error": "Mandant nicht gefunden"}), 404

    if tenant.name == "default":
        return jsonify({"error": "Standard-Mandant kann nicht gelöscht werden"}), 403

    db.session.delete(tenant)
    db.session.commit()
    logger.info("Tenant deleted: %s (%s)", tenant.name, tenant_id)
    return jsonify({"status": "deleted"})


# ─── User Management ─────────────────────────────────────────


@admin_bp.route("/users", methods=["GET"])
@login_required
@role_required("tenant_admin")
def list_users():
    """List users. super_admin sees all, tenant_admin sees own tenant only (via memberships)."""
    from models import User, UserTenantMembership
    if g.current_user.role == "super_admin":
        tenant_filter = request.args.get("tenant_id")
        if tenant_filter:
            # Get users who are members of this tenant
            memberships = UserTenantMembership.query.filter_by(tenant_id=tenant_filter).all()
            user_ids = [m.user_id for m in memberships]
            users = User.query.filter(User.id.in_(user_ids)).all() if user_ids else []
            # Include membership role info
            membership_roles = {m.user_id: m.role for m in memberships}
            result = []
            for u in users:
                d = u.to_dict(include_tenant=True, tenant_id=tenant_filter)
                d["membership_role"] = membership_roles.get(u.id, u.role)
                result.append(d)
            return jsonify(result)
        else:
            users = User.query.all()
            return jsonify([u.to_dict(include_tenant=True) for u in users])
    else:
        # tenant_admin: show users in current tenant via memberships
        tenant_id = g.tenant_id
        memberships = UserTenantMembership.query.filter_by(tenant_id=tenant_id).all()
        user_ids = [m.user_id for m in memberships]
        users = User.query.filter(User.id.in_(user_ids)).all() if user_ids else []
        membership_roles = {m.user_id: m.role for m in memberships}
        result = []
        for u in users:
            d = u.to_dict(include_tenant=True, tenant_id=tenant_id)
            d["membership_role"] = membership_roles.get(u.id, u.role)
            result.append(d)
        return jsonify(result)


@admin_bp.route("/users", methods=["POST"])
@login_required
@role_required("tenant_admin")
def create_user():
    """Create a new user and add membership to the specified tenant."""
    from models import User, Tenant, UserTenantMembership

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    required = ["username", "email", "password", "display_name", "role", "tenant_id"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"{field} erforderlich"}), 400

    username = data["username"].strip()
    email = data["email"].strip()
    password = data["password"]
    display_name = data["display_name"].strip()
    role = data["role"]
    tenant_id = data["tenant_id"]

    if not username or not email or not display_name:
        return jsonify({"error": "Alle Felder müssen ausgefüllt sein"}), 400

    if len(password) < 8:
        return jsonify({"error": "Passwort muss mindestens 8 Zeichen lang sein"}), 400

    if role not in ("super_admin", "tenant_admin", "user"):
        return jsonify({"error": "Ungültige Rolle"}), 400

    # Permission checks
    if g.current_user.role != "super_admin":
        if role == "super_admin":
            return jsonify({"error": "Keine Berechtigung für diese Rolle"}), 403
        if tenant_id != g.tenant_id:
            return jsonify({"error": "Keine Berechtigung für diesen Mandanten"}), 403

    # Validate tenant exists
    if tenant_id:
        tenant = db.session.get(Tenant, tenant_id)
        if not tenant:
            return jsonify({"error": "Mandant nicht gefunden"}), 404

    # Uniqueness checks
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Benutzername bereits vergeben"}), 409
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "E-Mail-Adresse bereits vergeben"}), 409

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        display_name=display_name,
        role=role if role == "super_admin" else "user",  # global role
        tenant_id=tenant_id if role != "super_admin" else None,
    )
    db.session.add(user)
    db.session.flush()

    # Create membership (unless super_admin)
    if role != "super_admin" and tenant_id:
        membership = UserTenantMembership(
            user_id=user.id,
            tenant_id=tenant_id,
            role=role,  # per-tenant role
        )
        db.session.add(membership)

    db.session.commit()

    logger.info("User created: %s (role=%s, tenant=%s)", username, role, tenant_id)
    return jsonify(user.to_dict(include_tenant=True)), 201


@admin_bp.route("/users/<user_id>", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_user(user_id):
    """Get user details."""
    from models import User
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "Benutzer nicht gefunden"}), 404

    # tenant_admin can only see users in their tenant (via memberships)
    if g.current_user.role != "super_admin":
        if not user.get_role_for_tenant(g.tenant_id):
            return jsonify({"error": "Benutzer nicht gefunden"}), 404

    result = user.to_dict(include_tenant=True)
    result["memberships"] = [m.to_dict() for m in user.memberships]
    return jsonify(result)


@admin_bp.route("/users/<user_id>", methods=["PUT"])
@login_required
@role_required("tenant_admin")
def update_user(user_id):
    """Update a user."""
    from models import User, UserTenantMembership
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "Benutzer nicht gefunden"}), 404

    # tenant_admin can only edit users in their tenant
    if g.current_user.role != "super_admin":
        if not user.get_role_for_tenant(g.tenant_id):
            return jsonify({"error": "Keine Berechtigung"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    if "display_name" in data:
        user.display_name = data["display_name"].strip()
    if "email" in data:
        email = data["email"].strip()
        existing = User.query.filter_by(email=email).first()
        if existing and existing.id != user.id:
            return jsonify({"error": "E-Mail-Adresse bereits vergeben"}), 409
        user.email = email
    if "role" in data:
        new_role = data["role"]
        if g.current_user.role != "super_admin" and new_role == "super_admin":
            return jsonify({"error": "Keine Berechtigung"}), 403
        if new_role == "super_admin":
            user.role = "super_admin"
        else:
            # Update membership role for the current tenant
            tenant_id = data.get("tenant_id") or g.tenant_id
            membership = UserTenantMembership.query.filter_by(
                user_id=user.id, tenant_id=tenant_id
            ).first()
            if membership:
                membership.role = new_role
    if "is_active" in data:
        user.is_active = bool(data["is_active"])

    db.session.commit()
    logger.info("User updated: %s", user_id)
    return jsonify(user.to_dict(include_tenant=True))


@admin_bp.route("/users/<user_id>", methods=["DELETE"])
@login_required
@role_required("tenant_admin")
def delete_user(user_id):
    """Delete a user."""
    from models import User
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "Benutzer nicht gefunden"}), 404

    # Cannot delete super_admin via API
    if user.role == "super_admin":
        return jsonify({"error": "Super-Admin kann nicht gelöscht werden"}), 403

    # tenant_admin can only delete users in their tenant
    if g.current_user.role != "super_admin":
        if not user.get_role_for_tenant(g.tenant_id):
            return jsonify({"error": "Keine Berechtigung"}), 403

    db.session.delete(user)
    db.session.commit()
    logger.info("User deleted: %s", user_id)
    return jsonify({"status": "deleted"})


@admin_bp.route("/users/<user_id>/password", methods=["POST"])
@login_required
@role_required("tenant_admin")
def reset_password(user_id):
    """Reset a user's password."""
    from models import User
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "Benutzer nicht gefunden"}), 404

    if g.current_user.role != "super_admin":
        if not user.get_role_for_tenant(g.tenant_id):
            return jsonify({"error": "Keine Berechtigung"}), 403

    data = request.get_json()
    if not data or "new_password" not in data:
        return jsonify({"error": "new_password erforderlich"}), 400

    if len(data["new_password"]) < 8:
        return jsonify({"error": "Passwort muss mindestens 8 Zeichen lang sein"}), 400

    user.password_hash = hash_password(data["new_password"])
    db.session.commit()
    logger.info("Password reset for user: %s", user_id)
    return jsonify({"status": "ok"})


# ─── Membership Management ───────────────────────────────────


@admin_bp.route("/users/<user_id>/memberships", methods=["GET"])
@login_required
@role_required("tenant_admin")
def list_user_memberships(user_id):
    """List all tenant memberships for a user."""
    from models import User
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "Benutzer nicht gefunden"}), 404

    if g.current_user.role != "super_admin":
        if not user.get_role_for_tenant(g.tenant_id):
            return jsonify({"error": "Keine Berechtigung"}), 403

    return jsonify([m.to_dict() for m in user.memberships])


@admin_bp.route("/users/<user_id>/memberships", methods=["POST"])
@login_required
@role_required("super_admin")
def add_user_membership(user_id):
    """Add a tenant membership for a user. Body: { tenant_id, role }"""
    from models import User, Tenant, UserTenantMembership
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "Benutzer nicht gefunden"}), 404

    if user.role == "super_admin":
        return jsonify({"error": "Super-Admin benötigt keine Mandanten-Zuordnung"}), 400

    data = request.get_json()
    if not data or "tenant_id" not in data:
        return jsonify({"error": "tenant_id erforderlich"}), 400

    tenant_id = data["tenant_id"]
    role = data.get("role", "user")
    if role not in ("tenant_admin", "user"):
        return jsonify({"error": "Ungültige Rolle (tenant_admin oder user)"}), 400

    tenant = db.session.get(Tenant, tenant_id)
    if not tenant:
        return jsonify({"error": "Mandant nicht gefunden"}), 404

    existing = UserTenantMembership.query.filter_by(
        user_id=user.id, tenant_id=tenant_id
    ).first()
    if existing:
        return jsonify({"error": "Zuordnung existiert bereits"}), 409

    membership = UserTenantMembership(
        user_id=user.id, tenant_id=tenant_id, role=role
    )
    db.session.add(membership)
    db.session.commit()

    logger.info("Membership added: user=%s tenant=%s role=%s", user.username, tenant_id, role)
    return jsonify(membership.to_dict()), 201


@admin_bp.route("/memberships/<membership_id>", methods=["PUT"])
@login_required
@role_required("super_admin")
def update_membership(membership_id):
    """Update a membership's role."""
    from models import UserTenantMembership
    membership = db.session.get(UserTenantMembership, membership_id)
    if not membership:
        return jsonify({"error": "Zuordnung nicht gefunden"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    if "role" in data:
        role = data["role"]
        if role not in ("tenant_admin", "user"):
            return jsonify({"error": "Ungültige Rolle"}), 400
        membership.role = role

    db.session.commit()
    logger.info("Membership updated: %s (role=%s)", membership_id, membership.role)
    return jsonify(membership.to_dict())


@admin_bp.route("/memberships/<membership_id>", methods=["DELETE"])
@login_required
@role_required("super_admin")
def delete_membership(membership_id):
    """Remove a tenant membership."""
    from models import UserTenantMembership
    membership = db.session.get(UserTenantMembership, membership_id)
    if not membership:
        return jsonify({"error": "Zuordnung nicht gefunden"}), 404

    db.session.delete(membership)
    db.session.commit()
    logger.info("Membership deleted: %s", membership_id)
    return jsonify({"status": "deleted"})
