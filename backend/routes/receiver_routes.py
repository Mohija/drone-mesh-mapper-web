"""
Receiver routes — Admin CRUD + Node ingest/heartbeat endpoints.
"""

import base64
import hashlib
import json
import logging
import math
import os
import secrets
import struct
import subprocess
import tempfile
import time

from flask import Blueprint, Response, g, jsonify, request, send_file
from database import db
from auth import login_required, role_required, node_auth_required, service_token_required
from models import ReceiverNode
from services.audit import audit_log

logger = logging.getLogger("receivers")

receiver_bp = Blueprint("receivers", __name__, url_prefix="/api/receivers")


# ─── Geometry helpers for placement planner ────────────────────


def _hex_grid_cover(polygon, radius_m):
    """Generate hexagonal grid positions INSIDE the polygon.
    Receivers are only placed within the polygon boundary.
    Coverage circles will extend slightly beyond the edges — this is intended
    so the polygon interior is fully covered without monitoring unplanned areas.
    Uses hex grid spacing for optimal coverage:
      dx (column spacing) = radius * sqrt(3)
      dy (row spacing)    = radius * 1.5
      Odd rows shifted by dx/2
    Returns list of [lat, lon] positions.
    """
    lats = [p[0] for p in polygon]
    lons = [p[1] for p in polygon]
    min_lat, max_lat = min(lats), max(lats)
    min_lon, max_lon = min(lons), max(lons)

    # Convert radius to degrees (approximate)
    lat_center = (min_lat + max_lat) / 2
    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(lat_center))

    # Hex grid spacing
    dx_m = radius_m * math.sqrt(3)       # column spacing in meters
    dy_m = radius_m * 1.5                 # row spacing in meters
    dx_lon = dx_m / m_per_deg_lon         # column spacing in degrees lon
    dy_lat = dy_m / m_per_deg_lat         # row spacing in degrees lat
    row_offset_lon = dx_lon / 2           # hex offset for odd rows

    # No bounding box expansion — receivers stay inside the polygon
    positions = []
    row = 0
    lat = min_lat
    while lat <= max_lat:
        lon_start = min_lon
        if row % 2 == 1:
            lon_start += row_offset_lon
        lon = lon_start
        while lon <= max_lon:
            if _point_in_polygon(lat, lon, polygon):
                positions.append([round(lat, 7), round(lon, 7)])
            lon += dx_lon
        lat += dy_lat
        row += 1

    return positions


def _point_near_polygon(lat, lon, polygon, radius_m, m_per_deg_lat, m_per_deg_lon):
    """Check if a point is inside the polygon or within radius_m of any polygon edge."""
    if _point_in_polygon(lat, lon, polygon):
        return True
    for i in range(len(polygon)):
        j = (i + 1) % len(polygon)
        dist = _point_to_segment_dist(lat, lon, polygon[i], polygon[j], m_per_deg_lat, m_per_deg_lon)
        if dist <= radius_m:
            return True
    return False


def _point_in_polygon(lat, lon, polygon):
    """Ray casting point-in-polygon test.
    polygon = [[lat, lon], ...], test point = (lat, lon).
    Axis mapping: y=lat, x=lon.
    """
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        yi, xi = polygon[i]   # yi=lat_i, xi=lon_i
        yj, xj = polygon[j]   # yj=lat_j, xj=lon_j
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _point_to_segment_dist(lat, lon, p1, p2, m_per_deg_lat, m_per_deg_lon):
    """Distance in meters from point to line segment."""
    dx = (p2[1] - p1[1]) * m_per_deg_lon
    dy = (p2[0] - p1[0]) * m_per_deg_lat
    px = (lon - p1[1]) * m_per_deg_lon
    py = (lat - p1[0]) * m_per_deg_lat

    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq == 0:
        return math.sqrt(px * px + py * py)

    t = max(0, min(1, (px * dx + py * dy) / seg_len_sq))
    proj_x = t * dx
    proj_y = t * dy
    return math.sqrt((px - proj_x) ** 2 + (py - proj_y) ** 2)


def _polygon_area_km2(polygon):
    """Calculate polygon area in km² using the shoelace formula."""
    n = len(polygon)
    if n < 3:
        return 0
    lat_center = sum(p[0] for p in polygon) / n
    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(lat_center))

    area = 0
    for i in range(n):
        j = (i + 1) % n
        xi = polygon[i][1] * m_per_deg_lon
        yi = polygon[i][0] * m_per_deg_lat
        xj = polygon[j][1] * m_per_deg_lon
        yj = polygon[j][0] * m_per_deg_lat
        area += xi * yj - xj * yi
    return abs(area) / 2.0 / 1e6  # m² to km²


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
    db.session.flush()
    audit_log("create", "receiver", node.id, node.name, {"hardware": hardware_type})
    db.session.commit()

    logger.info("Created receiver %s (%s) for tenant %s", node.id, hardware_type, g.tenant_id, extra={"tenant_id": g.tenant_id})
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
    if "coverage_radius" in data:
        val = data["coverage_radius"]
        node.coverage_radius = int(val) if val is not None else None
    if "antenna_type" in data:
        node.antenna_type = data["antenna_type"] or None

    audit_log("update", "receiver", node_id, node.name, {"changes": list(data.keys())})
    db.session.commit()
    logger.info("Updated receiver %s: name=%s active=%s", node.id, node.name, node.is_active, extra={"tenant_id": g.tenant_id})
    return jsonify(node.to_dict())


@receiver_bp.route("/<node_id>/location", methods=["POST"])
@login_required
@role_required("tenant_admin")
def set_receiver_location(node_id: str):
    """Set receiver location from browser geolocation (e.g. phone GPS)."""
    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404

    data = request.get_json(silent=True) or {}
    lat = data.get("latitude")
    lon = data.get("longitude")
    accuracy = data.get("accuracy")

    if lat is None or lon is None:
        return jsonify({"error": "latitude und longitude erforderlich"}), 400

    node.last_latitude = float(lat)
    node.last_longitude = float(lon)
    if accuracy is not None:
        node.last_location_accuracy = float(accuracy)

    db.session.commit()
    logger.info("Location set for receiver %s: %.6f, %.6f (acc: %.1f)",
                node.id, node.last_latitude, node.last_longitude, node.last_location_accuracy or 0)
    return jsonify(node.to_dict())


@receiver_bp.route("/<node_id>", methods=["DELETE"])
@login_required
@role_required("tenant_admin")
def delete_receiver(node_id: str):
    """Delete a receiver node."""
    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404

    node_name = node.name
    audit_log("delete", "receiver", node_id, node_name)
    db.session.delete(node)
    db.session.commit()
    # Clean up stored firmware binary
    stored_fw = os.path.join(FIRMWARE_STORE, f"{node_id}.bin")
    if os.path.isfile(stored_fw):
        os.remove(stored_fw)
        logger.info("Removed firmware file %s", stored_fw)
    logger.info("Deleted receiver %s from tenant %s", node_id, g.tenant_id, extra={"tenant_id": g.tenant_id})
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

    # Latest firmware version per hardware type from changelog
    changelog = _read_firmware_changelog()
    latest_versions = {}
    for hw in ["esp32-s3", "esp32-c3", "esp32-s3-gps"]:
        for v in changelog:
            if hw in v.get("hardware", []):
                latest_versions[hw] = v["version"]
                break

    return jsonify({
        "total": len(nodes),
        "online": online,
        "stale": stale,
        "offline": offline,
        "totalDetections": total_detections,
        "latestFirmwareVersions": latest_versions,
    })


@receiver_bp.route("/coverage", methods=["GET"])
@login_required
def get_receiver_coverage():
    """Return receiver locations and coverage radii for map overlay."""
    nodes = ReceiverNode.query.filter_by(tenant_id=g.tenant_id, is_active=True).all()
    result = []
    for n in nodes:
        if n.last_latitude and n.last_longitude:
            result.append({
                "id": n.id,
                "name": n.name,
                "latitude": n.last_latitude,
                "longitude": n.last_longitude,
                "coverageRadius": n.coverage_radius or 1000,
                "antennaType": n.antenna_type or "pcb",
                "status": n.status,
                "hardwareType": n.hardware_type,
            })
    return jsonify(result)


