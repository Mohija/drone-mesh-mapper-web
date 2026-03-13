"""
Flight Zones — user-defined flight zones with drone assignment and violation detection.
Now backed by SQLAlchemy database instead of JSON files.
"""

import logging
import time
from contextlib import contextmanager

from flask import has_app_context

logger = logging.getLogger("flight_zones")


class FlightZoneManager:
    def __init__(self, app=None, tenant_id=None):
        self._app = app
        self._default_tenant_id = tenant_id
        self._zone_versions: dict[str, int] = {}       # tenant_id -> version counter
        self._violation_versions: dict[str, int] = {}  # tenant_id -> version counter

    def get_zone_version(self, tenant_id=None) -> int:
        """Return current zone version for a tenant (increments on every mutation)."""
        tid = tenant_id or self._default_tenant_id
        return self._zone_versions.get(tid, 0)

    def _bump_version(self, tenant_id=None):
        """Increment zone version for a tenant so clients know to refetch."""
        tid = tenant_id or self._default_tenant_id
        self._zone_versions[tid] = self._zone_versions.get(tid, 0) + 1

    def get_violation_version(self, tenant_id=None) -> int:
        """Return current violation version for a tenant."""
        tid = tenant_id or self._default_tenant_id
        return self._violation_versions.get(tid, 0)

    def _bump_violation_version(self, tenant_id=None):
        """Increment violation version so clients refetch violation records."""
        tid = tenant_id or self._default_tenant_id
        self._violation_versions[tid] = self._violation_versions.get(tid, 0) + 1

    def bind(self, app, tenant_id):
        self._app = app
        self._default_tenant_id = tenant_id

    @contextmanager
    def _ctx(self):
        """Provide app context, reusing current one if available."""
        if has_app_context():
            yield
        elif self._app:
            with self._app.app_context():
                yield
        else:
            raise RuntimeError("No Flask app context available")

    def list_zones(self, tenant_id=None) -> list[dict]:
        from models import FlightZone as FZModel
        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            zones = FZModel.query.filter_by(tenant_id=tid).all()
            return [z.to_dict() for z in zones]

    def get_zone(self, zone_id: str, tenant_id=None) -> dict | None:
        from models import FlightZone as FZModel
        from database import db
        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            zone = db.session.get(FZModel, zone_id)
            if not zone:
                return None
            if tid and zone.tenant_id != tid:
                return None
            return zone.to_dict()

    def create_zone(self, data: dict, tenant_id=None) -> dict:
        from models import FlightZone as FZModel
        from database import db

        polygon = data.get("polygon", [])
        if len(polygon) < 3:
            raise ValueError("Polygon must have at least 3 points")

        name = data.get("name", "").strip()
        if not name:
            raise ValueError("Zone name is required")

        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            zone = FZModel(
                tenant_id=tid,
                name=name,
                color=data.get("color", "#3b82f6"),
                polygon=polygon,
                min_altitude_agl=data.get("minAltitudeAGL"),
                max_altitude_agl=data.get("maxAltitudeAGL"),
                assigned_drones=data.get("assignedDrones", []),
            )
            db.session.add(zone)
            db.session.commit()
            result = zone.to_dict()

        self._bump_version(tid)
        logger.info("Created zone %s: name=%s points=%d", result["id"], name, len(polygon))
        return result

    def update_zone(self, zone_id: str, data: dict, tenant_id=None) -> dict | None:
        from models import FlightZone as FZModel
        from database import db

        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            zone = db.session.get(FZModel, zone_id)
            if not zone:
                return None
            if tid and zone.tenant_id != tid:
                return None

            if "name" in data:
                name = data["name"].strip()
                if not name:
                    raise ValueError("Zone name is required")
                zone.name = name
            if "color" in data:
                zone.color = data["color"]
            if "polygon" in data:
                if len(data["polygon"]) < 3:
                    raise ValueError("Polygon must have at least 3 points")
                zone.polygon = data["polygon"]
            if "minAltitudeAGL" in data:
                zone.min_altitude_agl = data["minAltitudeAGL"]
            if "maxAltitudeAGL" in data:
                zone.max_altitude_agl = data["maxAltitudeAGL"]
            zone.updated_at = time.time()

            db.session.commit()
            result = zone.to_dict()

        self._bump_version(tid)
        logger.info("Updated zone %s", zone_id)
        return result

    def delete_zone(self, zone_id: str, tenant_id=None) -> bool:
        from models import FlightZone as FZModel
        from database import db

        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            zone = db.session.get(FZModel, zone_id)
            if not zone:
                return False
            if tid and zone.tenant_id != tid:
                return False
            db.session.delete(zone)
            db.session.commit()

        self._bump_version(tid)
        logger.info("Deleted zone %s", zone_id)
        return True

    def assign_drones(self, zone_id: str, drone_ids: list[str], tenant_id=None) -> dict | None:
        from models import FlightZone as FZModel
        from database import db

        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            zone = db.session.get(FZModel, zone_id)
            if not zone:
                return None
            if tid and zone.tenant_id != tid:
                return None

            existing = set(zone.assigned_drones or [])
            existing.update(drone_ids)
            zone.assigned_drones = list(existing)
            zone.updated_at = time.time()
            db.session.commit()
            result = zone.to_dict()

        self._bump_version(tid)
        logger.info("Assigned %d drone(s) to zone %s", len(drone_ids), zone_id)
        return result

    def unassign_drones(self, zone_id: str, drone_ids: list[str], tenant_id=None) -> dict | None:
        from models import FlightZone as FZModel
        from database import db

        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            zone = db.session.get(FZModel, zone_id)
            if not zone:
                return None
            if tid and zone.tenant_id != tid:
                return None

            to_remove = set(drone_ids)
            zone.assigned_drones = [d for d in (zone.assigned_drones or []) if d not in to_remove]
            zone.updated_at = time.time()
            db.session.commit()
            result = zone.to_dict()

        self._bump_version(tid)
        logger.info("Unassigned %d drone(s) from zone %s", len(drone_ids), zone_id)
        return result

    def check_violations(self, drones: list[dict], get_elevation=None, tenant_id=None) -> list[dict]:
        """Check all zones for drones that are inside but not assigned."""
        zones = self.list_zones(tenant_id=tenant_id)
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

                if min_agl is not None or max_agl is not None:
                    drone_alt = drone.get("altitude", 0) or 0
                    ground = 0.0
                    if get_elevation:
                        elev = get_elevation(lat, lon)
                        if elev is not None:
                            ground = elev
                    drone_agl = drone_alt - ground
                    if min_agl is not None and drone_agl < min_agl:
                        continue
                    if max_agl is not None and drone_agl > max_agl:
                        continue

                violations.append({
                    "droneId": drone_id,
                    "droneName": drone.get("name", drone_id),
                    "zoneId": zone["id"],
                    "zoneName": zone["name"],
                    "timestamp": now,
                })

        return violations


    # ── Shared Violation Records ────────────────────────────────

    def update_violations(self, drones: list[dict], get_elevation=None, tenant_id=None):
        """Check all zones and update violation records in the DB.

        - New violations → create record (start_time=now, end_time=NULL)
        - Drone leaves zone → set end_time on existing active record
        - Drone re-enters zone → create a NEW record
        This is idempotent — safe to call from multiple concurrent requests.
        """
        from models import ViolationRecord as VR
        from database import db

        tid = tenant_id or self._default_tenant_id
        now = time.time()

        # 1. Compute currently active violation pairs
        zones_list = self.list_zones(tenant_id=tid)
        active_pairs: dict[tuple[str, str], dict] = {}  # (drone_id, zone_id) -> details

        for zone in zones_list:
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

                if min_agl is not None or max_agl is not None:
                    drone_alt = drone.get("altitude", 0) or 0
                    ground = 0.0
                    if get_elevation:
                        elev = get_elevation(lat, lon)
                        if elev is not None:
                            ground = elev
                    drone_agl = drone_alt - ground
                    if min_agl is not None and drone_agl < min_agl:
                        continue
                    if max_agl is not None and drone_agl > max_agl:
                        continue

                active_pairs[(drone_id, zone["id"])] = {
                    "drone_name": drone.get("name", drone_id),
                    "zone_name": zone["name"],
                    "zone_color": zone.get("color", "#ef4444"),
                    "zone_polygon": polygon,
                    "drone": drone,  # full drone dict for trail snapshot
                }

        # 2. Update DB records atomically
        with self._ctx():
            active_records = VR.query.filter_by(tenant_id=tid, end_time=None).all()
            existing_keys: dict[tuple[str, str], "VR"] = {}
            for record in active_records:
                existing_keys[(record.drone_id, record.zone_id)] = record

            # End violations where drone left zone
            changed = False
            for key, record in existing_keys.items():
                if key not in active_pairs:
                    record.end_time = now
                    changed = True

            # Create new violations or append trail snapshots
            for key, details in active_pairs.items():
                drone = details["drone"]
                snapshot = {
                    "lat": round(drone.get("latitude", 0), 6),
                    "lon": round(drone.get("longitude", 0), 6),
                    "alt": round(drone.get("altitude", 0) or 0, 1),
                    "speed": round(drone.get("speed", 0) or 0, 1),
                    "battery": drone.get("battery"),
                    "signal": drone.get("signal_strength"),
                    "heading": round(drone.get("bearing", 0) or 0, 1) if drone.get("bearing") else None,
                    "pilot_lat": round(drone["pilot_latitude"], 6) if drone.get("pilot_latitude") is not None else None,
                    "pilot_lon": round(drone["pilot_longitude"], 6) if drone.get("pilot_longitude") is not None else None,
                    "ts": round(now, 2),
                }

                if key not in existing_keys:
                    drone_id, zone_id = key
                    db.session.add(VR(
                        tenant_id=tid,
                        drone_id=drone_id,
                        drone_name=details["drone_name"],
                        zone_id=zone_id,
                        zone_name=details["zone_name"],
                        zone_color=details["zone_color"],
                        zone_polygon=details["zone_polygon"],
                        start_time=now,
                        trail_data=[snapshot],
                    ))
                    changed = True
                else:
                    # Append trail snapshot to existing active violation
                    record = existing_keys[key]
                    trail = list(record.trail_data or [])
                    trail.append(snapshot)
                    record.trail_data = trail

            db.session.commit()

        if changed:
            self._bump_violation_version(tid)
        logger.debug("update_violations tenant=%s: %d active pairs, %d db records, changed=%s",
                      tid, len(active_pairs), len(existing_keys), changed)

    def list_violations(self, tenant_id=None) -> list[dict]:
        """Get all violation records for a tenant (active + ended)."""
        from models import ViolationRecord as VR

        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            records = VR.query.filter_by(tenant_id=tid).order_by(VR.start_time.desc()).all()
            return [r.to_dict(include_trail=False) for r in records]

    def get_violation(self, record_id: str, tenant_id=None) -> dict | None:
        """Get a single violation record with full trail data."""
        from models import ViolationRecord as VR
        from database import db

        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            record = db.session.get(VR, record_id)
            if not record or (tid and record.tenant_id != tid):
                return None
            return record.to_dict(include_trail=True)

    def update_violation_comments(self, record_id: str, comments: str, tenant_id=None) -> bool:
        """Update comments on a violation record."""
        from models import ViolationRecord as VR
        from database import db

        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            record = db.session.get(VR, record_id)
            if not record or (tid and record.tenant_id != tid):
                return False
            record.comments = comments
            db.session.commit()
        self._bump_violation_version(tid)
        logger.debug("Updated comments on violation %s", record_id)
        return True

    def delete_violation(self, record_id: str, tenant_id=None) -> bool:
        """Delete a single violation record."""
        from models import ViolationRecord as VR
        from database import db

        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            record = db.session.get(VR, record_id)
            if not record or (tid and record.tenant_id != tid):
                return False
            db.session.delete(record)
            db.session.commit()
        self._bump_violation_version(tid)
        logger.debug("Deleted violation record %s", record_id)
        return True

    def clear_violations(self, tenant_id=None) -> int:
        """Delete all violation records for a tenant. Returns count deleted."""
        from models import ViolationRecord as VR
        from database import db

        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            count = VR.query.filter_by(tenant_id=tid).delete()
            db.session.commit()
        if count > 0:
            self._bump_violation_version(tid)
        logger.info("Cleared %d violation records for tenant %s", count, tid)
        return count


def circle_polygon(lat: float, lon: float, radius_m: float, num_points: int = 36) -> list[list[float]]:
    """Generate a circular polygon around a center point.

    Returns a list of [lat, lon] pairs approximating a circle.
    """
    import math
    R = 6371000  # earth radius in meters
    points = []
    for i in range(num_points):
        bearing = math.radians(i * (360 / num_points))
        lat1 = math.radians(lat)
        lon1 = math.radians(lon)
        lat2 = math.asin(
            math.sin(lat1) * math.cos(radius_m / R)
            + math.cos(lat1) * math.sin(radius_m / R) * math.cos(bearing)
        )
        lon2 = lon1 + math.atan2(
            math.sin(bearing) * math.sin(radius_m / R) * math.cos(lat1),
            math.cos(radius_m / R) - math.sin(lat1) * math.sin(lat2),
        )
        points.append([round(math.degrees(lat2), 6), round(math.degrees(lon2), 6)])
    return points


def point_in_polygon(lat: float, lon: float, polygon: list[list[float]]) -> bool:
    """Ray-casting algorithm to check if a point is inside a polygon."""
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
