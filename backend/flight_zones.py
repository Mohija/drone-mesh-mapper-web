"""
Flight Zones — user-defined flight zones with drone assignment and violation detection.
Persists zones as individual JSON files.
"""

import json
import logging
import os
import threading
import time
import uuid

logger = logging.getLogger("flight_zones")


class FlightZoneManager:
    def __init__(self, data_dir: str):
        self._dir = data_dir
        self._lock = threading.Lock()
        self._zones: dict[str, dict] = {}
        os.makedirs(data_dir, exist_ok=True)
        self._load_all()

    def _load_all(self):
        """Load all zone JSON files into memory."""
        count = 0
        for fname in os.listdir(self._dir):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(self._dir, fname)
            try:
                with open(path, "r") as f:
                    data = json.load(f)
                zone_id = data.get("id", fname.replace(".json", ""))
                # Ensure altitude fields exist (backward compat)
                data.setdefault("minAltitudeAGL", None)
                data.setdefault("maxAltitudeAGL", None)
                self._zones[zone_id] = data
                count += 1
            except Exception as e:
                logger.warning("Failed to load zone %s: %s", fname, e)
        if count:
            logger.info("Loaded %d flight zones", count)

    def _save_zone(self, zone: dict):
        """Write a zone to disk."""
        path = os.path.join(self._dir, f"{zone['id']}.json")
        with open(path, "w") as f:
            json.dump(zone, f)

    def list_zones(self) -> list[dict]:
        with self._lock:
            return list(self._zones.values())

    def get_zone(self, zone_id: str) -> dict | None:
        with self._lock:
            return self._zones.get(zone_id)

    def create_zone(self, data: dict) -> dict:
        polygon = data.get("polygon", [])
        if len(polygon) < 3:
            raise ValueError("Polygon must have at least 3 points")

        name = data.get("name", "").strip()
        if not name:
            raise ValueError("Zone name is required")

        zone_id = str(uuid.uuid4())[:8]
        now = time.time()
        zone = {
            "id": zone_id,
            "name": name,
            "color": data.get("color", "#3b82f6"),
            "polygon": polygon,
            "minAltitudeAGL": data.get("minAltitudeAGL"),
            "maxAltitudeAGL": data.get("maxAltitudeAGL"),
            "assignedDrones": data.get("assignedDrones", []),
            "createdAt": now,
            "updatedAt": now,
        }

        self._save_zone(zone)
        with self._lock:
            self._zones[zone_id] = zone

        logger.info("Created zone %s: name=%s points=%d", zone_id, name, len(polygon))
        return zone

    def update_zone(self, zone_id: str, data: dict) -> dict | None:
        with self._lock:
            zone = self._zones.get(zone_id)
            if not zone:
                return None
            zone = dict(zone)  # copy

        if "name" in data:
            name = data["name"].strip()
            if not name:
                raise ValueError("Zone name is required")
            zone["name"] = name
        if "color" in data:
            zone["color"] = data["color"]
        if "polygon" in data:
            if len(data["polygon"]) < 3:
                raise ValueError("Polygon must have at least 3 points")
            zone["polygon"] = data["polygon"]
        if "minAltitudeAGL" in data:
            zone["minAltitudeAGL"] = data["minAltitudeAGL"]
        if "maxAltitudeAGL" in data:
            zone["maxAltitudeAGL"] = data["maxAltitudeAGL"]
        zone["updatedAt"] = time.time()

        self._save_zone(zone)
        with self._lock:
            self._zones[zone_id] = zone

        logger.info("Updated zone %s", zone_id)
        return zone

    def delete_zone(self, zone_id: str) -> bool:
        with self._lock:
            if zone_id not in self._zones:
                return False
            del self._zones[zone_id]
        path = os.path.join(self._dir, f"{zone_id}.json")
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        logger.info("Deleted zone %s", zone_id)
        return True

    def assign_drones(self, zone_id: str, drone_ids: list[str]) -> dict | None:
        with self._lock:
            zone = self._zones.get(zone_id)
            if not zone:
                return None
            zone = dict(zone)
            existing = set(zone.get("assignedDrones", []))
            existing.update(drone_ids)
            zone["assignedDrones"] = list(existing)
            zone["updatedAt"] = time.time()
            self._zones[zone_id] = zone

        self._save_zone(zone)
        logger.info("Assigned %d drone(s) to zone %s", len(drone_ids), zone_id)
        return zone

    def unassign_drones(self, zone_id: str, drone_ids: list[str]) -> dict | None:
        with self._lock:
            zone = self._zones.get(zone_id)
            if not zone:
                return None
            zone = dict(zone)
            to_remove = set(drone_ids)
            zone["assignedDrones"] = [d for d in zone.get("assignedDrones", []) if d not in to_remove]
            zone["updatedAt"] = time.time()
            self._zones[zone_id] = zone

        self._save_zone(zone)
        logger.info("Unassigned %d drone(s) from zone %s", len(drone_ids), zone_id)
        return zone

    def check_violations(self, drones: list[dict], get_elevation=None) -> list[dict]:
        """Check all zones for drones that are inside but not assigned.
        get_elevation: optional callable(lat, lon) -> float|None for AGL checks.
        Returns list of violation dicts: {droneId, droneName, zoneId, zoneName, timestamp}.
        """
        with self._lock:
            zones = list(self._zones.values())

        violations = []
        now = time.time()

        for zone in zones:
            polygon = zone.get("polygon", [])
            if len(polygon) < 3:
                continue
            assigned = set(zone.get("assignedDrones", []))
            min_agl = zone.get("minAltitudeAGL")
            max_agl = zone.get("maxAltitudeAGL")

            for drone in drones:
                drone_id = drone.get("id", "")
                if drone_id in assigned:
                    continue
                basic_id = drone.get("basic_id", "")
                if basic_id and basic_id in assigned:
                    continue

                lat = drone.get("latitude", 0)
                lon = drone.get("longitude", 0)
                if not point_in_polygon(lat, lon, polygon):
                    continue

                # AGL altitude check if zone has altitude limits
                if min_agl is not None or max_agl is not None:
                    drone_alt = drone.get("altitude", 0) or 0
                    ground = 0.0
                    if get_elevation:
                        elev = get_elevation(lat, lon)
                        if elev is not None:
                            ground = elev
                    drone_agl = drone_alt - ground
                    if min_agl is not None and drone_agl < min_agl:
                        continue  # below zone floor
                    if max_agl is not None and drone_agl > max_agl:
                        continue  # above zone ceiling

                violations.append({
                    "droneId": drone_id,
                    "droneName": drone.get("name", drone_id),
                    "zoneId": zone["id"],
                    "zoneName": zone["name"],
                    "timestamp": now,
                })

        return violations


def point_in_polygon(lat: float, lon: float, polygon: list[list[float]]) -> bool:
    """Ray-casting algorithm to check if a point is inside a polygon.
    polygon is a list of [lat, lon] pairs. The polygon is automatically closed.
    """
    n = len(polygon)
    if n < 3:
        return False

    inside = False
    j = n - 1
    for i in range(n):
        yi, xi = polygon[i][0], polygon[i][1]
        yj, xj = polygon[j][0], polygon[j][1]

        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i

    return inside