# ─── Placement Planner (JWT auth, tenant_admin+) ──────────────


@receiver_bp.route("/plan-coverage", methods=["POST"])
@login_required
@role_required("tenant_admin")
def plan_coverage():
    """Calculate optimal receiver positions for full coverage of a polygon area.
    Uses hexagonal grid covering (mathematically optimal).
    Body: { polygon: [[lat,lon]...], radius: number (meters) }
    """
    data = request.get_json(silent=True) or {}
    polygon = data.get("polygon", [])
    radius = data.get("radius", 1000)

    if len(polygon) < 3:
        return jsonify({"error": "Polygon muss mindestens 3 Punkte haben"}), 400
    if radius < 50 or radius > 50000:
        return jsonify({"error": "Radius muss zwischen 50m und 50km liegen"}), 400

    positions = _hex_grid_cover(polygon, radius)

    # Calculate area of polygon in km²
    area = _polygon_area_km2(polygon)

    return jsonify({
        "positions": [{"lat": p[0], "lon": p[1]} for p in positions],
        "count": len(positions),
        "area_km2": round(area, 2),
        "radius": radius,
    })


@receiver_bp.route("/batch-create", methods=["POST"])
@login_required
@role_required("tenant_admin")
def batch_create():
    """Create multiple receiver nodes at planned positions.
    Body: { positions: [{lat, lon}...], antenna_type: string,
            coverage_radius: number, name_prefix: string }
    """
    data = request.get_json(silent=True) or {}
    positions = data.get("positions", [])
    antenna_type = data.get("antenna_type", "pcb")
    coverage_radius = data.get("coverage_radius", 1000)
    name_prefix = (data.get("name_prefix") or "Empfänger").strip()

    if not positions:
        return jsonify({"error": "Keine Positionen angegeben"}), 400
    if len(positions) > 100:
        return jsonify({"error": "Maximal 100 Empfänger auf einmal"}), 400

    created = []
    for i, pos in enumerate(positions, 1):
        node = ReceiverNode(
            tenant_id=g.tenant_id,
            name=f"{name_prefix} {i:02d}",
            hardware_type="esp32-s3",
            last_latitude=pos.get("lat"),
            last_longitude=pos.get("lon"),
            last_location_accuracy=10.0,
            antenna_type=antenna_type,
            coverage_radius=coverage_radius,
        )
        db.session.add(node)
        created.append(node)

    db.session.commit()
    logger.info("Batch-created %d receivers for tenant %s", len(created), g.tenant_id,
                extra={"tenant_id": g.tenant_id})

    return jsonify({
        "created": [n.to_dict(include_key=True) for n in created],
        "count": len(created),
    }), 201


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

    # Update IP and heartbeat — prefer wifi_ip from payload over remote_addr
    node.last_ip = data.get("wifi_ip") or request.remote_addr
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

    # Connection log
    from services.connection_log import connection_log
    connection_log.log(g.tenant_id,
        receiver_id=node.id, receiver_name=node.name,
        endpoint="/ingest", method="POST", http_status=200,
        detections_count=len(detections), ip=request.remote_addr)

    return jsonify({"ok": True, "stored": count})


@receiver_bp.route("/heartbeat", methods=["POST"])
@node_auth_required
def heartbeat():
    """Status heartbeat from a hardware receiver."""
    node = g.receiver_node
    data = request.get_json(silent=True) or {}

    now_ts = time.time()
    node.last_heartbeat = now_ts
    node.last_telemetry_at = now_ts
    node.last_ip = data.get("wifi_ip") or request.remote_addr

    if "firmware_version" in data:
        old_fw = node.firmware_version
        node.firmware_version = data["firmware_version"]
        if old_fw != data["firmware_version"]:
            _record_firmware_history(node, data["firmware_version"], "ota" if node.ota_update_pending else "heartbeat")
    if "wifi_ssid" in data:
        node.wifi_ssid = data["wifi_ssid"]
    if "wifi_rssi" in data:
        node.wifi_rssi = data["wifi_rssi"]
    if "wifi_channel" in data:
        node.wifi_channel = data["wifi_channel"]
    if "free_heap" in data:
        node.free_heap = data["free_heap"]
    if "uptime_seconds" in data:
        node.uptime_seconds = data["uptime_seconds"]
    if "detections_since_boot" in data:
        node.detections_since_boot = data["detections_since_boot"]
    if "ap_active" in data:
        node.ap_active = bool(data["ap_active"])
    if "error_count" in data:
        node.last_error_count = int(data["error_count"])
    if "last_http_code" in data:
        node.last_http_code_reported = int(data["last_http_code"])

    # Update location if provided
    if data.get("latitude") is not None and data.get("longitude") is not None:
        node.last_latitude = data["latitude"]
        node.last_longitude = data["longitude"]
        if data.get("accuracy") is not None:
            node.last_location_accuracy = data["accuracy"]

    # GPS telemetry (esp32-s3-gps build only — other firmwares don't send these)
    if "gps_present" in data:
        node.gps_present = bool(data["gps_present"])
    if "gps_has_fix" in data:
        node.gps_has_fix = bool(data["gps_has_fix"])
    if "gps_satellites" in data:
        node.gps_satellites = int(data["gps_satellites"])
    if "gps_hdop" in data:
        try:
            node.gps_hdop = float(data["gps_hdop"])
        except (TypeError, ValueError):
            pass
    if "gps_last_fix_age_seconds" in data:
        try:
            node.gps_last_fix_age_seconds = int(data["gps_last_fix_age_seconds"])
        except (TypeError, ValueError):
            pass
    if "gps_messages_parsed" in data:
        try:
            node.gps_messages_parsed = int(data["gps_messages_parsed"])
        except (TypeError, ValueError):
            pass
    if "gps_last_message_age_seconds" in data:
        try:
            node.gps_last_message_age_seconds = int(data["gps_last_message_age_seconds"])
        except (TypeError, ValueError):
            pass
    if "gps_sats_in_view" in data:
        try:
            node.gps_sats_in_view = int(data["gps_sats_in_view"])
        except (TypeError, ValueError):
            pass

    db.session.commit()

    # Connection log
    from services.connection_log import connection_log
    connection_log.log(g.tenant_id,
        receiver_id=node.id, receiver_name=node.name,
        endpoint="/heartbeat", method="POST", http_status=200,
        ip=request.remote_addr,
        firmware_version=data.get("firmware_version"),
        hardware_type=data.get("hardware_type"),
        wifi_ssid=data.get("wifi_ssid"),
        wifi_channel=data.get("wifi_channel"),
        ap_active=data.get("ap_active"),
        error_count=data.get("error_count"),
        last_http_code=data.get("last_http_code"),
        wifi_rssi=data.get("wifi_rssi"),
        free_heap=data.get("free_heap"),
        uptime_seconds=data.get("uptime_seconds"))

    # Check if OTA update should be offered
    response_data: dict = {"ok": True, "server_time": time.time()}

    if node.ota_update_pending and node.is_active:
        stored_fw = os.path.join(FIRMWARE_STORE, f"{node.id}.bin")
        if os.path.isfile(stored_fw):
            response_data["firmware_update"] = {
                "available": True,
                "url": f"/api/receivers/firmware/ota/{node.id}",
                "sha256": node.last_build_sha256 or "",
                "size": node.last_build_size or 0,
                "version": node.last_build_version or "",
            }

    # Auto-detect successful OTA: firmware version changed after pending update
    if node.ota_update_pending and node.firmware_version and node.last_build_version:
        if node.firmware_version == node.last_build_version:
            node.ota_update_pending = False
            node.ota_last_result = "success"
            db.session.commit()
            logger.info("OTA update successful for receiver %s (now %s)", node.id, node.firmware_version)

    logger.debug("Heartbeat from receiver %s (%s)", node.id, node.name)
    return jsonify(response_data)


# ─── OTA Endpoints ────────────────────────────────────────


