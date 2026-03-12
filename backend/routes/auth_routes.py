"""Authentication routes — login, refresh, me."""

import logging
import time

from flask import Blueprint, jsonify, request, g
from database import db
from auth import (
    check_password, generate_tokens, login_required, decode_token, hash_password,
)

logger = logging.getLogger("auth")

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate with username and password, return JWT tokens."""
    data = request.get_json()
    if not data or "username" not in data or "password" not in data:
        return jsonify({"error": "Benutzername und Passwort erforderlich"}), 400

    from models import User
    user = User.query.filter_by(username=data["username"]).first()

    if not user or not check_password(data["password"], user.password_hash):
        logger.warning("Failed login attempt for user: %s", data.get("username"))
        return jsonify({"error": "Ungültige Anmeldedaten"}), 401

    if not user.is_active:
        logger.warning("Login attempt for deactivated user: %s", user.username)
        return jsonify({"error": "Konto deaktiviert"}), 401

    # Update last_login
    user.last_login = time.time()
    db.session.commit()

    tokens = generate_tokens(user)
    logger.info("User logged in: %s (role=%s)", user.username, user.role)

    return jsonify({
        **tokens,
        "user": user.to_dict(include_tenant=True),
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

    tokens = generate_tokens(user)
    logger.info("Token refreshed for user: %s", user.username)

    return jsonify(tokens)


@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    """Get current authenticated user info."""
    return jsonify(g.current_user.to_dict(include_tenant=True))
