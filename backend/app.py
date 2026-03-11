#!/usr/bin/env python3
"""
Drone Mesh Mapper Web - Python Backend
Flask server wrapping drone-mesh-mapper tester with REST API.
Serves React frontend dist/ as static files (Production Server Pattern).
"""

import os
import json
import logging
import requests as http_requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from drone_simulator import DroneFleet
from settings import SettingsManager
from providers import ProviderRegistry

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s - %(name)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("app")

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.join(BASE_DIR, "..", "frontend", "dist")

# Default center (Bielefeld, Germany)
DEFAULT_LAT = float(os.environ.get("DEFAULT_LAT", "52.0302"))
DEFAULT_LON = float(os.environ.get("DEFAULT_LON", "8.5325"))
DEFAULT_RADIUS = float(os.environ.get("DEFAULT_RADIUS", "50000"))
PORT = int(os.environ.get("DRONE_PORT", "3020"))

# DIPUL WMS endpoint
DIPUL_WMS_URL = "https://uas-betrieb.de/geoservices/dipul/wms"
DIPUL_TIMEOUT = 15  # seconds

nofly_logger = logging.getLogger("nofly")

app = Flask(__name__, static_folder=None)
CORS(app, origins=[
    "http://localhost:*",
    "http://127.0.0.1:*",
    "https://*.dasilvafelix.de",
])

# Initialize drone fleet simulation
fleet = DroneFleet(center_lat=DEFAULT_LAT, center_lon=DEFAULT_LON)
fleet.start(interval=2.0)

# Initialize settings and provider registry
settings = SettingsManager()
registry = ProviderRegistry(fleet)


# ─── API Routes ────────────────────────────────────────────


@app.route("/api/drones", methods=["GET"])
def get_drones():
    """Get all drones from enabled sources, optionally filtered by location radius.
    radius=0 means no radius filter (all drones).
    """
    lat = request.args.get("lat", type=float, default=DEFAULT_LAT)
    lon = request.args.get("lon", type=float, default=DEFAULT_LON)
    radius = request.args.get("radius", type=float, default=DEFAULT_RADIUS)

    enabled = settings.get_enabled_sources()
    logger.debug("GET /api/drones lat=%.4f lon=%.4f radius=%.0f sources=%s", lat, lon, radius, enabled)

    drones = registry.get_all_drones(lat, lon, radius, enabled)

    return jsonify({
        "drones": drones,
        "count": len(drones),
        "center": {"lat": fleet.center_lat, "lon": fleet.center_lon},
        "sources": enabled,
    })


@app.route("/api/drones/<drone_id>", methods=["GET"])
def get_drone(drone_id: str):
    """Get single drone details (supports compound IDs)."""
    drone = registry.get_drone(drone_id)
    if not drone:
        logger.warning("GET /api/drones/%s - drone not found", drone_id)
        return jsonify({"error": "Drone not found"}), 404
    logger.debug("GET /api/drones/%s", drone_id)
    return jsonify(drone)


@app.route("/api/drones/<drone_id>/history", methods=["GET"])
def get_drone_history(drone_id: str):
    """Get position history for a drone."""
    history = registry.get_drone_history(drone_id)
    if history is None:
        logger.warning("GET /api/drones/%s/history - drone not found", drone_id)
        return jsonify({"error": "Drone not found"}), 404
    logger.debug("GET /api/drones/%s/history (%d entries)", drone_id, len(history))
    return jsonify({"drone_id": drone_id, "history": history})


@app.route("/api/fleet/center", methods=["POST"])
def set_fleet_center():
    """Recenter the drone fleet around a new GPS position."""
    data = request.get_json()
    if not data or "lat" not in data or "lon" not in data:
        logger.warning("POST /api/fleet/center - missing lat/lon in request body")
        return jsonify({"error": "lat and lon required"}), 400
    logger.info("POST /api/fleet/center - recentering to lat=%.6f lon=%.6f", data["lat"], data["lon"])
    fleet.set_center(data["lat"], data["lon"])
    return jsonify({"status": "ok", "center": {"lat": data["lat"], "lon": data["lon"]}})


@app.route("/api/settings", methods=["GET"])
def get_settings():
    """Get current data source settings."""
    return jsonify(settings.get_all())