@receiver_bp.route("/firmware/ota/<node_id>", methods=["GET"])
@node_auth_required
def ota_download(node_id: str):
    """Serve firmware binary for OTA update. Authenticated via X-Node-Key or ?key= param."""
    node = g.receiver_node
    if node.id != node_id:
        return jsonify({"error": "Node-ID stimmt nicht überein"}), 403

    stored_path = os.path.join(FIRMWARE_STORE, f"{node.id}.bin")
    if not os.path.isfile(stored_path):
        return jsonify({"error": "Keine Firmware vorhanden"}), 404

    node.ota_last_attempt = time.time()
    db.session.commit()

    from services.connection_log import connection_log
    connection_log.log(g.tenant_id,
        receiver_id=node.id, receiver_name=node.name,
        endpoint="/firmware/ota", method="GET", http_status=200,
        ip=request.remote_addr)

    logger.info("OTA download for receiver %s (%d bytes)", node.id, os.path.getsize(stored_path))
    return send_file(stored_path, mimetype="application/octet-stream")


@receiver_bp.route("/<node_id>/ota-trigger", methods=["POST"])
@login_required
@role_required("tenant_admin")
def trigger_ota(node_id: str):
    """Set OTA update pending flag. Update will be offered in next heartbeat."""
    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404
    if not node.last_build_at:
        return jsonify({"error": "Keine Firmware gebaut. Bitte zuerst bauen."}), 400

    stored_fw = os.path.join(FIRMWARE_STORE, f"{node.id}.bin")
    if not os.path.isfile(stored_fw):
        return jsonify({"error": "Firmware-Binary nicht gefunden"}), 404

    node.ota_update_pending = True
    node.ota_last_result = None
    audit_log("update", "receiver", node_id, node.name, {"action": "ota_trigger"})
    db.session.commit()
    logger.info("OTA update triggered for receiver %s", node.id)
    return jsonify({"ok": True, "message": "OTA-Update wird beim nächsten Heartbeat angeboten"})


@receiver_bp.route("/<node_id>/ota-cancel", methods=["POST"])
@login_required
@role_required("tenant_admin")
def cancel_ota(node_id: str):
    """Cancel pending OTA update."""
    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404
    node.ota_update_pending = False
    db.session.commit()
    return jsonify({"ok": True})


# ─── Firmware Build Endpoint ───────────────────────────────


FIRMWARE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "firmware")
FIRMWARE_STORE = os.path.join(os.path.dirname(__file__), "..", "data", "firmware")
VENV_BIN = os.path.join(os.path.dirname(__file__), "..", "venv", "bin")


# ─── Firmware changelog helpers ───────────────────────────────

_changelog_cache = None
_changelog_cache_time = 0


def _read_firmware_changelog():
    """Read firmware/changelog.json with 60s cache."""
    global _changelog_cache, _changelog_cache_time
    now = time.time()
    if _changelog_cache is not None and now - _changelog_cache_time < 60:
        return _changelog_cache
    changelog_path = os.path.join(FIRMWARE_DIR, "changelog.json")
    try:
        with open(changelog_path, "r") as f:
            data = json.load(f)
        _changelog_cache = data.get("versions", [])
    except (IOError, json.JSONDecodeError):
        _changelog_cache = []
    _changelog_cache_time = now
    return _changelog_cache


def _get_latest_version(hardware_type: str):
    """Get the latest firmware version entry for a hardware type."""
    for v in _read_firmware_changelog():
        if hardware_type in v.get("hardware", []):
            return v
    return None


def _record_firmware_history(node, version, method):
    """Append a firmware version change to the receiver's history."""
    if not version:
        return
    history = list(node.firmware_history or [])  # copy! avoid in-place mutation
    # Don't duplicate consecutive same-version entries
    if history and history[0].get("version") == version:
        return
    history.insert(0, {
        "version": version,
        "timestamp": time.time(),
        "method": method,
    })
    node.firmware_history = history[:50]


def _resolve_backend_url(request_url: str, tenant_id: str) -> tuple[str, str | None]:
    """Resolve the URL to bake into firmware.

    Priority: explicit request value → tenant-wide setting. Returns (url, error).
    Rejects obvious LAN IPs to prevent the 1.5.3 dead-end where a rebuilt
    controller can't reach the backend once it leaves the local network.
    """
    from models import TenantSettings
    url = (request_url or "").strip()
    if not url:
        ts = TenantSettings.query.filter_by(tenant_id=tenant_id).first()
        url = (ts.firmware_backend_url or "").strip() if ts else ""
    if not url:
        return "", "Backend-URL nicht gesetzt. Trage sie in den Einstellungen ein (muss extern erreichbar sein, z. B. Live-View-URL)."
    low = url.lower()
    if any(low.startswith(p) for p in ("http://192.168.", "http://10.", "http://172.", "http://localhost", "http://127.")):
        return url, "Backend-URL ist eine lokale Adresse. Controller müssen von überall erreichen können — nutze die öffentliche Live-View-URL."
    return url, None


def _resolve_wifi_networks(request_networks, tenant_id):
    """Resolve WiFi networks for firmware build.

    Priority order, deduped by SSID, capped at 3:
      1. Per-receiver overrides from the request
      2. Tenant-eigene Netzwerke
      3. Übergreifende Netzwerke aus dem Standard-Tenant (is_global=true)

    If a request entry has use_stored=true, the password is looked up first in
    the tenant's networks, then in the global pool.
    """
    from models import TenantSettings, Tenant

    ts = TenantSettings.query.filter_by(tenant_id=tenant_id).first()
    tenant_nets = (ts.wifi_networks or []) if ts else []

    # Globals from the default tenant (if we're not it).
    default = Tenant.query.filter_by(name="default").first()
    global_nets: list[dict] = []
    if default and default.id != tenant_id:
        d_ts = TenantSettings.query.filter_by(tenant_id=default.id).first()
        if d_ts and d_ts.wifi_networks:
            global_nets = [n for n in d_ts.wifi_networks if n.get("is_global")]

    # Strip is_global from the firmware-bound dict — controllers don't need it.
    def clean(n: dict) -> dict:
        return {"ssid": n["ssid"], "password": n.get("password", "")}

    pwd_by_ssid: dict[str, str] = {}
    for n in tenant_nets + global_nets:
        pwd_by_ssid.setdefault(n["ssid"], n.get("password", ""))

    if not request_networks:
        merged: list[dict] = []
        seen: set[str] = set()
        for n in tenant_nets + global_nets:
            if n["ssid"] not in seen:
                merged.append(clean(n))
                seen.add(n["ssid"])
            if len(merged) >= 3:
                break
        return merged

    # Resolve per-receiver entries (with optional use_stored lookup)
    resolved: list[dict] = []
    seen: set[str] = set()
    for net in request_networks:
        ssid = (net.get("ssid") or "").strip()
        if not ssid or ssid in seen:
            continue
        if net.get("use_stored") and ssid in pwd_by_ssid:
            resolved.append({"ssid": ssid, "password": pwd_by_ssid[ssid]})
        else:
            resolved.append({"ssid": ssid, "password": net.get("password", "")})
        seen.add(ssid)

    # Fill remaining slots first from tenant own, then from globals
    for n in tenant_nets + global_nets:
        if len(resolved) >= 3:
            break
        if n["ssid"] not in seen:
            resolved.append(clean(n))
            seen.add(n["ssid"])

    return resolved[:3]


# boot_app0.bin needed for merged binary
BOOT_APP0_PATH = os.path.join(
    os.path.expanduser("~"), ".platformio", "packages",
    "framework-arduinoespressif32", "tools", "partitions", "boot_app0.bin"
)


