#!/usr/bin/env python3
"""
FlightArc - Python Backend
Flask server with REST API for drone/aircraft tracking.
Serves React frontend dist/ as static files (Production Server Pattern).
"""

import os
import json
import logging
import time
import threading
import requests as http_requests
from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS
from database import db, init_db
from drone_simulator import DroneFleet
from settings import SettingsManager, DEFAULT_SOURCES
from providers import ProviderRegistry
from trail_archive import TrailArchiveManager
from flight_zones import FlightZoneManager
from auth import seed_super_admin, login_required, role_required
from routes import register_blueprints

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
], expose_headers=[
    "X-Firmware-Size", "X-Firmware-Flash-Mode", "X-Firmware-SHA256",
    "X-Firmware-Valid", "X-Board-Flash-Mode", "X-Board-Flash-Size", "X-Board-Chip",
    "X-Firmware-Checks",
])

# Initialize database
init_db(app)

# Create tables and default tenant
with app.app_context():
    from models import Tenant, TenantSettings, User, UserTenantMembership
    db.create_all()

    # Ensure default tenant exists
    default_tenant = Tenant.query.filter_by(name="default").first()
    if not default_tenant:
        default_tenant = Tenant(name="default", display_name="Standard")
        db.session.add(default_tenant)
        db.session.flush()
        default_settings = TenantSettings(
            tenant_id=default_tenant.id,
            sources=DEFAULT_SOURCES,
            center_lat=DEFAULT_LAT,
            center_lon=DEFAULT_LON,
            radius=DEFAULT_RADIUS,
        )
        db.session.add(default_settings)
        db.session.commit()
        logger.info("Created default tenant: %s", default_tenant.id)
    else:
        logger.info("Default tenant exists: %s", default_tenant.id)

    DEFAULT_TENANT_ID = default_tenant.id

    # Migration: seed existing users into UserTenantMembership table
    users_without_membership = (
        User.query
        .filter(User.tenant_id.isnot(None))
        .filter(User.role != "super_admin")
        .all()
    )
    for u in users_without_membership:
        existing = UserTenantMembership.query.filter_by(
            user_id=u.id, tenant_id=u.tenant_id
        ).first()
        if not existing:
            m = UserTenantMembership(
                user_id=u.id,
                tenant_id=u.tenant_id,
                role=u.role,
            )
            db.session.add(m)
            logger.info("Created membership for user %s in tenant %s (role=%s)", u.username, u.tenant_id, u.role)
    db.session.commit()

    # Migration: add OTA and merged binary columns to receiver_nodes
    for col_stmt in [
        "ALTER TABLE receiver_nodes ADD COLUMN last_build_version VARCHAR(20)",
        "ALTER TABLE receiver_nodes ADD COLUMN last_build_merged_size INTEGER",
        "ALTER TABLE receiver_nodes ADD COLUMN ota_update_pending BOOLEAN DEFAULT 0 NOT NULL",
        "ALTER TABLE receiver_nodes ADD COLUMN ota_last_attempt REAL",
        "ALTER TABLE receiver_nodes ADD COLUMN ota_last_result VARCHAR(100)",
    ]:
        try:
            db.session.execute(db.text(col_stmt))
        except Exception:
            pass  # Column already exists
    db.session.commit()

    # Migration: add mission zone default columns to tenant_settings
    for col_stmt in [
        "ALTER TABLE tenant_settings ADD COLUMN mission_zone_radius REAL",
        "ALTER TABLE tenant_settings ADD COLUMN mission_zone_color VARCHAR(20)",
        "ALTER TABLE tenant_settings ADD COLUMN mission_zone_min_alt_agl REAL",
        "ALTER TABLE tenant_settings ADD COLUMN mission_zone_max_alt_agl REAL",
    ]:
        try:
            db.session.execute(db.text(col_stmt))
        except Exception:
            pass  # Column already exists
    db.session.commit()

# Register blueprints (auth, admin)
register_blueprints(app)

# Seed super admin
seed_super_admin(app)

# Initialize drone fleet simulation
fleet = DroneFleet(center_lat=DEFAULT_LAT, center_lon=DEFAULT_LON)
fleet.start(interval=2.0)

# Initialize settings, provider registry, trail archive, and flight zones
settings = SettingsManager()
settings.bind(DEFAULT_TENANT_ID, app)

registry = ProviderRegistry(fleet)
app.config["_registry"] = registry

# Initialize simulation manager (dummy receiver spawner)
from services.simulation_manager import SimulationManager
import atexit
sim_manager = SimulationManager(app=app, registry=registry)
app.config["_sim_manager"] = sim_manager
atexit.register(sim_manager.stop_all)

archive = TrailArchiveManager(app=app, tenant_id=DEFAULT_TENANT_ID)
archive.bind(app, DEFAULT_TENANT_ID)

zones = FlightZoneManager(app=app, tenant_id=DEFAULT_TENANT_ID)


# ─── Violation check throttle (per-tenant, 2s minimum between checks) ─────
_violation_check_lock = threading.Lock()
_violation_check_times: dict[str, float] = {}
VIOLATION_CHECK_INTERVAL = 2.0  # seconds


