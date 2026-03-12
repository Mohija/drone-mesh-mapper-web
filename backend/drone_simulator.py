"""
Drone Simulator - Generates realistic drone detection data for testing without hardware.
"""

import logging
import math
import random
import time
import threading
from typing import Optional

logger = logging.getLogger("dronefleet")


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two GPS coordinates."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def move_point(lat: float, lon: float, bearing_deg: float, distance_m: float) -> tuple:
    """Move a GPS point by distance in meters along a bearing."""
    R = 6371000
    bearing = math.radians(bearing_deg)
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    lat2 = math.asin(
        math.sin(lat1) * math.cos(distance_m / R)
        + math.cos(lat1) * math.sin(distance_m / R) * math.cos(bearing)
    )
    lon2 = lon1 + math.atan2(
        math.sin(bearing) * math.sin(distance_m / R) * math.cos(lat1),
        math.cos(distance_m / R) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), math.degrees(lon2)


FLIGHT_PATTERNS = [
    "linear", "circular", "waypoint", "search_pattern", "hover",
    "figure_eight", "spiral", "random_walk",
]

MANUFACTURERS = ["DJI", "Autel", "Parrot", "Skydio", "Yuneec"]
MODELS = {
    "DJI": ["Mavic 3", "Mini 4 Pro", "Air 3", "Phantom 4"],
    "Autel": ["EVO II Pro", "EVO Nano+", "EVO Max 4T"],
    "Parrot": ["Anafi", "Anafi AI", "Anafi USA"],
    "Skydio": ["Skydio 2+", "Skydio X2", "Skydio X10"],
    "Yuneec": ["Typhoon H3", "Mantis G", "H520E"],
}