def _create_merged_binary(node_id: str, hw_type: str, env_name: str) -> int | None:
    """Create merged full-flash binary (bootloader + partitions + boot_app0 + firmware).
    Returns merged file size in bytes, or None on failure/unsupported.
    """
    board = BOARD_INFO.get(hw_type)
    if not board:
        return None

    build_dir = os.path.join(FIRMWARE_DIR, ".pio", "build", env_name)
    bootloader = os.path.join(build_dir, "bootloader.bin")
    partitions = os.path.join(build_dir, "partitions.bin")
    firmware = os.path.join(FIRMWARE_STORE, f"{node_id}.bin")
    merged_out = os.path.join(FIRMWARE_STORE, f"{node_id}_merged.bin")

    for f in [bootloader, partitions, firmware]:
        if not os.path.isfile(f):
            logger.warning("Missing file for merge: %s", f)
            return None

    # boot_app0.bin — needed for OTA partition selection
    boot_app0 = BOOT_APP0_PATH
    if not os.path.isfile(boot_app0):
        logger.warning("boot_app0.bin not found at %s", boot_app0)
        return None

    esptool_bin = os.path.join(VENV_BIN, "esptool")
    if not os.path.isfile(esptool_bin):
        esptool_bin = os.path.join(VENV_BIN, "esptool.py")

    cmd = [
        esptool_bin, "--chip", board["chip"], "merge-bin",
        "-o", merged_out,
        "--flash-mode", board["flash_mode"],
        "--flash-size", board["flash_size"],
        "--flash-freq", "80m",
        "0x0", bootloader,
        "0x8000", partitions,
        "0xe000", boot_app0,
        "0x10000", firmware,
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            logger.error("merge-bin failed: %s", result.stderr)
            return None

        merged_size = os.path.getsize(merged_out)
        logger.info("Created merged binary for %s: %d bytes", node_id, merged_size)
        return merged_size
    except Exception as e:
        logger.error("merge-bin error: %s", e)
        return None

# In-memory build jobs: {node_id: {status, log, error, checks, ...}}
import threading
_build_jobs: dict = {}

ENV_MAP = {
    "esp32-s3": "esp32-s3",
    "esp32-c3": "esp32-c3",
    "esp32-s3-gps": "esp32-s3-gps",
}

FLASH_MODE_NAMES = {0: "qio", 1: "qout", 2: "dio", 3: "dout"}

BOARD_INFO = {
    "esp32-s3": {"flash_mode": "dio", "flash_size": "8MB", "partition": "default_8MB.csv", "chip": "esp32s3"},
    "esp32-c3": {"flash_mode": "qio", "flash_size": "4MB", "partition": "default.csv", "chip": "esp32c3"},
    "esp32-s3-gps": {"flash_mode": "dio", "flash_size": "8MB", "partition": "default_8MB.csv", "chip": "esp32s3"},
}


PARTITION_MAX_APP_SIZE = {
    "esp32-s3": 3342336,   # 3264 KB (default_8MB.csv app0)
    "esp32-c3": 1310720,   # 1280 KB (default.csv app0)
    "esp32-s3-gps": 3342336,  # same partition as esp32-s3
}


def verify_firmware_binary(firmware_path, hw_type):
    """Verify ESP firmware binary and return metadata + detailed checklist."""
    board = BOARD_INFO.get(hw_type, {})
    checks = []
    info = {"valid": False, "size": 0, "checks": checks}

    def add(name, ok, expected="", actual="", detail=""):
        checks.append({
            "name": name, "ok": ok,
            "expected": expected, "actual": actual, "detail": detail,
        })

    # --- Check: File exists & size ---
    try:
        size = os.path.getsize(firmware_path)
        info["size"] = size
    except OSError:
        add("Datei existiert", False, "firmware.bin", "nicht gefunden")
        return info

    add("Datei existiert", True, "firmware.bin", f"{size} Bytes")

    min_size = 64 * 1024    # 64 KB minimum
    max_size = PARTITION_MAX_APP_SIZE.get(hw_type, 3342336)
    size_ok = min_size <= size <= max_size
    add(
        "Binary-Größe",
        size_ok,
        f"{min_size // 1024} KB – {max_size // 1024} KB",
        f"{size / 1024:.1f} KB ({size * 100 / max_size:.1f}%)",
        "" if size_ok else ("Zu klein" if size < min_size else "Überschreitet Partition"),
    )

    # --- Check: Header ---
    try:
        with open(firmware_path, "rb") as f:
            header = f.read(4)
            magic, segments, flash_mode_byte, flash_config = struct.unpack("BBBB", header)
    except Exception as exc:
        add("Header lesbar", False, "", str(exc))
        return info

    add("Header lesbar", True, "4 Bytes", "OK")

    # --- Check: Magic byte ---
    magic_ok = magic == 0xE9
    add("Magic Byte", magic_ok, "0xE9", f"0x{magic:02X}")

    # --- Check: Flash mode ---
    actual_mode = FLASH_MODE_NAMES.get(flash_mode_byte, f"unknown({flash_mode_byte})")
    expected_mode = board.get("flash_mode", "")
    mode_ok = actual_mode == expected_mode if expected_mode else True
    add(
        "Flash-Modus",
        mode_ok,
        expected_mode.upper() if expected_mode else "—",
        actual_mode.upper(),
        "" if mode_ok else f"Erwartet {expected_mode.upper()}, aber {actual_mode.upper()} im Binary",
    )
    info["flash_mode"] = actual_mode

    # --- Check: Flash size ---
    flash_size_map = {0: "1MB", 1: "2MB", 2: "4MB", 3: "8MB", 4: "16MB"}
    size_bits = (flash_config >> 4) & 0x0F
    actual_flash_size = flash_size_map.get(size_bits, f"unknown({size_bits})")
    expected_flash_size = board.get("flash_size", "")
    flash_size_ok = actual_flash_size == expected_flash_size if expected_flash_size else True
    add(
        "Flash-Größe",
        flash_size_ok,
        expected_flash_size or "—",
        actual_flash_size,
    )

    # --- Check: Flash freq ---
    freq_map = {0: "40MHz", 1: "26MHz", 2: "20MHz", 0xF: "80MHz"}
    freq_bits = flash_config & 0x0F
    actual_freq = freq_map.get(freq_bits, f"unknown({freq_bits})")
    add("Flash-Frequenz", True, "—", actual_freq)

    # --- Check: Segments ---
    seg_ok = 1 <= segments <= 16
    add("Segmente", seg_ok, "1–16", str(segments))
    info["segments"] = segments

    # --- Check: SHA-256 ---
    try:
        with open(firmware_path, "rb") as f:
            data = f.read()
        sha = hashlib.sha256(data).hexdigest()
        info["sha256"] = sha[:16]
        add("SHA-256 berechnet", True, "—", sha[:16] + "...")
    except Exception as exc:
        add("SHA-256 berechnet", False, "", str(exc))

    # --- Check: Bootloader ---
    build_dir = os.path.dirname(firmware_path)
    bl_path = os.path.join(build_dir, "bootloader.bin")
    if os.path.isfile(bl_path):
        bl_size = os.path.getsize(bl_path)
        try:
            with open(bl_path, "rb") as f:
                bl_magic = struct.unpack("B", f.read(1))[0]
            bl_ok = bl_magic == 0xE9 and bl_size > 1024
            add("Bootloader", bl_ok, "0xE9, >1KB", f"0x{bl_magic:02X}, {bl_size / 1024:.1f} KB")
        except Exception:
            add("Bootloader", False, "lesbar", "Fehler beim Lesen")
    else:
        add("Bootloader", False, "vorhanden", "nicht gefunden")

    # --- Check: Partition table ---
    pt_path = os.path.join(build_dir, "partitions.bin")
    if os.path.isfile(pt_path):
        pt_size = os.path.getsize(pt_path)
        try:
            with open(pt_path, "rb") as f:
                pt_data = f.read()
            # Count valid partition entries (magic 0xAA50)
            entry_count = 0
            for off in range(0, len(pt_data) - 32, 32):
                if pt_data[off] == 0xAA and pt_data[off + 1] == 0x50:
                    entry_count += 1
            pt_ok = entry_count >= 3  # at least nvs, otadata, app0
            add("Partitionstabelle", pt_ok, ">= 3 Einträge", f"{entry_count} Einträge ({pt_size} Bytes)")
        except Exception:
            add("Partitionstabelle", False, "lesbar", "Fehler beim Lesen")
    else:
        add("Partitionstabelle", False, "vorhanden", "nicht gefunden")

    # --- Overall verdict ---
    all_ok = all(c["ok"] for c in checks)
    info["valid"] = all_ok
    info["size_kb"] = round(size / 1024, 1)

    return info


@receiver_bp.route("/firmware/changelog", methods=["GET"])
@login_required
@role_required("tenant_admin")
def firmware_changelog():
    """Return the firmware changelog."""
    versions = _read_firmware_changelog()
    return jsonify({"versions": versions})


@receiver_bp.route("/firmware/build", methods=["POST"])
@login_required
@role_required("tenant_admin")
def build_firmware():
    """Build firmware on-demand via PlatformIO with baked-in credentials."""
    data = request.get_json(silent=True) or {}

    node_id = data.get("node_id", "")
    hardware_type = data.get("hardware_type", "")
    regenerate_key = data.get("regenerate_key", False)
    wifi_networks = data.get("wifi_networks", [])
    # Backward compat: single wifi_ssid/wifi_password still works
    if not wifi_networks:
        ssid = data.get("wifi_ssid", "")
        pwd = data.get("wifi_password", "")
        if ssid:
            wifi_networks = [{"ssid": ssid, "password": pwd}]
    wifi_networks = _resolve_wifi_networks(wifi_networks, g.tenant_id)

    if not node_id:
        return jsonify({"error": "node_id erforderlich"}), 400

    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404

    # Optionally regenerate API key (invalidates old firmware)
    if regenerate_key:
        node.api_key = secrets.token_hex(32)
        db.session.commit()
        logger.info("Regenerated API key for receiver %s before rebuild", node.id)

    hw = hardware_type or node.hardware_type
    if hw not in ENV_MAP:
        return jsonify({"error": f"Ungültiger Hardware-Typ: {hw}"}), 400

    backend_url, url_err = _resolve_backend_url(data.get("backend_url", ""), g.tenant_id)
    if url_err:
        return jsonify({"error": url_err}), 400

    env_name = ENV_MAP[hw]
    pio_bin = os.path.join(VENV_BIN, "pio")

    if not os.path.isfile(pio_bin):
        return jsonify({"error": "PlatformIO nicht installiert. Führe backend/scripts/install-platformio.sh aus."}), 500

    if not os.path.isdir(FIRMWARE_DIR):
        return jsonify({"error": "Firmware-Verzeichnis nicht gefunden"}), 500

    # Sanitize strings for C compiler build flags (-D"..." in platformio.ini)
    # Characters that break shell/compiler quoting: " \ $ ` newlines
    import re

    def sanitize_build_str(s):
        """Remove characters that break C compiler -D flag quoting."""
        return re.sub(r'["\\\$`\n\r]', '', s)

    def sanitize_node_name(s):
        """Node name: only ASCII alphanumeric + dash/underscore (used as AP SSID suffix)."""
        return re.sub(r'[^A-Za-z0-9_\-]', '_', s).strip('_') or "FlightArc"

    # Build with environment variables for build flags
    env = os.environ.copy()
    env["BACKEND_URL"] = sanitize_build_str(backend_url)
    env["API_KEY"] = sanitize_build_str(node.api_key)
    # Set WiFi credentials (up to 3 networks)
    suffixes = ["", "_2", "_3"]
    for i, suffix in enumerate(suffixes):
        if i < len(wifi_networks):
            env[f"WIFI_SSID{suffix}"] = sanitize_build_str(wifi_networks[i].get("ssid", ""))
            env[f"WIFI_PASS{suffix}"] = sanitize_build_str(wifi_networks[i].get("password", ""))
        else:
            env[f"WIFI_SSID{suffix}"] = ""
            env[f"WIFI_PASS{suffix}"] = ""
    env["NODE_NAME"] = sanitize_node_name(node.name[:20])
    latest = _get_latest_version(hw)
    build_version = latest["version"] if latest else "1.0.0"
    env["FIRMWARE_VERSION"] = build_version
    env["NODE_ID"] = node.id

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

        # Verify the built binary
        fw_info = verify_firmware_binary(firmware_path, hw)
        board_info = BOARD_INFO.get(hw, {})
        checks = fw_info.get("checks", [])
        passed = sum(1 for c in checks if c["ok"])
        total = len(checks)
        logger.info(
            "Firmware built: %s (%d bytes, mode=%s, checks=%d/%d)",
            firmware_path, fw_info["size"], fw_info.get("flash_mode", "?"),
            passed, total,
        )

        if not fw_info["valid"]:
            failed = [c for c in checks if not c["ok"]]
            details = "; ".join(f'{c["name"]}: {c.get("detail") or c.get("actual", "FAIL")}' for c in failed)
            return jsonify({
                "error": "Firmware-Verifizierung fehlgeschlagen",
                "details": details,
                "checks": checks,
            }), 500

        # Save a copy per receiver for later re-download
        os.makedirs(FIRMWARE_STORE, exist_ok=True)
        stored_path = os.path.join(FIRMWARE_STORE, f"{node.id}.bin")
        import shutil
        shutil.copy2(firmware_path, stored_path)

        # Update DB with build metadata
        node.last_build_at = time.time()
        node.last_build_size = fw_info["size"]
        node.last_build_sha256 = fw_info.get("sha256", "")
        node.last_build_version = build_version
        _record_firmware_history(node, build_version, "build")
        node.last_build_config = {"backend_url": backend_url, "wifi_networks": wifi_networks}
        # Create merged binary (bootloader + partitions + app)
        merged_size = _create_merged_binary(node.id, hw, env_name)
        node.last_build_merged_size = merged_size
        audit_log("create", "firmware", node.id, node.name, {"version": build_version})
        db.session.commit()
        logger.info("Firmware stored: %s (%d bytes, merged: %s)", stored_path, fw_info["size"],
                     f"{merged_size} bytes" if merged_size else "N/A")

        response = send_file(
            stored_path,
            mimetype="application/octet-stream",
            as_attachment=True,
            download_name=f"flightarc-{hw}-{node.id}.bin",
        )
        # Add firmware metadata as headers
        response.headers["X-Firmware-Size"] = str(fw_info["size"])
        response.headers["X-Firmware-Flash-Mode"] = fw_info.get("flash_mode", "")
        response.headers["X-Firmware-SHA256"] = fw_info.get("sha256", "")
        response.headers["X-Firmware-Valid"] = "true"
        response.headers["X-Board-Flash-Mode"] = board_info.get("flash_mode", "")
        response.headers["X-Board-Flash-Size"] = board_info.get("flash_size", "")
        response.headers["X-Board-Chip"] = board_info.get("chip", "")
        checks_json = json.dumps(checks, ensure_ascii=True)
        response.headers["X-Firmware-Checks"] = base64.b64encode(checks_json.encode()).decode("ascii")
        return response

    except subprocess.TimeoutExpired:
        return jsonify({"error": "Build-Timeout (120s überschritten)"}), 500
    except Exception as exc:
        logger.exception("Firmware build error")
        return jsonify({"error": str(exc)}), 500


@receiver_bp.route("/firmware/build-stream", methods=["POST"])
@login_required
@role_required("tenant_admin")
def build_firmware_stream():
    """Build firmware with live SSE streaming of compiler output."""
    data = request.get_json(silent=True) or {}
    node_id = data.get("node_id", "")
    hardware_type = data.get("hardware_type", "")
    regenerate_key = data.get("regenerate_key", False)
    wifi_networks = data.get("wifi_networks", [])
    if not wifi_networks:
        ssid = data.get("wifi_ssid", "")
        pwd = data.get("wifi_password", "")
        if ssid:
            wifi_networks = [{"ssid": ssid, "password": pwd}]
    wifi_networks = _resolve_wifi_networks(wifi_networks, g.tenant_id)

    if not node_id:
        return jsonify({"error": "node_id erforderlich"}), 400

    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404

    hw = hardware_type or node.hardware_type
    if hw not in ENV_MAP:
        return jsonify({"error": f"Ungültiger Hardware-Typ: {hw}"}), 400
    backend_url, url_err = _resolve_backend_url(data.get("backend_url", ""), g.tenant_id)
    if url_err:
        return jsonify({"error": url_err}), 400

    if regenerate_key:
        node.api_key = secrets.token_hex(32)
        db.session.commit()

    env_name = ENV_MAP[hw]
    pio_bin = os.path.join(VENV_BIN, "pio")
    if not os.path.isfile(pio_bin):
        return jsonify({"error": "PlatformIO nicht installiert"}), 500

    import re as _re

    def sanitize_build_str(s):
        return _re.sub(r'["\\\$`\n\r]', '', s)

    def sanitize_node_name(s):
        return _re.sub(r'[^A-Za-z0-9_\-]', '_', s).strip('_') or "FlightArc"

    build_env = os.environ.copy()
    build_env["BACKEND_URL"] = sanitize_build_str(backend_url)
    build_env["API_KEY"] = sanitize_build_str(node.api_key)
    suffixes = ["", "_2", "_3"]
    for i, suffix in enumerate(suffixes):
        if i < len(wifi_networks):
            build_env[f"WIFI_SSID{suffix}"] = sanitize_build_str(wifi_networks[i].get("ssid", ""))
            build_env[f"WIFI_PASS{suffix}"] = sanitize_build_str(wifi_networks[i].get("password", ""))
        else:
            build_env[f"WIFI_SSID{suffix}"] = ""
            build_env[f"WIFI_PASS{suffix}"] = ""
    build_env["NODE_NAME"] = sanitize_node_name(node.name[:20])
    latest = _get_latest_version(hw)
    build_version = latest["version"] if latest else "1.0.0"
    build_env["FIRMWARE_VERSION"] = build_version
    build_env["NODE_ID"] = node.id

    # Capture app context for DB operations inside generator
    app = request._get_current_object().__class__
    from flask import current_app
    app_ctx = current_app._get_current_object()

    def generate():
        # SSE with padding to force browser flush (2KB minimum for Chrome to start processing)
        PADDING = ":" + " " * 2048 + "\n"

        def sse(event, data):
            msg = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=True)}\n\n"
            return msg + PADDING

        yield sse("log", {"line": f"[Build] Starting {hw} firmware for {node.name}..."})
        if regenerate_key:
            yield sse("log", {"line": "[Build] API-Key regeneriert (alter Key ungültig)"})

        try:
            # stdbuf -oL forces line-buffered stdout from PlatformIO
            cmd = [pio_bin, "run", "-e", env_name]
            stdbuf = "/usr/bin/stdbuf"
            if os.path.isfile(stdbuf):
                cmd = [stdbuf, "-oL"] + cmd

            proc = subprocess.Popen(
                cmd,
                cwd=FIRMWARE_DIR,
                env=build_env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )

            for raw_line in iter(proc.stdout.readline, ''):
                line = raw_line.rstrip()
                if not line:
                    continue
                yield sse("log", {"line": line})

            proc.wait(timeout=120)

            if proc.returncode != 0:
                yield sse("error", {"error": f"Build fehlgeschlagen (exit code {proc.returncode})"})
                return

            # Verify binary
            firmware_path = os.path.join(FIRMWARE_DIR, ".pio", "build", env_name, "firmware.bin")
            if not os.path.isfile(firmware_path):
                yield sse("error", {"error": "firmware.bin nicht gefunden"})
                return

            fw_info = verify_firmware_binary(firmware_path, hw)
            checks = fw_info.get("checks", [])
            passed = sum(1 for c in checks if c["ok"])
            total = len(checks)

            if not fw_info["valid"]:
                failed = [c for c in checks if not c["ok"]]
                details = "; ".join(f'{c["name"]}: {c.get("detail") or c.get("actual", "FAIL")}' for c in failed)
                yield sse("error", {"error": f"Verifizierung fehlgeschlagen: {details}", "checks": checks})
                return

            # Save per-node copy
            os.makedirs(FIRMWARE_STORE, exist_ok=True)
            stored_path = os.path.join(FIRMWARE_STORE, f"{node_id}.bin")
            import shutil
            shutil.copy2(firmware_path, stored_path)

            # Update DB
            with app_ctx.app_context():
                n = ReceiverNode.query.get(node_id)
                if n:
                    n.last_build_at = time.time()
                    n.last_build_size = fw_info["size"]
                    n.last_build_sha256 = fw_info.get("sha256", "")
                    n.last_build_version = build_version
                    _record_firmware_history(n, build_version, "build")
                    n.last_build_config = {"backend_url": backend_url, "wifi_networks": wifi_networks}
                    merged_size = _create_merged_binary(n.id, hw, env_name)
                    n.last_build_merged_size = merged_size
                    db.session.commit()

            yield sse("log", {"line": f"[Build] Verifizierung: {passed}/{total} Checks bestanden"})
            yield sse("done", {
                "size": fw_info["size"],
                "flash_mode": fw_info.get("flash_mode", ""),
                "sha256": fw_info.get("sha256", ""),
                "checks": checks,
                "node_id": node_id,
            })

        except subprocess.TimeoutExpired:
            yield sse("error", {"error": "Build-Timeout (120s)"})
        except Exception as exc:
            logger.exception("Build stream error")
            yield sse("error", {"error": str(exc)})

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ESP chip family names expected by esp-web-tools / esptool-js.
_CHIP_FAMILIES = {
    "esp32-s3": "ESP32-S3",
    "esp32-c3": "ESP32-C3",
    "esp32-s3-gps": "ESP32-S3",
}


