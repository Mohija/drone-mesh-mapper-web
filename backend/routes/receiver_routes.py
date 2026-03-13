"""
Receiver routes — Admin CRUD + Node ingest/heartbeat endpoints.
"""

import logging
import os
import secrets
import subprocess
import tempfile
import time

from flask import Blueprint, g, jsonify, request, send_file
from database import db
from auth import login_required, role_required, node_auth_required
from models import ReceiverNode

logger = logging.getLogger("receivers")

receiver_bp = Blueprint("receivers", __name__, url_prefix="/api/receivers")


# ─── Admin CRUD (JWT auth, tenant_admin+) ──────────────────────


@receiver_bp.route("", methods=["GET"])
@login_required
@role_required("tenant_admin")
def list_receivers():
    """List all receiver nodes for the current tenant."""
    tid = g.tenant_id
    nodes = ReceiverNode.query.filter_by(tenant_id=tid).order_by(ReceiverNode.created_at.desc()).all()
    return jsonify([n.to_dict() for n in nodes])


@receiver_bp.route("", methods=["POST"])
@login_required
@role_required("tenant_admin")
def create_receiver():
    """Create a new receiver node. Returns the generated API key (shown once)."""
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    hardware_type = (data.get("hardware_type") or "").strip().lower()

    if not name:
        return jsonify({"error": "Name erforderlich"}), 400
    if hardware_type not in ReceiverNode.HARDWARE_TYPES:
        return jsonify({"error": f"Ungültiger Hardware-Typ. Erlaubt: {', '.join(ReceiverNode.HARDWARE_TYPES)}"}), 400

    node = ReceiverNode(
        tenant_id=g.tenant_id,
        name=name,
        hardware_type=hardware_type,
    )
    db.session.add(node)
    db.session.commit()

    logger.info("Created receiver %s (%s) for tenant %s", node.id, hardware_type, g.tenant_id)
    return jsonify(node.to_dict(include_key=True)), 201


@receiver_bp.route("/<node_id>", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_receiver(node_id: str):
    """Get a single receiver node."""
    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404
    return jsonify(node.to_dict())


@receiver_bp.route("/<node_id>", methods=["PUT"])
@login_required
@role_required("tenant_admin")
def update_receiver(node_id: str):
    """Update receiver name or active status."""
    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404

    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"error": "Name darf nicht leer sein"}), 400
        node.name = name
    if "is_active" in data:
        node.is_active = bool(data["is_active"])

    db.session.commit()
    logger.info("Updated receiver %s: name=%s active=%s", node.id, node.name, node.is_active)
    return jsonify(node.to_dict())


@receiver_bp.route("/<node_id>", methods=["DELETE"])
@login_required
@role_required("tenant_admin")
def delete_receiver(node_id: str):
    """Delete a receiver node."""
    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404

    db.session.delete(node)
    db.session.commit()
    logger.info("Deleted receiver %s from tenant %s", node_id, g.tenant_id)
    return jsonify({"ok": True})


@receiver_bp.route("/<node_id>/regenerate-key", methods=["POST"])
@login_required
@role_required("tenant_admin")
def regenerate_key(node_id: str):
    """Generate a new API key for a receiver. Returns the new key (shown once)."""
    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404

    node.api_key = secrets.token_hex(32)
    db.session.commit()
    logger.info("Regenerated API key for receiver %s", node.id)
    return jsonify(node.to_dict(include_key=True))


@receiver_bp.route("/stats", methods=["GET"])
@login_required
@role_required("tenant_admin")
def receiver_stats():
    """Aggregated statistics for all receiver nodes of the tenant."""
    tid = g.tenant_id
    nodes = ReceiverNode.query.filter_by(tenant_id=tid).all()

    online = sum(1 for n in nodes if n.status == "online")
    stale = sum(1 for n in nodes if n.status == "stale")
    offline = sum(1 for n in nodes if n.status == "offline")
    total_detections = sum(n.total_detections for n in nodes)

    return jsonify({
        "total": len(nodes),
        "online": online,
        "stale": stale,
        "offline": offline,
        "totalDetections": total_detections,
    })


# ─── Node Endpoints (X-Node-Key auth) ─────────────────────────


@receiver_bp.route("/ingest", methods=["POST"])
@node_auth_required
def ingest():
    """Receive drone detections from a hardware receiver."""
    from flask import current_app
    registry = current_app.config.get("_registry")
    if not registry:
        return jsonify({"error": "Registry nicht verfügbar"}), 500

    node = g.receiver_node
    data = request.get_json(silent=True) or {}

    node_lat = data.get("node_lat") or node.last_latitude
    node_lon = data.get("node_lon") or node.last_longitude
    detections = data.get("detections", [])

    if not isinstance(detections, list) or not detections:
        return jsonify({"error": "detections array erforderlich"}), 400

    # Update node location if provided
    if data.get("node_lat") is not None and data.get("node_lon") is not None:
        node.last_latitude = data["node_lat"]
        node.last_longitude = data["node_lon"]
        if data.get("node_accuracy") is not None:
            node.last_location_accuracy = data["node_accuracy"]

    # Update IP and heartbeat
    node.last_ip = request.remote_addr
    node.last_heartbeat = time.time()
    node.detections_since_boot = node.detections_since_boot + len(detections)
    node.total_detections = node.total_detections + len(detections)
    db.session.commit()

    # Store in receiver provider
    count = registry.receiver_provider.ingest(
        tenant_id=g.tenant_id,
        node_id=node.id,
        node_lat=node_lat,
        node_lon=node_lon,
        detections=detections,
    )

    return jsonify({"ok": True, "stored": count})