def _maybe_check_violations(tenant_id: str, enabled_sources: list[str]):
    """Run violation check at most once every VIOLATION_CHECK_INTERVAL per tenant."""
    now = time.time()
    with _violation_check_lock:
        last = _violation_check_times.get(tenant_id, 0)
        if now - last < VIOLATION_CHECK_INTERVAL:
            return
        _violation_check_times[tenant_id] = now
    # Get ALL drones (radius=0) for violation checking
    all_drones = registry.get_all_drones(DEFAULT_LAT, DEFAULT_LON, 0, enabled_sources, tenant_id=tenant_id)
    zones.update_violations(all_drones, get_elevation=_get_cached_elevation, tenant_id=tenant_id)


# ─── API Routes ────────────────────────────────────────────


@app.route("/api/drones", methods=["GET"])
@login_required
def get_drones():
    """Get all drones from enabled sources, optionally filtered by location radius.
    radius=0 means no radius filter (all drones).
    """
    tid = g.tenant_id or DEFAULT_TENANT_ID
    tenant_settings = settings.get_all(tenant_id=tid)

    lat = request.args.get("lat", type=float, default=tenant_settings.get("center_lat") or DEFAULT_LAT)
    lon = request.args.get("lon", type=float, default=tenant_settings.get("center_lon") or DEFAULT_LON)
    radius = request.args.get("radius", type=float, default=tenant_settings.get("radius") or DEFAULT_RADIUS)

    enabled = settings.get_enabled_sources(tenant_id=tid)
    logger.debug("GET /api/drones tenant=%s lat=%.4f lon=%.4f radius=%.0f sources=%s", tid, lat, lon, radius, enabled)

    drones = registry.get_all_drones(lat, lon, radius, enabled, tenant_id=tid)

    # Side-effect: update shared violation records (throttled per tenant)
    _maybe_check_violations(tid, enabled)

    center_lat = tenant_settings.get("center_lat") or fleet.center_lat
    center_lon = tenant_settings.get("center_lon") or fleet.center_lon

    return jsonify({
        "drones": drones,
        "count": len(drones),
        "center": {"lat": center_lat, "lon": center_lon},
        "sources": enabled,
        "zone_version": zones.get_zone_version(tenant_id=tid),
        "violation_version": zones.get_violation_version(tenant_id=tid),
        "settings_version": settings.get_version(tenant_id=tid),
        "receiver_version": registry.receiver_provider.get_version(tid),
    })


@app.route("/api/drones/<drone_id>", methods=["GET"])
@login_required
def get_drone(drone_id: str):
    """Get single drone details (supports compound IDs)."""
    tid = g.tenant_id or DEFAULT_TENANT_ID
    drone = registry.get_drone(drone_id, tenant_id=tid)
    if not drone:
        logger.warning("GET /api/drones/%s - drone not found", drone_id)
        return jsonify({"error": "Drone not found"}), 404
    logger.debug("GET /api/drones/%s", drone_id)
    return jsonify(drone)


@app.route("/api/drones/<drone_id>/history", methods=["GET"])
@login_required
def get_drone_history(drone_id: str):
    """Get position history for a drone."""
    history = registry.get_drone_history(drone_id)
    if history is None:
        logger.warning("GET /api/drones/%s/history - drone not found", drone_id)
        return jsonify({"error": "Drone not found"}), 404
    logger.debug("GET /api/drones/%s/history (%d entries)", drone_id, len(history))
    return jsonify({"drone_id": drone_id, "history": history})


@app.route("/api/fleet/center", methods=["POST"])
@login_required
def set_fleet_center():
    """Recenter the map view for the current tenant."""
    data = request.get_json()
    if not data or "lat" not in data or "lon" not in data:
        logger.warning("POST /api/fleet/center - missing lat/lon in request body")
        return jsonify({"error": "lat and lon required"}), 400
    tid = g.tenant_id or DEFAULT_TENANT_ID
    logger.info("POST /api/fleet/center tenant=%s - recentering to lat=%.6f lon=%.6f", tid, data["lat"], data["lon"])
    settings.update({"center_lat": data["lat"], "center_lon": data["lon"]}, tenant_id=tid)
    return jsonify({"status": "ok", "center": {"lat": data["lat"], "lon": data["lon"]}})


@app.route("/api/settings", methods=["GET"])
@login_required
def get_settings():
    """Get current data source settings for the authenticated tenant."""
    tid = g.tenant_id or DEFAULT_TENANT_ID
    return jsonify(settings.get_all(tenant_id=tid))