def _authenticate_query_token():
    """Fallback auth for endpoints hit by `fetch()` without Authorization header
    (e.g. esp-web-tools). Accepts `?token=<access_jwt>` and populates g.* the
    same way login_required does. Returns (user, error_response) — exactly one
    will be non-None.
    """
    from auth import JWT_SECRET, JWT_ALGORITHM
    from models import User
    import jwt as pyjwt

    token = request.args.get("token", "").strip()
    if not token:
        return None, (jsonify({"error": "Authentifizierung erforderlich"}), 401)
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except pyjwt.ExpiredSignatureError:
        return None, (jsonify({"error": "Token abgelaufen"}), 401)
    except pyjwt.InvalidTokenError:
        return None, (jsonify({"error": "Ungültiger Token"}), 401)
    if payload.get("type") != "access":
        return None, (jsonify({"error": "Ungültiger Token"}), 401)

    user = db.session.get(User, payload["user_id"])
    if not user or not user.is_active:
        return None, (jsonify({"error": "Ungültiger Token"}), 401)

    g.current_user = user
    g.tenant_id = payload.get("tenant_id") or user.tenant_id
    g.effective_role = payload.get("role") or user.role

    if g.effective_role not in ("tenant_admin", "super_admin"):
        return None, (jsonify({"error": "Admin-Rechte erforderlich"}), 403)
    return user, None


