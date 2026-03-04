#!/usr/bin/env python3
"""
Drone Mesh Mapper Web - Python Backend
Flask server wrapping drone-mesh-mapper tester with REST API.
Serves React frontend dist/ as static files (Production Server Pattern).
"""

import os
import json
import logging
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from drone_simulator import DroneFleet

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

# Default center (Frankfurt, Germany)
DEFAULT_LAT = float(os.environ.get("DEFAULT_LAT", "50.1109"))
DEFAULT_LON = float(os.environ.get("DEFAULT_LON", "8.6821"))
DEFAULT_RADIUS = float(os.environ.get("DEFAULT_RADIUS", "10000"))
PORT = int(os.environ.get("DRONE_PORT", "3020"))

app = Flask(__name__, static_folder=None)
CORS(app, origins=[
    "http://localhost:*",
    "http://127.0.0.1:*",
    "https://*.dasilvafelix.de",
])

# Initialize drone fleet simulation
fleet = DroneFleet(center_lat=DEFAULT_LAT, center_lon=DEFAULT_LON)
fleet.start(interval=2.0)


# ─── API Routes ────────────────────────────────────────────


@app.route("/api/drones", methods=["GET"])
def get_drones():
    """Get all drones, optionally filtered by location radius."""
    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)
    radius = request.args.get("radius", type=float, default=DEFAULT_RADIUS)

    if lat is not None and lon is not None:
        logger.debug("GET /api/drones with filter lat=%.4f lon=%.4f radius=%.0f", lat, lon, radius)
        drones = fleet.get_drones_in_radius(lat, lon, radius)
    else:
        logger.debug("GET /api/drones (all)")
        drones = fleet.get_all_drones()

    return jsonify({
        "drones": drones,
        "count": len(drones),
        "center": {"lat": fleet.center_lat, "lon": fleet.center_lon},
    })


@app.route("/api/drones/<drone_id>", methods=["GET"])
def get_drone(drone_id: str):
    """Get single drone details."""
    drone = fleet.get_drone(drone_id)
    if not drone:
        logger.warning("GET /api/drones/%s - drone not found", drone_id)
        return jsonify({"error": "Drone not found"}), 404
    logger.debug("GET /api/drones/%s", drone_id)
    return jsonify(drone)


@app.route("/api/drones/<drone_id>/history", methods=["GET"])
def get_drone_history(drone_id: str):
    """Get position history for a drone."""
    history = fleet.get_drone_history(drone_id)
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
    logger.info("API: http://localhost:%d/api/drones", PORT)
    app.run(host="0.0.0.0", port=PORT, debug=False)