@receiver_bp.route("/heartbeat", methods=["POST"])
@node_auth_required
def heartbeat():
    """Status heartbeat from a hardware receiver."""
    node = g.receiver_node
    data = request.get_json(silent=True) or {}

    node.last_heartbeat = time.time()
    node.last_ip = request.remote_addr

    if "firmware_version" in data:
        node.firmware_version = data["firmware_version"]
    if "wifi_ssid" in data:
        node.wifi_ssid = data["wifi_ssid"]
    if "wifi_rssi" in data:
        node.wifi_rssi = data["wifi_rssi"]
    if "free_heap" in data:
        node.free_heap = data["free_heap"]
    if "uptime_seconds" in data:
        node.uptime_seconds = data["uptime_seconds"]
    if "detections_since_boot" in data:
        node.detections_since_boot = data["detections_since_boot"]

    # Update location if provided
    if data.get("latitude") is not None and data.get("longitude") is not None:
        node.last_latitude = data["latitude"]
        node.last_longitude = data["longitude"]
        if data.get("accuracy") is not None:
            node.last_location_accuracy = data["accuracy"]

    db.session.commit()

    logger.debug("Heartbeat from receiver %s (%s)", node.id, node.name)
    return jsonify({"ok": True, "server_time": time.time()})


# ─── Firmware Build Endpoint ───────────────────────────────


FIRMWARE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "firmware")
VENV_BIN = os.path.join(os.path.dirname(__file__), "..", "venv", "bin")

ENV_MAP = {
    "esp32-s3": "esp32-s3",
    "esp32-c3": "esp32-c3",
    "esp8266": "esp8266",
}


@receiver_bp.route("/firmware/build", methods=["POST"])
@login_required
@role_required("tenant_admin")
def build_firmware():
    """Build firmware on-demand via PlatformIO with baked-in credentials."""
    data = request.get_json(silent=True) or {}

    node_id = data.get("node_id", "")
    hardware_type = data.get("hardware_type", "")
    backend_url = data.get("backend_url", "")
    wifi_ssid = data.get("wifi_ssid", "")
    wifi_password = data.get("wifi_password", "")

    if not node_id:
        return jsonify({"error": "node_id erforderlich"}), 400

    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404

    hw = hardware_type or node.hardware_type
    if hw not in ENV_MAP:
        return jsonify({"error": f"Ungültiger Hardware-Typ: {hw}"}), 400

    if not backend_url:
        return jsonify({"error": "backend_url erforderlich"}), 400

    env_name = ENV_MAP[hw]
    pio_bin = os.path.join(VENV_BIN, "pio")

    if not os.path.isfile(pio_bin):
        return jsonify({"error": "PlatformIO nicht installiert. Führe backend/scripts/install-platformio.sh aus."}), 500

    if not os.path.isdir(FIRMWARE_DIR):
        return jsonify({"error": "Firmware-Verzeichnis nicht gefunden"}), 500

    # Build with environment variables for build flags
    env = os.environ.copy()
    env["BACKEND_URL"] = backend_url
    env["API_KEY"] = node.api_key
    env["WIFI_SSID"] = wifi_ssid
    env["WIFI_PASS"] = wifi_password
    env["NODE_NAME"] = node.name[:20]

    try:
        logger.info("Building firmware for %s (%s)...", node.id, env_name)
        result = subprocess.run(
            [pio_bin, "run", "-e", env_name],
            cwd=FIRMWARE_DIR,
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            logger.error("Firmware build failed:\n%s", result.stderr[-2000:])
            return jsonify({
                "error": "Build fehlgeschlagen",
                "details": result.stderr[-1000:],
            }), 500

        # Find the built firmware binary
        firmware_path = os.path.join(
            FIRMWARE_DIR, ".pio", "build", env_name, "firmware.bin"
        )
        if not os.path.isfile(firmware_path):
            return jsonify({"error": "Firmware-Binary nicht gefunden nach Build"}), 500

        logger.info("Firmware built successfully: %s (%d bytes)", firmware_path, os.path.getsize(firmware_path))

        return send_file(
            firmware_path,
            mimetype="application/octet-stream",
            as_attachment=True,
            download_name=f"flightarc-{hw}-{node.id}.bin",
        )

    except subprocess.TimeoutExpired:
        return jsonify({"error": "Build-Timeout (120s überschritten)"}), 500
    except Exception as exc:
        logger.exception("Firmware build error")
        return jsonify({"error": str(exc)}), 500