@receiver_bp.route("/firmware/manifest/<node_id>", methods=["GET"])
def firmware_manifest(node_id):
    """ESP Web Tools manifest pointing at this node's merged binary.

    `<esp-web-install-button>` fetches this JSON with plain `fetch()` (no
    Authorization header), so we authenticate via `?token=<access_jwt>`
    query parameter instead.
    """
    _user, err = _authenticate_query_token()
    if err:
        return err

    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404

    merged_path = os.path.join(FIRMWARE_STORE, f"{node.id}_merged.bin")
    if not os.path.isfile(merged_path):
        return jsonify({"error": "Kein Merged-Binary vorhanden. Bitte zuerst Firmware bauen."}), 404

    chip_family = _CHIP_FAMILIES.get(node.hardware_type)
    if not chip_family:
        return jsonify({"error": f"Web-Flash für {node.hardware_type} nicht unterstützt"}), 400

    # Same token is re-used for the binary download (esp-web-tools follows the
    # path from the manifest and has no other way to authenticate).
    token = request.args.get("token", "").strip()

    manifest = {
        "name": f"FlightArc {node.hardware_type}",
        "version": node.firmware_version or "",
        "new_install_prompt_erase": True,
        "builds": [
            {
                "chipFamily": chip_family,
                "parts": [
                    # Merged binary already includes bootloader + partitions,
                    # so offset 0 is correct.
                    {"path": f"../download/{node.id}?type=merged&token={token}", "offset": 0},
                ],
            }
        ],
    }
    return jsonify(manifest)