class DroneSimulator:
    """Simulates a single drone with realistic flight behavior."""

    def __init__(
        self,
        drone_id: int,
        name: str,
        mac: str,
        basic_id: str,
        center_lat: float,
        center_lon: float,
        flight_pattern: str | None = None,
        speed: float | None = None,
        altitude: float | None = None,
    ):
        self.drone_id = drone_id
        self.name = name
        self.mac = mac
        self.basic_id = basic_id

        # Random start position near center
        offset_lat = random.uniform(-0.02, 0.02)
        offset_lon = random.uniform(-0.02, 0.02)
        self.lat = center_lat + offset_lat
        self.lon = center_lon + offset_lon

        # Pilot position (stationary, near drone start)
        self.pilot_lat = self.lat + random.uniform(-0.005, 0.005)
        self.pilot_lon = self.lon + random.uniform(-0.005, 0.005)

        # Flight parameters (accept overrides from config)
        self.altitude = altitude if altitude is not None else random.uniform(30, 200)
        self.speed = speed if speed is not None else random.uniform(5, 25)
        self.bearing = random.uniform(0, 360)
        self.flight_pattern = flight_pattern or random.choice(FLIGHT_PATTERNS)

        # Circular pattern params
        self.circle_center_lat = self.lat
        self.circle_center_lon = self.lon
        self.circle_radius = random.uniform(100, 500)
        self.circle_angle = 0.0

        # Waypoint pattern params
        self.waypoints = [
            (
                self.lat + random.uniform(-0.01, 0.01),
                self.lon + random.uniform(-0.01, 0.01),
            )
            for _ in range(random.randint(3, 6))
        ]
        self.current_waypoint = 0

        # Search pattern params
        self.search_origin_lat = self.lat
        self.search_origin_lon = self.lon
        self.search_leg = 0
        self.search_direction = 0

        # Figure-eight pattern params
        self.fig8_center_lat = self.lat
        self.fig8_center_lon = self.lon
        self.fig8_radius = random.uniform(200, 600)
        self.fig8_angle = 0.0

        # Spiral pattern params
        self.spiral_center_lat = self.lat
        self.spiral_center_lon = self.lon
        self.spiral_angle = 0.0
        self.spiral_radius = 50.0  # starts small, grows
        self.spiral_expanding = True

        # Random walk params
        self.walk_turn_timer = 0.0
        self.walk_turn_interval = random.uniform(5, 15)

        # Battery simulation
        self.battery = random.uniform(60, 100)
        self.battery_drain = random.uniform(0.01, 0.05)

        # Status
        self.status = "active"
        self.last_update = time.time()

        # FAA data (simulated)
        manufacturer = random.choice(MANUFACTURERS)
        self.faa_data = {
            "registrant_name": f"Pilot {drone_id}",
            "registrant_type": "Individual",
            "manufacturer": manufacturer,
            "model": random.choice(MODELS[manufacturer]),
            "registration_date": "2024-01-15",
            "expiration_date": "2027-01-15",
            "status": "Active",
            "serial_number": f"SN{drone_id:04d}{random.randint(1000,9999)}",
            "weight": round(random.uniform(0.25, 2.5), 2),
            "purpose": random.choice(["Recreation", "Commercial", "Research"]),
        }

        # History
        self.position_history = []

    def update_position(self, dt: float = 2.0):
        """Update drone position based on flight pattern."""
        if self.status == "lost":
            return

        # Battery drain
        old_status = self.status
        self.battery = max(0, self.battery - self.battery_drain * dt)
        if self.battery <= 0:
            self.status = "lost"
            if old_status != "lost":
                logger.warning("Drone %s (%s) battery depleted - status: lost", self.name, self.basic_id)
            return

        if self.battery < 15:
            self.status = "error"
            if old_status != "error":
                logger.warning("Drone %s (%s) low battery %.1f%% - status: error", self.name, self.basic_id, self.battery)
        elif self.speed < 1:
            self.status = "idle"
        else:
            self.status = "active"

        distance = self.speed * dt

        if self.flight_pattern == "linear":
            self.lat, self.lon = move_point(self.lat, self.lon, self.bearing, distance)
            self.bearing += random.uniform(-5, 5)

        elif self.flight_pattern == "circular":
            self.circle_angle += (distance / self.circle_radius) * (180 / math.pi)
            self.lat = self.circle_center_lat + (self.circle_radius / 111320) * math.cos(
                math.radians(self.circle_angle)
            )
            self.lon = self.circle_center_lon + (self.circle_radius / 111320) * math.sin(
                math.radians(self.circle_angle)
            ) / math.cos(math.radians(self.circle_center_lat))

        elif self.flight_pattern == "waypoint":
            target = self.waypoints[self.current_waypoint]
            dlat = target[0] - self.lat
            dlon = target[1] - self.lon
            dist_to_target = math.sqrt(dlat ** 2 + dlon ** 2) * 111320
            if dist_to_target < 20:
                self.current_waypoint = (self.current_waypoint + 1) % len(self.waypoints)
            else:
                bearing = math.degrees(math.atan2(dlon, dlat))
                self.lat, self.lon = move_point(self.lat, self.lon, bearing, min(distance, dist_to_target))

        elif self.flight_pattern == "search_pattern":
            leg_length = 100 + self.search_leg * 50
            self.lat, self.lon = move_point(
                self.lat, self.lon, self.search_direction, distance
            )
            dist_from_origin = haversine_distance(
                self.search_origin_lat, self.search_origin_lon, self.lat, self.lon
            )
            if dist_from_origin > leg_length:
                self.search_direction = (self.search_direction + 90) % 360
                self.search_leg += 1

        elif self.flight_pattern == "figure_eight":
            # Lemniscate (figure-eight) using parametric equations
            self.fig8_angle += (distance / self.fig8_radius) * (180 / math.pi)
            angle_rad = math.radians(self.fig8_angle)
            # Parametric figure-eight: x = sin(t), y = sin(t)*cos(t)
            r = self.fig8_radius / 111320  # convert meters to degrees
            cos_center = math.cos(math.radians(self.fig8_center_lat))
            self.lat = self.fig8_center_lat + r * math.sin(angle_rad)
            self.lon = self.fig8_center_lon + (r * math.sin(angle_rad) * math.cos(angle_rad)) / cos_center

        elif self.flight_pattern == "spiral":
            # Expanding/contracting spiral
            self.spiral_angle += (distance / max(self.spiral_radius, 30)) * (180 / math.pi)
            if self.spiral_expanding:
                self.spiral_radius += distance * 0.3
                if self.spiral_radius > 800:
                    self.spiral_expanding = False
            else:
                self.spiral_radius -= distance * 0.3
                if self.spiral_radius < 50:
                    self.spiral_expanding = True

            r = self.spiral_radius / 111320
            cos_center = math.cos(math.radians(self.spiral_center_lat))
            self.lat = self.spiral_center_lat + r * math.cos(math.radians(self.spiral_angle))
            self.lon = self.spiral_center_lon + (r * math.sin(math.radians(self.spiral_angle))) / cos_center

        elif self.flight_pattern == "random_walk":
            # Random direction changes at intervals, simulates exploring
            self.walk_turn_timer += dt
            if self.walk_turn_timer >= self.walk_turn_interval:
                self.walk_turn_timer = 0.0
                self.walk_turn_interval = random.uniform(5, 15)
                self.bearing += random.uniform(-120, 120)
                self.speed = random.uniform(8, 20)
            self.lat, self.lon = move_point(self.lat, self.lon, self.bearing, distance)
            # Small bearing drift between turns
            self.bearing += random.uniform(-3, 3)

        elif self.flight_pattern == "hover":
            self.lat += random.uniform(-0.00001, 0.00001)
            self.lon += random.uniform(-0.00001, 0.00001)

        # Altitude jitter
        self.altitude += random.uniform(-2, 2)
        self.altitude = max(10, min(400, self.altitude))

        self.last_update = time.time()

        # Store history (keep last 100 positions)
        self.position_history.append({
            "lat": round(self.lat, 6),
            "lon": round(self.lon, 6),
            "altitude": round(self.altitude, 1),
            "timestamp": self.last_update,
            "status": self.status,
            "battery": round(self.battery, 1),
        })
        if len(self.position_history) > 100:
            self.position_history = self.position_history[-100:]

    def calculate_rssi(self) -> float:
        """Calculate RSSI based on distance from pilot."""
        dist = haversine_distance(self.lat, self.lon, self.pilot_lat, self.pilot_lon)
        base_rssi = -40
        rssi = base_rssi - (dist / 50)
        rssi += random.uniform(-5, 5)
        return round(max(-90, min(-30, rssi)), 1)

    def to_dict(self) -> dict:
        """Return current drone state as dict for API response."""
        return {
            "id": self.basic_id,
            "mac": self.mac,
            "name": self.name,
            "latitude": round(self.lat, 6),
            "longitude": round(self.lon, 6),
            "altitude": round(self.altitude, 1),
            "pilot_latitude": round(self.pilot_lat, 6),
            "pilot_longitude": round(self.pilot_lon, 6),
            "signal_strength": self.calculate_rssi(),
            "battery": round(self.battery, 1),
            "speed": round(self.speed, 1),
            "status": self.status,
            "flight_pattern": self.flight_pattern,
            "basic_id": self.basic_id,
            "faa_data": self.faa_data,
            "last_update": self.last_update,
        }

    def get_history(self) -> list:
        """Return position history."""
        return list(self.position_history)