@app.route("/api/settings", methods=["POST"])
def update_settings():
    """Update data source settings."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400
    settings.update(data)
    return jsonify(settings.get_all())


@app.route("/api/status", methods=["GET"])
def get_status():
    """Get simulation status."""
    return jsonify({
        "running": fleet.running,
        "drone_count": len(fleet.drones),
        "center": {"lat": fleet.center_lat, "lon": fleet.center_lon},
    })


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})


# ─── No-Fly Zone (DIPUL WMS) Routes ────────────────────────


@app.route("/api/nofly/check", methods=["GET"])
def check_nofly_wms():
    """Check DIPUL WMS service availability."""
    nofly_logger.debug("GET /api/nofly/check - checking WMS availability")
    try:
        resp = http_requests.get(
            DIPUL_WMS_URL,
            params={"service": "WMS", "version": "1.3.0", "request": "GetCapabilities"},
            timeout=DIPUL_TIMEOUT,
        )
        available = resp.status_code == 200
        nofly_logger.info(
            "DIPUL WMS check: available=%s status=%d", available, resp.status_code
        )
        return jsonify({
            "available": available,
            "status_code": resp.status_code,
            "wms_url": DIPUL_WMS_URL,
        })
    except http_requests.Timeout:
        nofly_logger.warning("DIPUL WMS check: timeout after %ds", DIPUL_TIMEOUT)
        return jsonify({"available": False, "error": "timeout"})
    except http_requests.RequestException as e:
        nofly_logger.error("DIPUL WMS check failed: %s", str(e))
        return jsonify({"available": False, "error": str(e)})


@app.route("/api/nofly/info", methods=["GET"])
def get_nofly_feature_info():
    """Proxy DIPUL WMS GetFeatureInfo to avoid CORS.
    Query params: lat, lon, layers (comma-separated DIPUL layer names).
    """
    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)
    layers = request.args.get("layers", "")

    if lat is None or lon is None or not layers:
        nofly_logger.warning("GET /api/nofly/info - missing required params lat=%s lon=%s layers=%s", lat, lon, layers)
        return jsonify({"error": "lat, lon, layers required"}), 400

    nofly_logger.debug("GET /api/nofly/info lat=%.6f lon=%.6f layers=%s", lat, lon, layers)

    # Build a small bbox around the click point (~200m)
    delta = 0.001
    # WMS 1.3.0 with EPSG:4326: bbox order is lat_min,lon_min,lat_max,lon_max
    bbox = f"{lat - delta},{lon - delta},{lat + delta},{lon + delta}"

    params = {
        "service": "WMS",
        "version": "1.3.0",
        "request": "GetFeatureInfo",
        "layers": layers,
        "query_layers": layers,
        "crs": "EPSG:4326",
        "bbox": bbox,
        "width": 101,
        "height": 101,
        "i": 50,
        "j": 50,
        "info_format": "application/json",
    }

    try:
        resp = http_requests.get(DIPUL_WMS_URL, params=params, timeout=DIPUL_TIMEOUT)
        if resp.status_code == 200:
            try:
                data = resp.json()
                feature_count = len(data.get("features", []))
                nofly_logger.info(
                    "DIPUL GetFeatureInfo: lat=%.6f lon=%.6f features=%d", lat, lon, feature_count
                )
                return jsonify(data)
            except ValueError:
                # Response might not be JSON (e.g., HTML or XML)
                nofly_logger.warning(
                    "DIPUL GetFeatureInfo: non-JSON response content_type=%s",
                    resp.headers.get("content-type", "unknown"),
                )
                return jsonify({
                    "type": "FeatureCollection",
                    "features": [],
                    "raw_content_type": resp.headers.get("content-type"),
                })
        nofly_logger.warning("DIPUL GetFeatureInfo failed: status=%d", resp.status_code)
        return jsonify({"error": f"WMS returned {resp.status_code}"}), 502
    except http_requests.Timeout:
        nofly_logger.warning("DIPUL GetFeatureInfo timeout after %ds", DIPUL_TIMEOUT)
        return jsonify({"error": "timeout"}), 504
    except http_requests.RequestException as e:
        nofly_logger.error("DIPUL GetFeatureInfo error: %s", str(e))
        return jsonify({"error": str(e)}), 502


# ─── Frontend Serving (Production Server Pattern) ──────────


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path: str):
    """Serve React frontend from dist/ directory."""
    if path and os.path.exists(os.path.join(FRONTEND_DIST, path)):
        return send_from_directory(FRONTEND_DIST, path)
    # SPA fallback
    index_path = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.exists(index_path):
        return send_from_directory(FRONTEND_DIST, "index.html")
    return jsonify({
        "error": "Frontend not built",
        "hint": "Run 'cd frontend && npm run build' first",
    }), 404


if __name__ == "__main__":
    logger.info("Drone Mesh Mapper Web starting on port %d", PORT)
    logger.info("Fleet center: %.6f, %.6f", DEFAULT_LAT, DEFAULT_LON)
    logger.info("Frontend dist: %s", FRONTEND_DIST)
    logger.info("Enabled sources: %s", settings.get_enabled_sources())
    logger.info("API: http://localhost:%d/api/drones", PORT)
    app.run(host="0.0.0.0", port=PORT, debug=False)