@receiver_bp.route("/firmware/download/<node_id>", methods=["GET"])
def download_firmware(node_id):
    """Download previously built firmware. Use ?type=merged for full-flash binary.

    Accepts either the standard Authorization header (from authFetch) or a
    `?token=<access_jwt>` query parameter (used by esp-web-tools, which
    follows the path from the manifest and can't set headers).
    """
    # Normal JWT header first; fall back to query-param token otherwise.
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        from auth import JWT_SECRET, JWT_ALGORITHM
        from models import User
        import jwt as pyjwt
        try:
            payload = pyjwt.decode(auth_header[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "access":
                raise pyjwt.InvalidTokenError
            user = db.session.get(User, payload["user_id"])
            if not user or not user.is_active:
                raise pyjwt.InvalidTokenError
            g.current_user = user
            g.tenant_id = payload.get("tenant_id") or user.tenant_id
            g.effective_role = payload.get("role") or user.role
        except pyjwt.InvalidTokenError:
            return jsonify({"error": "Ungültiger Token"}), 401
        except pyjwt.ExpiredSignatureError:
            return jsonify({"error": "Token abgelaufen"}), 401
        if g.effective_role not in ("tenant_admin", "super_admin"):
            return jsonify({"error": "Admin-Rechte erforderlich"}), 403
    else:
        _user, err = _authenticate_query_token()
        if err:
            return err

    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404

    fw_type = request.args.get("type", "app")

    if fw_type == "merged":
        stored_path = os.path.join(FIRMWARE_STORE, f"{node.id}_merged.bin")
        download_name = f"flightarc-{node.hardware_type}-{node.id}-merged.bin"
        if not os.path.isfile(stored_path):
            return jsonify({"error": "Kein Merged-Binary vorhanden. Nur für ESP32 verfügbar."}), 404
    else:
        stored_path = os.path.join(FIRMWARE_STORE, f"{node.id}.bin")
        download_name = f"flightarc-{node.hardware_type}-{node.id}.bin"
        if not os.path.isfile(stored_path):
            return jsonify({"error": "Keine Firmware vorhanden. Bitte zuerst bauen."}), 404

    return send_file(
        stored_path,
        mimetype="application/octet-stream",
        as_attachment=True,
        download_name=download_name,
    )


@receiver_bp.route("/firmware/build-async", methods=["POST"])
@login_required
@role_required("tenant_admin")
def build_firmware_async():
    """Start firmware build in background thread. Poll status via /firmware/build-status."""
    data = request.get_json(silent=True) or {}
    node_id = data.get("node_id", "")
    hardware_type = data.get("hardware_type", "")
    regenerate_key = data.get("regenerate_key", False)
    wifi_networks = data.get("wifi_networks", [])
    if not wifi_networks:
        ssid = data.get("wifi_ssid", "")
        pwd = data.get("wifi_password", "")
        if ssid:
            wifi_networks = [{"ssid": ssid, "password": pwd}]
    wifi_networks = _resolve_wifi_networks(wifi_networks, g.tenant_id)

    if not node_id:
        return jsonify({"error": "node_id erforderlich"}), 400
    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404
    hw = hardware_type or node.hardware_type
    if hw not in ENV_MAP:
        return jsonify({"error": f"Ungültiger Hardware-Typ: {hw}"}), 400
    backend_url, url_err = _resolve_backend_url(data.get("backend_url", ""), g.tenant_id)
    if url_err:
        return jsonify({"error": url_err}), 400

    # Check if build already running
    if node_id in _build_jobs and _build_jobs[node_id].get("status") == "building":
        return jsonify({"error": "Build läuft bereits"}), 409

    if regenerate_key:
        node.api_key = secrets.token_hex(32)
        db.session.commit()

    # Capture values for thread
    api_key = node.api_key
    node_name = node.name
    tenant_id = g.tenant_id

    import re as _re
    def sanitize_build_str(s):
        return _re.sub(r'["\\\$`\n\r]', '', s)
    def sanitize_node_name(s):
        return _re.sub(r'[^A-Za-z0-9_\-]', '_', s).strip('_') or "FlightArc"

    env_name = ENV_MAP[hw]
    pio_bin = os.path.join(VENV_BIN, "pio")
    build_env = os.environ.copy()
    build_env["BACKEND_URL"] = sanitize_build_str(backend_url)
    build_env["API_KEY"] = sanitize_build_str(api_key)
    suffixes = ["", "_2", "_3"]
    for i, suffix in enumerate(suffixes):
        if i < len(wifi_networks):
            build_env[f"WIFI_SSID{suffix}"] = sanitize_build_str(wifi_networks[i].get("ssid", ""))
            build_env[f"WIFI_PASS{suffix}"] = sanitize_build_str(wifi_networks[i].get("password", ""))
        else:
            build_env[f"WIFI_SSID{suffix}"] = ""
            build_env[f"WIFI_PASS{suffix}"] = ""
    build_env["NODE_NAME"] = sanitize_node_name(node_name[:20])
    latest = _get_latest_version(hw)
    build_version = latest["version"] if latest else "1.0.0"
    build_env["FIRMWARE_VERSION"] = build_version
    build_env["NODE_ID"] = node_id

    from flask import current_app
    app_ctx = current_app._get_current_object()

    # Initialize job
    _build_jobs[node_id] = {"status": "building", "log": [], "error": None, "checks": None, "result": None}
    job = _build_jobs[node_id]

    def run_build():
        job["log"].append(f"[Build] Starting {hw} firmware for {node_name}...")
        if regenerate_key:
            job["log"].append("[Build] API-Key regeneriert (alter Key ungültig)")

        try:
            cmd = [pio_bin, "run", "-e", env_name]
            stdbuf = "/usr/bin/stdbuf"
            if os.path.isfile(stdbuf):
                cmd = [stdbuf, "-oL"] + cmd

            proc = subprocess.Popen(
                cmd, cwd=FIRMWARE_DIR, env=build_env,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, bufsize=1,
            )
            for raw_line in iter(proc.stdout.readline, ''):
                line = raw_line.rstrip()
                if line:
                    job["log"].append(line)
            proc.wait(timeout=120)

            if proc.returncode != 0:
                job["status"] = "error"
                job["error"] = f"Build fehlgeschlagen (exit code {proc.returncode})"
                return

            firmware_path = os.path.join(FIRMWARE_DIR, ".pio", "build", env_name, "firmware.bin")
            if not os.path.isfile(firmware_path):
                job["status"] = "error"
                job["error"] = "firmware.bin nicht gefunden"
                return

            fw_info = verify_firmware_binary(firmware_path, hw)
            checks = fw_info.get("checks", [])
            passed = sum(1 for c in checks if c["ok"])
            total = len(checks)
            job["checks"] = checks

            if not fw_info["valid"]:
                failed = [c for c in checks if not c["ok"]]
                job["status"] = "error"
                job["error"] = "; ".join(f'{c["name"]}: {c.get("detail") or c.get("actual")}' for c in failed)
                return

            os.makedirs(FIRMWARE_STORE, exist_ok=True)
            stored_path = os.path.join(FIRMWARE_STORE, f"{node_id}.bin")
            import shutil
            shutil.copy2(firmware_path, stored_path)

            with app_ctx.app_context():
                n = ReceiverNode.query.get(node_id)
                if n:
                    n.last_build_at = time.time()
                    n.last_build_size = fw_info["size"]
                    n.last_build_sha256 = fw_info.get("sha256", "")
                    n.last_build_version = build_version
                    _record_firmware_history(n, build_version, "build")
                    n.last_build_config = {"backend_url": backend_url, "wifi_networks": wifi_networks}
                    merged_size = _create_merged_binary(n.id, hw, env_name)
                    n.last_build_merged_size = merged_size
                    db.session.commit()

            job["log"].append(f"[Build] Verifizierung: {passed}/{total} Checks bestanden")
            job["status"] = "done"
            job["result"] = {
                "size": fw_info["size"],
                "flash_mode": fw_info.get("flash_mode", ""),
                "sha256": fw_info.get("sha256", ""),
                "node_id": node_id,
            }

        except subprocess.TimeoutExpired:
            job["status"] = "error"
            job["error"] = "Build-Timeout (120s)"
        except Exception as exc:
            logger.exception("Async build error")
            job["status"] = "error"
            job["error"] = str(exc)

    thread = threading.Thread(target=run_build, daemon=True)
    thread.start()
    return jsonify({"ok": True, "node_id": node_id}), 202


@receiver_bp.route("/firmware/build-status/<node_id>", methods=["GET"])
@login_required
@role_required("tenant_admin")
def build_firmware_status(node_id):
    """Poll build status. Returns log lines, status, checks."""
    job = _build_jobs.get(node_id)
    if not job:
        return jsonify({"status": "idle", "log": [], "error": None, "checks": None, "result": None})

    # Return current state (log is cumulative)
    return jsonify({
        "status": job["status"],
        "log": job["log"],
        "error": job["error"],
        "checks": job.get("checks"),
        "result": job.get("result"),
    })


@receiver_bp.route("/connection-log", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_connection_log():
    """Get connection log entries. Optional ?receiver_id= filter."""
    from services.connection_log import connection_log
    receiver_id = request.args.get("receiver_id")
    limit = min(int(request.args.get("limit", 100)), 500)
    if receiver_id:
        entries = connection_log.get_for_receiver(g.tenant_id, receiver_id, limit)
    else:
        # Merge tenant-specific + global (auth failures) entries
        tenant_entries = connection_log.get_all(g.tenant_id, limit)
        global_entries = connection_log.get_all("_global", limit)
        entries = sorted(tenant_entries + global_entries, key=lambda e: e["timestamp"], reverse=True)[:limit]
    return jsonify({
        "enabled": connection_log.is_enabled(g.tenant_id),
        "entries": entries,
    })


@receiver_bp.route("/connection-log/toggle", methods=["POST"])
@login_required
@role_required("tenant_admin")
def toggle_connection_log():
    """Enable or disable connection logging."""
    from services.connection_log import connection_log
    data = request.get_json(silent=True) or {}
    enabled = data.get("enabled", True)
    if enabled:
        connection_log.enable(g.tenant_id)
        connection_log.enable("_global")  # Also capture auth failures
    else:
        connection_log.disable(g.tenant_id)
    logger.info("Connection log %s for tenant %s", "enabled" if enabled else "disabled", g.tenant_id)
    return jsonify({"enabled": connection_log.is_enabled(g.tenant_id)})


@receiver_bp.route("/connection-log/clear", methods=["POST"])
@login_required
@role_required("tenant_admin")
def clear_connection_log():
    """Clear all connection log entries."""
    from services.connection_log import connection_log
    connection_log.clear(g.tenant_id)
    return jsonify({"ok": True})


@receiver_bp.route("/firmware/board-info", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_board_info():
    """Return board-specific flash configuration for all hardware types."""
    return jsonify(BOARD_INFO)


# ─── External Health Summary (service-token auth) ───────────

@receiver_bp.route("/health-summary", methods=["GET"])
@service_token_required("health_read")
def health_summary():
    """Return all persisted controller telemetry + status aggregates for this tenant.

    Auth: X-Service-Token header (see /api/admin/service-tokens). Designed for
    non-interactive callers (scheduled remote agents, external monitors).

    The response includes EVERY field the firmware sends in its heartbeat plus
    derived status (online/stale/offline), a compact audit snapshot for the last
    24h, and the on-disk backup rotation state so the caller can verify the
    backend is healthy end-to-end without needing filesystem access.
    """
    from models import ReceiverNode, AuditLog
    nodes = ReceiverNode.query.filter_by(tenant_id=g.tenant_id).all()

    now_ts = time.time()
    receivers_out = []
    for n in nodes:
        age = int(now_ts - n.last_heartbeat) if n.last_heartbeat else None
        status = n.status  # uses ONLINE_THRESHOLD=120, STALE_THRESHOLD=300
        receivers_out.append({
            "id": n.id,
            "name": n.name,
            "hardware_type": n.hardware_type,
            "firmware_version": n.firmware_version,
            "is_active": n.is_active,
            "status": status,
            "last_heartbeat": n.last_heartbeat,
            "last_heartbeat_age_seconds": age,
            "last_telemetry_at": n.last_telemetry_at,
            # WiFi / network
            "wifi_ssid": n.wifi_ssid,
            "wifi_rssi": n.wifi_rssi,
            "wifi_channel": n.wifi_channel,
            "last_ip": n.last_ip,
            "ap_active": n.ap_active,
            # Runtime
            "uptime_seconds": n.uptime_seconds,
            "free_heap": n.free_heap,
            "detections_since_boot": n.detections_since_boot,
            "total_detections": n.total_detections,
            # Error counters from the controller itself
            "last_error_count": n.last_error_count,
            "last_http_code_reported": n.last_http_code_reported,
            # GPS
            "latitude": n.last_latitude,
            "longitude": n.last_longitude,
            "location_accuracy": n.last_location_accuracy,
            # OTA state
            "ota_update_pending": n.ota_update_pending,
            "ota_last_attempt": n.ota_last_attempt,
            "ota_last_result": n.ota_last_result,
            # Build metadata
            "last_build_at": n.last_build_at,
            "last_build_version": n.last_build_version,
            "last_build_sha256": n.last_build_sha256,
            "coverage_radius": n.coverage_radius,
            "antenna_type": n.antenna_type,
            "firmware_history": n.firmware_history or [],
        })

    # Audit snapshot: potentially destructive events in the last 24 h
    cutoff = now_ts - 86400
    audit_rows = (AuditLog.query
                  .filter(AuditLog.tenant_id == g.tenant_id)
                  .filter(AuditLog.timestamp >= cutoff)
                  .filter(AuditLog.action.in_(["delete", "update"]))
                  .filter(AuditLog.resource_type.in_(["tenant", "user", "receiver", "service_token"]))
                  .order_by(AuditLog.timestamp.desc())
                  .limit(50)
                  .all())
    audit_out = [{
        "timestamp": a.timestamp,
        "username": a.username,
        "action": a.action,
        "resource_type": a.resource_type,
        "resource_name": a.resource_name,
        "details": a.details,
    } for a in audit_rows]

    # Backup rotation state — helps the monitor detect a dead backend
    try:
        from backup import list_backups
        backups = list_backups()
        backup_summary = {
            "count": len(backups),
            "latest": backups[0] if backups else None,
            "latest_age_seconds": int(now_ts - backups[0]["mtime"]) if backups else None,
        }
    except Exception as exc:
        backup_summary = {"error": str(exc)}

    # Aggregate counts
    counts = {"online": 0, "stale": 0, "offline": 0}
    for r in receivers_out:
        counts[r["status"]] = counts.get(r["status"], 0) + 1

    # DB stats + retention config — helps the agent spot runaway growth
    try:
        from retention import db_stats, DEFAULT_SYSTEM_LOG_DAYS, DEFAULT_AUDIT_LOG_DAYS
        from flask import current_app
        from models import TenantSettings
        db_info = db_stats(current_app)
        ts = TenantSettings.query.filter_by(tenant_id=g.tenant_id).first()
        db_info["retention_days"] = {
            "system_logs": ts.retention_system_logs_days if (ts and ts.retention_system_logs_days) else DEFAULT_SYSTEM_LOG_DAYS,
            "audit_logs": ts.retention_audit_logs_days if (ts and ts.retention_audit_logs_days) else DEFAULT_AUDIT_LOG_DAYS,
        }
    except Exception as exc:
        db_info = {"error": str(exc)}

    return jsonify({
        "tenant_id": g.tenant_id,
        "server_time": now_ts,
        "online_threshold_seconds": ReceiverNode.ONLINE_THRESHOLD,
        "stale_threshold_seconds": ReceiverNode.STALE_THRESHOLD,
        "counts": {"total": len(receivers_out), **counts},
        "receivers": receivers_out,
        "audit_24h": audit_out,
        "backups": backup_summary,
        "db_stats": db_info,
    })