@app.route("/api/settings", methods=["POST"])
@login_required
@role_required("tenant_admin")
def update_settings():
    """Update data source settings for the authenticated tenant."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400
    tid = g.tenant_id or DEFAULT_TENANT_ID
    settings.update(data, tenant_id=tid)
    return jsonify(settings.get_all(tenant_id=tid))


@app.route("/api/settings/mission-zone-defaults", methods=["GET"])
@login_required
def get_mission_zone_defaults():
    """Get mission zone defaults for the authenticated tenant."""
    tid = g.tenant_id or DEFAULT_TENANT_ID
    return jsonify(settings.get_mission_zone_defaults(tenant_id=tid))


@app.route("/api/settings/mission-zone-defaults", methods=["POST"])
@login_required
@role_required("tenant_admin")
def update_mission_zone_defaults():
    """Update mission zone defaults for the authenticated tenant.
    Body: { "radius": 100, "color": "#f97316", "minAltitudeAGL": null, "maxAltitudeAGL": null }
    Validates: radius 50-5000, color starts with #.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    updates = {}

    if "radius" in data:
        try:
            radius = float(data["radius"])
        except (TypeError, ValueError):
            return jsonify({"error": "radius muss eine Zahl sein"}), 400
        if radius < 50 or radius > 5000:
            return jsonify({"error": "radius muss zwischen 50 und 5000 liegen"}), 400
        updates["mission_zone_radius"] = radius

    if "color" in data:
        color = data["color"]
        if not isinstance(color, str) or not color.startswith("#"):
            return jsonify({"error": "color muss mit # beginnen"}), 400
        updates["mission_zone_color"] = color

    if "minAltitudeAGL" in data:
        val = data["minAltitudeAGL"]
        if val is not None:
            try:
                val = float(val)
            except (TypeError, ValueError):
                return jsonify({"error": "minAltitudeAGL muss eine Zahl oder null sein"}), 400
        updates["mission_zone_min_alt_agl"] = val

    if "maxAltitudeAGL" in data:
        val = data["maxAltitudeAGL"]
        if val is not None:
            try:
                val = float(val)
            except (TypeError, ValueError):
                return jsonify({"error": "maxAltitudeAGL muss eine Zahl oder null sein"}), 400
        updates["mission_zone_max_alt_agl"] = val

    if not updates:
        return jsonify({"error": "Keine gültigen Felder zum Aktualisieren"}), 400

    tid = g.tenant_id or DEFAULT_TENANT_ID
    settings.update(updates, tenant_id=tid)
    return jsonify(settings.get_mission_zone_defaults(tenant_id=tid))


@app.route("/api/status", methods=["GET"])
@login_required
def get_status():
    """Get simulation status."""
    return jsonify({
        "running": fleet.running,
        "drone_count": len(fleet.drones),
        "center": {"lat": fleet.center_lat, "lon": fleet.center_lon},
    })


@app.route("/api/simulation/restart", methods=["POST"])
@login_required
@role_required("tenant_admin")
def restart_simulation():
    """Restart the drone simulation (reinitializes all drones with fresh state)."""
    tid = g.tenant_id or DEFAULT_TENANT_ID
    enabled = settings.get_enabled_sources(tenant_id=tid)
    if "simulator" not in enabled:
        return jsonify({"error": "Simulator ist nicht aktiviert"}), 400

    # Use tenant center if available, otherwise default
    tenant_settings = settings.get_all(tenant_id=tid)
    center_lat = tenant_settings.get("center_lat") or DEFAULT_LAT
    center_lon = tenant_settings.get("center_lon") or DEFAULT_LON

    fleet.set_center(center_lat, center_lon)
    logger.info("Simulation restarted by tenant=%s at (%.6f, %.6f)", tid, center_lat, center_lon)
    return jsonify({
        "status": "restarted",
        "drone_count": len(fleet.drones),
        "center": {"lat": fleet.center_lat, "lon": fleet.center_lon},
    })


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})


# ─── Aircraft Lookup (adsbdb.com + OpenSky + OGN DDB) ──────

lookup_logger = logging.getLogger("lookup")

# In-memory cache: basic_id -> { data, timestamp }
_aircraft_cache: dict[str, dict] = {}
_cache_lock = threading.Lock()
LOOKUP_CACHE_TTL = 3600  # 1 hour
LOOKUP_TIMEOUT = 10  # seconds

# OGN Device Database cache
_ogn_ddb: dict[str, dict] = {}  # device_id -> { model, registration, cn, type }
_ogn_ddb_lock = threading.Lock()
_ogn_ddb_loaded = 0.0
OGN_DDB_TTL = 86400  # 24 hours
OGN_DDB_URL = "http://ddb.glidernet.org/download/"


def _load_ogn_ddb():
    """Load OGN Device Database (CSV) into memory cache."""
    global _ogn_ddb_loaded
    with _ogn_ddb_lock:
        if time.time() - _ogn_ddb_loaded < OGN_DDB_TTL and _ogn_ddb:
            return
    try:
        resp = http_requests.get(OGN_DDB_URL, timeout=15)
        if resp.status_code != 200:
            lookup_logger.warning("OGN DDB download failed: status %d", resp.status_code)
            return
        entries: dict[str, dict] = {}
        for line in resp.text.strip().split("\n"):
            if line.startswith("#"):
                continue
            parts = line.split(",")
            if len(parts) < 7:
                continue
            device_type = parts[0].strip("'")
            device_id = parts[1].strip("'").upper()
            model = parts[2].strip("'")
            registration = parts[3].strip("'")
            cn = parts[4].strip("'")
            entries[device_id] = {
                "device_type": device_type,
                "model": model,
                "registration": registration,
                "cn": cn,
            }
        with _ogn_ddb_lock:
            _ogn_ddb.clear()
            _ogn_ddb.update(entries)
            _ogn_ddb_loaded = time.time()
        lookup_logger.info("OGN DDB loaded: %d entries", len(entries))
    except Exception as e:
        lookup_logger.warning("OGN DDB load failed: %s", e)


