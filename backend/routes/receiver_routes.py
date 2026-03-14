"""
Receiver routes — Admin CRUD + Node ingest/heartbeat endpoints.
"""

import base64
import hashlib
import json
import logging
import os
import secrets
import struct
import subprocess
import tempfile
import time

from flask import Blueprint, Response, g, jsonify, request, send_file
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
    # Clean up stored firmware binary
    stored_fw = os.path.join(FIRMWARE_STORE, f"{node_id}.bin")
    if os.path.isfile(stored_fw):
        os.remove(stored_fw)
        logger.info("Removed firmware file %s", stored_fw)
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
FIRMWARE_STORE = os.path.join(os.path.dirname(__file__), "..", "data", "firmware")
VENV_BIN = os.path.join(os.path.dirname(__file__), "..", "venv", "bin")

ENV_MAP = {
    "esp32-s3": "esp32-s3",
    "esp32-c3": "esp32-c3",
    "esp8266": "esp8266",
}

FLASH_MODE_NAMES = {0: "qio", 1: "qout", 2: "dio", 3: "dout"}

BOARD_INFO = {
    "esp32-s3": {"flash_mode": "dio", "flash_size": "8MB", "partition": "default_8MB.csv", "chip": "esp32s3"},
    "esp32-c3": {"flash_mode": "qio", "flash_size": "4MB", "partition": "default.csv", "chip": "esp32c3"},
    "esp8266":  {"flash_mode": "qio", "flash_size": "4MB", "partition": "default", "chip": "esp8266"},
}


PARTITION_MAX_APP_SIZE = {
    "esp32-s3": 3342336,   # 3264 KB (default_8MB.csv app0)
    "esp32-c3": 1310720,   # 1280 KB (default.csv app0)
    "esp8266":  1044464,   # ~1020 KB
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


@receiver_bp.route("/firmware/build", methods=["POST"])
@login_required
@role_required("tenant_admin")
def build_firmware():
    """Build firmware on-demand via PlatformIO with baked-in credentials."""
    data = request.get_json(silent=True) or {}

    node_id = data.get("node_id", "")
    hardware_type = data.get("hardware_type", "")
    backend_url = data.get("backend_url", "")
    regenerate_key = data.get("regenerate_key", False)
    wifi_networks = data.get("wifi_networks", [])
    # Backward compat: single wifi_ssid/wifi_password still works
    if not wifi_networks:
        ssid = data.get("wifi_ssid", "")
        pwd = data.get("wifi_password", "")
        if ssid:
            wifi_networks = [{"ssid": ssid, "password": pwd}]

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

    if not backend_url:
        return jsonify({"error": "backend_url erforderlich"}), 400

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
        db.session.commit()
        logger.info("Firmware stored: %s (%d bytes)", stored_path, fw_info["size"])

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
    backend_url = data.get("backend_url", "")
    regenerate_key = data.get("regenerate_key", False)
    wifi_networks = data.get("wifi_networks", [])
    if not wifi_networks:
        ssid = data.get("wifi_ssid", "")
        pwd = data.get("wifi_password", "")
        if ssid:
            wifi_networks = [{"ssid": ssid, "password": pwd}]

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

    # Capture app context for DB operations inside generator
    app = request._get_current_object().__class__
    from flask import current_app
    app_ctx = current_app._get_current_object()

    def generate():
        def sse(event, data):
            return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=True)}\n\n"

        yield sse("log", {"line": f"[Build] Starting {hw} firmware for {node.name}..."})
        if regenerate_key:
            yield sse("log", {"line": "[Build] API-Key regeneriert (alter Key ungültig)"})

        try:
            proc = subprocess.Popen(
                [pio_bin, "run", "-e", env_name],
                cwd=FIRMWARE_DIR,
                env=build_env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )

            for raw_line in proc.stdout:
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


@receiver_bp.route("/firmware/download/<node_id>", methods=["GET"])
@login_required
@role_required("tenant_admin")
def download_firmware(node_id):
    """Download previously built firmware for a receiver."""
    node = ReceiverNode.query.filter_by(id=node_id, tenant_id=g.tenant_id).first()
    if not node:
        return jsonify({"error": "Empfänger nicht gefunden"}), 404

    stored_path = os.path.join(FIRMWARE_STORE, f"{node.id}.bin")
    if not os.path.isfile(stored_path):
        return jsonify({"error": "Keine Firmware vorhanden. Bitte zuerst bauen."}), 404

    return send_file(
        stored_path,
        mimetype="application/octet-stream",
        as_attachment=True,
        download_name=f"flightarc-{node.hardware_type}-{node.id}.bin",
    )


@receiver_bp.route("/firmware/board-info", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_board_info():
    """Return board-specific flash configuration for all hardware types."""
    return jsonify(BOARD_INFO)