class DroneFleet:
    """Manages a fleet of simulated drones."""

    DRONE_CONFIGS = [
        {"id": 1, "name": "Desert Eagle",     "mac": "AA:BB:CC:DD:EE:01", "basic_id": "AZTEST001",
         "pattern": "linear",         "speed": 22, "altitude": 120},
        {"id": 2, "name": "Cactus Hawk",      "mac": "AA:BB:CC:DD:EE:02", "basic_id": "AZTEST002",
         "pattern": "circular",       "speed": 15, "altitude": 80},
        {"id": 3, "name": "Saguaro Scout",    "mac": "AA:BB:CC:DD:EE:03", "basic_id": "AZTEST003",
         "pattern": "waypoint",       "speed": 18, "altitude": 100},
        {"id": 4, "name": "Mesa Phantom",     "mac": "AA:BB:CC:DD:EE:04", "basic_id": "AZTEST004",
         "pattern": "figure_eight",   "speed": 12, "altitude": 60},
        {"id": 5, "name": "Sonoran Surveyor", "mac": "AA:BB:CC:DD:EE:05", "basic_id": "AZTEST005",
         "pattern": "search_pattern", "speed": 10, "altitude": 45},
    ]

    def __init__(self, center_lat: float = 50.1109, center_lon: float = 8.6821):
        """Initialize fleet around a center point (default: Frankfurt)."""
        self.center_lat = center_lat
        self.center_lon = center_lon
        self.drones: list[DroneSimulator] = []
        self.running = False
        self._thread: Optional[threading.Thread] = None
        self._update_interval = 2.0

        for cfg in self.DRONE_CONFIGS:
            drone = DroneSimulator(
                drone_id=cfg["id"],
                name=cfg["name"],
                mac=cfg["mac"],
                basic_id=cfg["basic_id"],
                center_lat=center_lat,
                center_lon=center_lon,
                flight_pattern=cfg.get("pattern"),
                speed=cfg.get("speed"),
                altitude=cfg.get("altitude"),
            )
            self.drones.append(drone)

    def start(self, interval: float = 2.0):
        """Start background simulation thread."""
        if self.running:
            logger.warning("Fleet start called but already running")
            return
        self.running = True
        self._update_interval = interval
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        logger.info("Fleet simulation started (interval=%.1fs, drones=%d)", interval, len(self.drones))

    def stop(self):
        """Stop simulation."""
        self.running = False
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("Fleet simulation stopped")

    def _run(self):
        """Background update loop."""
        while self.running:
            try:
                for drone in self.drones:
                    drone.update_position(dt=self._update_interval)
            except Exception:
                logger.exception("Error during fleet update")
            time.sleep(self._update_interval)

    def get_all_drones(self) -> list:
        """Return all drone states."""
        return [d.to_dict() for d in self.drones]

    def get_drone(self, drone_id: str) -> Optional[dict]:
        """Return single drone by basic_id."""
        for d in self.drones:
            if d.basic_id == drone_id:
                return d.to_dict()
        return None

    def get_drone_history(self, drone_id: str) -> Optional[list]:
        """Return position history for a drone."""
        for d in self.drones:
            if d.basic_id == drone_id:
                return d.get_history()
        return None

    def get_drones_in_radius(self, lat: float, lon: float, radius_m: float = 5000) -> list:
        """Return drones within radius of a point."""
        result = []
        for d in self.drones:
            dist = haversine_distance(lat, lon, d.lat, d.lon)
            drone_dict = d.to_dict()
            drone_dict["distance"] = round(dist, 1)
            if dist <= radius_m:
                result.append(drone_dict)
        result.sort(key=lambda x: x["distance"])
        return result

    def set_center(self, lat: float, lon: float):
        """Recenter fleet around a new position (reinitializes drones)."""
        old_lat, old_lon = self.center_lat, self.center_lon
        self.center_lat = lat
        self.center_lon = lon
        was_running = self.running
        if was_running:
            self.stop()
        self.drones.clear()
        for cfg in self.DRONE_CONFIGS:
            drone = DroneSimulator(
                drone_id=cfg["id"],
                name=cfg["name"],
                mac=cfg["mac"],
                basic_id=cfg["basic_id"],
                center_lat=lat,
                center_lon=lon,
                flight_pattern=cfg.get("pattern"),
                speed=cfg.get("speed"),
                altitude=cfg.get("altitude"),
            )
            self.drones.append(drone)
        if was_running:
            self.start(self._update_interval)
        logger.info(
            "Fleet recentered from (%.6f, %.6f) to (%.6f, %.6f) - %d drones reinitialized",
            old_lat, old_lon, lat, lon, len(self.drones),
        )