def _lookup_ogn_ddb(device_id: str) -> dict | None:
    """Look up aircraft in OGN Device Database by ICAO hex or FLARM ID."""
    _load_ogn_ddb()
    with _ogn_ddb_lock:
        return _ogn_ddb.get(device_id.upper())


def _cached_lookup(key: str) -> dict | None:
    with _cache_lock:
        entry = _aircraft_cache.get(key)
        if entry and (time.time() - entry["timestamp"]) < LOOKUP_CACHE_TTL:
            return entry["data"]
    return None


def _store_cache(key: str, data: dict):
    with _cache_lock:
        _aircraft_cache[key] = {"data": data, "timestamp": time.time()}


def _lookup_adsbdb(identifier: str) -> dict | None:
    """Query adsbdb.com for aircraft info by hex code or registration."""
    try:
        resp = http_requests.get(
            f"https://api.adsbdb.com/v0/aircraft/{identifier}",
            timeout=LOOKUP_TIMEOUT,
        )
        if resp.status_code == 200:
            data = resp.json()
            aircraft = data.get("response", {}).get("aircraft")
            if aircraft:
                return aircraft
    except Exception as e:
        lookup_logger.debug("adsbdb lookup failed for %s: %s", identifier, e)
    return None


def _lookup_adsbdb_callsign(callsign: str) -> dict | None:
    """Query adsbdb.com for flight route info by callsign."""
    try:
        resp = http_requests.get(
            f"https://api.adsbdb.com/v0/callsign/{callsign}",
            timeout=LOOKUP_TIMEOUT,
        )
        if resp.status_code == 200:
            data = resp.json()
            flightroute = data.get("response", {}).get("flightroute")
            if flightroute:
                return flightroute
    except Exception as e:
        lookup_logger.debug("adsbdb callsign lookup failed for %s: %s", callsign, e)
    return None


def _lookup_opensky_metadata(hex_code: str) -> dict | None:
    """Query OpenSky Network metadata API for aircraft info."""
    try:
        resp = http_requests.get(
            f"https://opensky-network.org/api/metadata/aircraft/icao/{hex_code.lower()}",
            timeout=LOOKUP_TIMEOUT,
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        lookup_logger.debug("OpenSky metadata lookup failed for %s: %s", hex_code, e)
    return None


def _lookup_planespotters_photo(hex_code: str) -> str | None:
    """Get aircraft thumbnail from planespotters.net."""
    try:
        resp = http_requests.get(
            f"https://api.planespotters.net/pub/photos/hex/{hex_code}",
            timeout=LOOKUP_TIMEOUT,
        )
        if resp.status_code == 200:
            data = resp.json()
            photos = data.get("photos", [])
            if photos:
                thumb = photos[0].get("thumbnail_large", {}).get("src") or \
                        photos[0].get("thumbnail", {}).get("src")
                return thumb
    except Exception as e:
        lookup_logger.debug("Planespotters lookup failed for %s: %s", hex_code, e)
    return None


def _lookup_airport_data_photo(hex_code: str) -> str | None:
    """Get aircraft thumbnail from airport-data.com (fallback photo source)."""
    try:
        resp = http_requests.get(
            f"https://airport-data.com/api/ac_thumb.json?m={hex_code}&n=1",
            timeout=LOOKUP_TIMEOUT,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == 200 and data.get("data"):
                return data["data"][0].get("image")
    except Exception as e:
        lookup_logger.debug("airport-data.com lookup failed for %s: %s", hex_code, e)
    return None


def _lookup_hexdb(hex_code: str) -> dict | None:
    """Query hexdb.io for aircraft info (fallback for adsbdb)."""
    try:
        resp = http_requests.get(
            f"https://hexdb.io/api/v1/aircraft/{hex_code}",
            timeout=LOOKUP_TIMEOUT,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("Registration"):
                return data
    except Exception as e:
        lookup_logger.debug("hexdb.io lookup failed for %s: %s", hex_code, e)
    return None


@app.route("/api/aircraft/lookup/<identifier>", methods=["GET"])
@login_required
def lookup_aircraft(identifier: str):
    """Lookup aircraft info by hex code, registration, or callsign.
    Queries adsbdb.com (free, no API key) + OpenSky metadata + planespotters.net + OGN DDB.
    Accepts optional ?callsign=XXX and ?icao_hex=XXX (ICAO hex from OGN data).
    Results are cached for 1 hour.
    """
    identifier = identifier.strip().upper()
    callsign = request.args.get("callsign", "").strip().upper()
    icao_hex = request.args.get("icao_hex", "").strip().upper()

    lookup_logger.info(
        "GET /api/aircraft/lookup/%s callsign=%s icao_hex=%s",
        identifier, callsign or "-", icao_hex or "-",
    )

    # Check cache
    cache_key = f"{identifier}_{callsign}_{icao_hex}"
    cached = _cached_lookup(cache_key)
    if cached:
        lookup_logger.debug("Cache hit for %s", cache_key)
        return jsonify(cached)

    result: dict = {"identifier": identifier, "found": False}

    # Determine which hex code to use for lookups
    # If icao_hex is provided (from OGN data), use it for adsbdb/OpenSky/planespotters
    lookup_hex = icao_hex if icao_hex else identifier

    # 1. adsbdb.com aircraft lookup (by hex or registration)
    adsbdb = _lookup_adsbdb(lookup_hex)
    if adsbdb:
        result["found"] = True
        result["type"] = adsbdb.get("type") or adsbdb.get("icao_type")
        result["icao_type"] = adsbdb.get("icao_type")
        result["manufacturer"] = adsbdb.get("manufacturer")
        result["registration"] = adsbdb.get("registration")
        result["owner"] = adsbdb.get("registered_owner")
        result["owner_country"] = adsbdb.get("registered_owner_country_name")
        result["operator_flag"] = adsbdb.get("registered_owner_operator_flag_code")
        result["photo_url"] = adsbdb.get("url_photo_thumbnail") or adsbdb.get("url_photo")
        result["source_db"] = "adsbdb"

    # 2. OpenSky metadata (supplements adsbdb or used as fallback)
    opensky = _lookup_opensky_metadata(lookup_hex)
    if opensky:
        result["found"] = True
        if not result.get("type"):
            result["type"] = opensky.get("model") or opensky.get("typecode")
        if not result.get("icao_type"):
            result["icao_type"] = opensky.get("typecode")
        if not result.get("manufacturer"):
            result["manufacturer"] = opensky.get("manufacturer") or opensky.get("manufacturerName")
        if not result.get("registration"):
            result["registration"] = opensky.get("registration")
        if not result.get("owner"):
            result["owner"] = opensky.get("owner") or opensky.get("operator")
        result["operator"] = opensky.get("operator")
        result["operator_callsign"] = opensky.get("operatorCallsign")
        result["operator_icao"] = opensky.get("operatorIcao")
        result["serial_number"] = opensky.get("serialNumber")
        result["icao_aircraft_class"] = opensky.get("icaoAircraftClass")
        result["country"] = opensky.get("country") or result.get("owner_country")
        if not result.get("source_db"):
            result["source_db"] = "opensky"

    # 3. hexdb.io (fallback if adsbdb had no data)
    if not result.get("type"):
        hexdb = _lookup_hexdb(lookup_hex)
        if hexdb:
            result["found"] = True
            if not result.get("type"):
                result["type"] = hexdb.get("Type")
            if not result.get("icao_type"):
                result["icao_type"] = hexdb.get("ICAOTypeCode")
            if not result.get("manufacturer"):
                result["manufacturer"] = hexdb.get("Manufacturer")
            if not result.get("registration"):
                result["registration"] = hexdb.get("Registration")
            if not result.get("owner"):
                result["owner"] = hexdb.get("RegisteredOwners")
            if not result.get("operator_flag"):
                result["operator_flag"] = hexdb.get("OperatorFlagCode")
            if not result.get("source_db"):
                result["source_db"] = "hexdb"

    # 4. OGN Device Database (for gliders, FLARM devices, and as supplement)
    # Try icao_hex first, then the original identifier
    ogn_entry = None
    if icao_hex:
        ogn_entry = _lookup_ogn_ddb(icao_hex)
    if not ogn_entry:
        ogn_entry = _lookup_ogn_ddb(identifier)
    if ogn_entry:
        result["found"] = True
        if not result.get("type"):
            result["type"] = ogn_entry.get("model")
        if not result.get("registration"):
            result["registration"] = ogn_entry.get("registration")
        result["ogn_cn"] = ogn_entry.get("cn")
        result["ogn_device_type"] = ogn_entry.get("device_type")
        if not result.get("source_db"):
            result["source_db"] = "ogn_ddb"

    # 4. Callsign route lookup
    if callsign:
        route = _lookup_adsbdb_callsign(callsign)
        if route:
            result["callsign"] = callsign
            airline = route.get("airline", {})
            if airline:
                result["airline"] = airline.get("name")
                result["airline_icao"] = airline.get("icao")
                result["airline_country"] = airline.get("country_name")
            origin = route.get("origin", {})
            if origin:
                result["origin"] = {
                    "name": origin.get("name"),
                    "icao": origin.get("icao_code"),
                    "iata": origin.get("iata_code"),
                    "city": origin.get("municipality"),
                }
            destination = route.get("destination", {})
            if destination:
                result["destination"] = {
                    "name": destination.get("name"),
                    "icao": destination.get("icao_code"),
                    "iata": destination.get("iata_code"),
                    "city": destination.get("municipality"),
                }

    # 6. Photo (if not already from adsbdb)
    if not result.get("photo_url"):
        photo = _lookup_planespotters_photo(lookup_hex)
        if photo:
            result["photo_url"] = photo

    # 7. Photo fallback: airport-data.com
    if not result.get("photo_url"):
        photo = _lookup_airport_data_photo(lookup_hex)
        if photo:
            result["photo_url"] = photo

    _store_cache(cache_key, result)
    lookup_logger.info(
        "Lookup result for %s: found=%s type=%s reg=%s owner=%s source=%s",
        identifier, result["found"], result.get("type"),
        result.get("registration"), result.get("owner"), result.get("source_db"),
    )
    return jsonify(result)


# ─── Trail Archive Routes ──────────────────────────────────

trail_logger = logging.getLogger("trails")


@app.route("/api/trails/archives", methods=["GET"])
@login_required
def list_trail_archives():
    """List all archived flight trails for the current tenant (metadata only)."""
    tid = g.tenant_id or DEFAULT_TENANT_ID
    archives = archive.list_archives(tenant_id=tid)
    trail_logger.debug("GET /api/trails/archives tenant=%s - %d archives", tid, len(archives))
    return jsonify(archives)


@app.route("/api/trails/archives/<archive_id>", methods=["GET"])
@login_required
def get_trail_archive(archive_id: str):
    """Get a full archived trail including all points."""
    tid = g.tenant_id or DEFAULT_TENANT_ID
    data = archive.get_archive(archive_id, tenant_id=tid)
    if not data:
        return jsonify({"error": "Archive not found"}), 404
    return jsonify(data)


@app.route("/api/trails/archives", methods=["POST"])
@login_required
def save_trail_archive():
    """Save a tracked flight trail to the archive (7 day retention)."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400
    tid = g.tenant_id or DEFAULT_TENANT_ID
    try:
        result = archive.save_archive(data, tenant_id=tid)
        return jsonify(result), 201
    except ValueError as e:
        trail_logger.warning("Archive rejected: %s", e)
        return jsonify({"error": str(e)}), 400


@app.route("/api/trails/archives/<archive_id>", methods=["DELETE"])
@login_required
def delete_trail_archive(archive_id: str):
    """Delete an archived trail."""
    tid = g.tenant_id or DEFAULT_TENANT_ID
    if archive.delete_archive(archive_id, tenant_id=tid):
        return jsonify({"status": "deleted"})
    return jsonify({"error": "Archive not found"}), 404


# ─── Flight Zones Routes ──────────────────────────────────

zone_logger = logging.getLogger("zones")


@app.route("/api/zones", methods=["GET"])
@login_required
def list_zones():
    """List all flight zones."""
    zone_list = zones.list_zones(tenant_id=g.tenant_id)
    zone_logger.debug("GET /api/zones - %d zones", len(zone_list))
    return jsonify(zone_list)


@app.route("/api/zones", methods=["POST"])
@login_required
@role_required("tenant_admin")
def create_zone():
    """Create a new flight zone."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400
    try:
        zone = zones.create_zone(data, tenant_id=g.tenant_id)
        zone_logger.info("POST /api/zones - created %s: %s", zone["id"], zone["name"])
        return jsonify(zone), 201
    except ValueError as e:
        zone_logger.warning("Zone creation rejected: %s", e)
        return jsonify({"error": str(e)}), 400


def _forward_geocode(address: str) -> dict | None:
    """Forward-geocode an address string via Nominatim → {lat, lon, display_name} or None."""
    try:
        resp = http_requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": address, "format": "json", "limit": 1, "addressdetails": 1},
            headers={"User-Agent": "FlightArc/1.4 (drone monitoring)"},
            timeout=10,
        )
        if resp.status_code != 200:
            return None
        results = resp.json()
        if not results:
            return None
        hit = results[0]
        return {
            "lat": float(hit["lat"]),
            "lon": float(hit["lon"]),
            "display_name": hit.get("display_name", address),
        }
    except Exception as exc:
        zone_logger.warning("Forward geocode failed for '%s': %s", address, exc)
        return None


@app.route("/api/geocode", methods=["GET"])
@login_required
def geocode_address():
    """Forward-geocode an address string.
    Query: ?q=Musterstraße 1, Berlin
    Returns: { lat, lon, display_name } or 404.
    """
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify({"error": "q Parameter ist erforderlich"}), 400
    result = _forward_geocode(query)
    if not result:
        return jsonify({"error": "Adresse nicht gefunden"}), 404
    return jsonify(result)


@app.route("/api/zones/mission", methods=["POST"])
@login_required
def create_mission_zone():
    """Create a circular 100m-radius mission (Einsatz) flight zone.
    Body: { "name": "...", "lat": 52.0, "lon": 8.5 }
      OR: { "name": "...", "address": "Musterstraße 1, Berlin" }
      OR both (lat/lon takes precedence).
    At least lat+lon or address must be provided.
    Tenant is taken from the auth token.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    name = (data.get("name") or "").strip()
    lat = data.get("lat")
    lon = data.get("lon")
    address = (data.get("address") or "").strip()

    if not name:
        return jsonify({"error": "name ist erforderlich"}), 400

    # Resolve coordinates: lat/lon take precedence, otherwise geocode address
    resolved_address = None
    if lat is not None and lon is not None:
        try:
            lat = float(lat)
            lon = float(lon)
        except (TypeError, ValueError):
            return jsonify({"error": "lat und lon müssen Zahlen sein"}), 400
    elif address:
        geo = _forward_geocode(address)
        if not geo:
            return jsonify({"error": f"Adresse nicht gefunden: {address}"}), 400
        lat = geo["lat"]
        lon = geo["lon"]
        resolved_address = geo["display_name"]
        zone_logger.info("Geocoded '%s' → (%.6f, %.6f)", address, lat, lon)
    else:
        return jsonify({"error": "lat+lon oder address ist erforderlich"}), 400

    from flight_zones import circle_polygon
    mz_defaults = settings.get_mission_zone_defaults(tenant_id=g.tenant_id)
    polygon = circle_polygon(lat, lon, radius_m=mz_defaults["radius"], num_points=36)

    try:
        zone = zones.create_zone({
            "name": name,
            "color": mz_defaults["color"],
            "polygon": polygon,
            "minAltitudeAGL": mz_defaults["minAltitudeAGL"],
            "maxAltitudeAGL": mz_defaults["maxAltitudeAGL"],
        }, tenant_id=g.tenant_id)
        zone_logger.info("POST /api/zones/mission - created %s: %s at (%.6f, %.6f)", zone["id"], name, lat, lon)
        result = zone
        if resolved_address:
            result["resolved_address"] = resolved_address
        return jsonify(result), 201
    except ValueError as e:
        zone_logger.warning("Mission zone rejected: %s", e)
        return jsonify({"error": str(e)}), 400


@app.route("/api/zones/violations", methods=["GET"])
@login_required
def check_zone_violations():
    """Legacy endpoint — now returns stored violation records (same as /api/violations)."""
    records = zones.list_violations(tenant_id=g.tenant_id)
    return jsonify({"records": records, "count": len(records)})


# ─── Shared Violation Records ─────────────────────────────


@app.route("/api/violations", methods=["GET"])
@login_required
def list_violations():
    """Get all violation records for the current tenant (active + ended)."""
    records = zones.list_violations(tenant_id=g.tenant_id)
    zone_logger.debug("GET /api/violations - %d records", len(records))
    return jsonify({"records": records, "count": len(records)})


@app.route("/api/violations/<record_id>", methods=["GET"])
@login_required
def get_violation_detail(record_id: str):
    """Get a single violation record with full trail data."""
    record = zones.get_violation(record_id, tenant_id=g.tenant_id)
    if not record:
        return jsonify({"error": "Record not found"}), 404
    return jsonify(record)


@app.route("/api/violations/<record_id>/comments", methods=["PUT"])
@login_required
def update_violation_comments(record_id: str):
    """Update comments on a violation record."""
    data = request.get_json()
    comments = data.get("comments", "")
    if zones.update_violation_comments(record_id, comments, tenant_id=g.tenant_id):
        return jsonify({"status": "updated"})
    return jsonify({"error": "Record not found"}), 404


@app.route("/api/violations/<record_id>", methods=["DELETE"])
@login_required
@role_required("tenant_admin")
def delete_violation(record_id: str):
    """Delete a single violation record."""
    if zones.delete_violation(record_id, tenant_id=g.tenant_id):
        zone_logger.info("DELETE /api/violations/%s - deleted", record_id)
        return jsonify({"status": "deleted"})
    return jsonify({"error": "Record not found"}), 404


@app.route("/api/violations", methods=["DELETE"])
@login_required
@role_required("tenant_admin")
def clear_violations():
    """Clear all violation records for the current tenant."""
    count = zones.clear_violations(tenant_id=g.tenant_id)
    zone_logger.info("DELETE /api/violations - cleared %d records", count)
    return jsonify({"status": "cleared", "count": count})


@app.route("/api/zones/<zone_id>", methods=["GET"])
@login_required
def get_zone(zone_id: str):
    """Get a single flight zone."""
    zone = zones.get_zone(zone_id, tenant_id=g.tenant_id)
    if not zone:
        return jsonify({"error": "Zone not found"}), 404
    return jsonify(zone)


@app.route("/api/zones/<zone_id>", methods=["PUT"])
@login_required
@role_required("tenant_admin")
def update_zone(zone_id: str):
    """Update a flight zone (name, color, polygon)."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400
    try:
        zone = zones.update_zone(zone_id, data, tenant_id=g.tenant_id)
        if not zone:
            return jsonify({"error": "Zone not found"}), 404
        zone_logger.info("PUT /api/zones/%s - updated", zone_id)
        return jsonify(zone)
    except ValueError as e:
        zone_logger.warning("Zone update rejected: %s", e)
        return jsonify({"error": str(e)}), 400


@app.route("/api/zones/<zone_id>", methods=["DELETE"])
@login_required
@role_required("tenant_admin")
def delete_zone(zone_id: str):
    """Delete a flight zone."""
    if zones.delete_zone(zone_id, tenant_id=g.tenant_id):
        zone_logger.info("DELETE /api/zones/%s - deleted", zone_id)
        return jsonify({"status": "deleted"})
    return jsonify({"error": "Zone not found"}), 404


@app.route("/api/zones/<zone_id>/assign", methods=["POST"])
@login_required
@role_required("tenant_admin")
def assign_drones_to_zone(zone_id: str):
    """Assign drone(s) to a zone. Body: { "droneIds": ["..."] }"""
    data = request.get_json()
    if not data or "droneIds" not in data:
        return jsonify({"error": "droneIds required"}), 400
    drone_ids = data["droneIds"]
    if not isinstance(drone_ids, list):
        return jsonify({"error": "droneIds must be an array"}), 400
    zone = zones.assign_drones(zone_id, drone_ids, tenant_id=g.tenant_id)
    if not zone:
        return jsonify({"error": "Zone not found"}), 404
    zone_logger.info("POST /api/zones/%s/assign - %d drone(s)", zone_id, len(drone_ids))
    return jsonify(zone)


@app.route("/api/zones/<zone_id>/unassign", methods=["POST"])
@login_required
@role_required("tenant_admin")
def unassign_drones_from_zone(zone_id: str):
    """Unassign drone(s) from a zone. Body: { "droneIds": ["..."] }"""
    data = request.get_json()
    if not data or "droneIds" not in data:
        return jsonify({"error": "droneIds required"}), 400
    drone_ids = data["droneIds"]
    if not isinstance(drone_ids, list):
        return jsonify({"error": "droneIds must be an array"}), 400
    zone = zones.unassign_drones(zone_id, drone_ids, tenant_id=g.tenant_id)
    if not zone:
        return jsonify({"error": "Zone not found"}), 404
    zone_logger.info("POST /api/zones/%s/unassign - %d drone(s)", zone_id, len(drone_ids))
    return jsonify(zone)


# ─── Terrain Elevation API ─────────────────────────────────

elevation_logger = logging.getLogger("elevation")

# In-memory elevation cache: "lat_lon" (4 decimal places) -> elevation_m
_elevation_cache: dict[str, float] = {}
_elevation_cache_lock = threading.Lock()


def _get_cached_elevation(lat: float, lon: float) -> float | None:
    """Get cached terrain elevation for rounded coordinates."""
    key = f"{lat:.4f}_{lon:.4f}"
    with _elevation_cache_lock:
        return _elevation_cache.get(key)


def _store_elevation(lat: float, lon: float, elevation: float):
    """Store terrain elevation in cache."""
    key = f"{lat:.4f}_{lon:.4f}"
    with _elevation_cache_lock:
        _elevation_cache[key] = elevation


def _fetch_elevations(coords: list[tuple[float, float]]) -> list[float | None]:
    """Fetch terrain elevations from Open-Meteo API (batch, free, no key)."""
    if not coords:
        return []
    lats = ",".join(f"{c[0]:.4f}" for c in coords)
    lons = ",".join(f"{c[1]:.4f}" for c in coords)
    try:
        resp = http_requests.get(
            "https://api.open-meteo.com/v1/elevation",
            params={"latitude": lats, "longitude": lons},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            elevations = data.get("elevation", [])
            if isinstance(elevations, list) and len(elevations) == len(coords):
                for i, (lat, lon) in enumerate(coords):
                    if elevations[i] is not None:
                        _store_elevation(lat, lon, elevations[i])
                return elevations
    except Exception as e:
        elevation_logger.warning("Open-Meteo elevation fetch failed: %s", e)
    return [None] * len(coords)


@app.route("/api/elevation", methods=["GET"])
@login_required
def get_elevation():
    """Get terrain elevation for coordinates. Supports batch: ?locations=lat,lon|lat,lon
    Returns ground elevation in meters (above mean sea level).
    """
    locations_str = request.args.get("locations", "")
    if not locations_str:
        return jsonify({"error": "locations parameter required (format: lat,lon|lat,lon)"}), 400

    coords: list[tuple[float, float]] = []
    for loc in locations_str.split("|"):
        parts = loc.strip().split(",")
        if len(parts) != 2:
            continue
        try:
            coords.append((float(parts[0]), float(parts[1])))
        except ValueError:
            continue

    if not coords:
        return jsonify({"error": "No valid coordinates provided"}), 400

    # Check cache first, collect uncached
    results: list[dict] = []
    uncached_indices: list[int] = []
    uncached_coords: list[tuple[float, float]] = []

    for i, (lat, lon) in enumerate(coords):
        cached = _get_cached_elevation(lat, lon)
        if cached is not None:
            results.append({"lat": lat, "lon": lon, "elevation": cached})
        else:
            results.append({"lat": lat, "lon": lon, "elevation": None})
            uncached_indices.append(i)
            uncached_coords.append((lat, lon))

    # Fetch uncached from Open-Meteo
    if uncached_coords:
        fetched = _fetch_elevations(uncached_coords)
        for j, idx in enumerate(uncached_indices):
            if fetched[j] is not None:
                results[idx]["elevation"] = fetched[j]

    elevation_logger.debug("Elevation query: %d coords, %d cached, %d fetched",
                           len(coords), len(coords) - len(uncached_coords), len(uncached_coords))

    return jsonify({"elevations": results})


# ─── No-Fly Zone (DIPUL WMS) Routes ────────────────────────


@app.route("/api/nofly/check", methods=["GET"])
@login_required
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
@login_required
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
    logger.info("FlightArc starting on port %d", PORT)
    logger.info("Fleet center: %.6f, %.6f", DEFAULT_LAT, DEFAULT_LON)
    logger.info("Frontend dist: %s", FRONTEND_DIST)
    logger.info("Enabled sources: %s", settings.get_enabled_sources())
    logger.info("API: http://localhost:%d/api/drones", PORT)
    app.run(host="0.0.0.0", port=PORT, debug=False)
