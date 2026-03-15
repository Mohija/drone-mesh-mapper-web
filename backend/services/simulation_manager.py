"""
SimulationManager — Manages in-process dummy receiver instances.

Each simulator runs as a daemon thread that periodically:
  - Calls ReceiverProvider.ingest() every 2s (same as firmware INGEST_INTERVAL_MS)
  - Updates ReceiverNode heartbeat fields every 30s (same as firmware HEARTBEAT_INTERVAL_MS)

Simulators are ephemeral (in-memory only). On server restart they are gone,
but the ReceiverNode DB entries they created persist (status goes to "offline").

IMPORTANT: This module must stay in sync with the real firmware logic
(firmware/src/). When the firmware changes payloads/timing/fields, update
the simulation here too so dummy output matches expected production behavior.
"""

import logging
import math
import random
import secrets
import string
import threading
import time
import uuid

logger = logging.getLogger("simulation")

# ─── Constants (matching firmware config.h) ────────────────────
INGEST_INTERVAL_S = 2
HEARTBEAT_INTERVAL_S = 30
FIRMWARE_VERSION = "1.0.0-sim"


# ─── Simulated Drone ──────────────────────────────────────────

def _random_mac() -> str:
    octets = [random.randint(0, 255) for _ in range(6)]
    octets[0] = octets[0] & 0xFE
    return ":".join(f"{o:02x}" for o in octets)


def _random_serial() -> str:
    prefixes = ["1581F", "3SQK9", "4A2DX", "7RW8L", "9NKJ3"]
    prefix = random.choice(prefixes)
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=15))
    return (prefix + suffix)[:20]


DRONE_TYPES = [
    {"desc": "DJI Mavic 3 Pro", "speed_range": (8, 20)},
    {"desc": "DJI Mini 4 Pro", "speed_range": (5, 15)},
    {"desc": "Autel EVO II", "speed_range": (10, 22)},
    {"desc": "Skydio 2+", "speed_range": (6, 18)},
    {"desc": "DJI Air 3", "speed_range": (7, 19)},
    {"desc": "Parrot Anafi", "speed_range": (5, 14)},
    {"desc": "DJI Matrice 350", "speed_range": (10, 25)},
    {"desc": "Freefly Astro", "speed_range": (8, 16)},
]

SOURCES = ["wifi_beacon", "wifi_nan", "ble"]
SOURCE_WEIGHTS = [0.5, 0.2, 0.3]


# ─── Flight Patterns ──────────────────────────────────────

FLIGHT_PATTERNS = [
    "orbit",       # Kreisflug um Punkt (Inspektion, Überwachung)
    "linear",      # Geradeausflug mit Richtungswechseln (Lieferung, Pendeln)
    "survey",      # Rasenmäher-Muster (Kartierung, Vermessung)
    "hover",       # Schweben an einem Punkt (Foto, Beobachtung)
    "figure8",     # Achter-Figur (Racing, Training)
    "spiral",      # Spirale nach außen/innen (Suchflug)
]


class SimulatedDrone:
    """Single simulated drone with realistic, varied flight patterns."""

    def __init__(self, center_lat: float, center_lon: float, pattern: str | None = None):
        drone_type = random.choice(DRONE_TYPES)
        source = random.choices(SOURCES, weights=SOURCE_WEIGHTS, k=1)[0]

        offset_lat = random.uniform(-0.005, 0.005)
        offset_lon = random.uniform(-0.005, 0.005)

        self.basic_id = _random_serial()
        self.id_type = random.choice([1, 1, 1, 2, 3])
        self.operator_id = f"DEU-{random.randint(10000, 99999)}"
        self.self_id_desc = drone_type["desc"][:23]
        self.mac = _random_mac()
        self.source = source
        self.pattern = pattern or random.choice(FLIGHT_PATTERNS)

        self.lat = center_lat + offset_lat
        self.lon = center_lon + offset_lon
        self.alt = random.uniform(50, 200)
        self.speed = random.uniform(*drone_type["speed_range"])
        self.heading = random.uniform(0, 360)
        self.height_agl = random.uniform(30, 150)

        pilot_off_lat = random.uniform(-0.001, 0.001)
        pilot_off_lon = random.uniform(-0.001, 0.001)
        self.pilot_lat = self.lat + pilot_off_lat
        self.pilot_lon = self.lon + pilot_off_lon

        # Common params
        self._home_lat = self.lat
        self._home_lon = self.lon
        self._t = random.uniform(0, 100)  # Time accumulator
        self._speed_base = random.uniform(*drone_type["speed_range"])
        self._alt_base = random.uniform(60, 160)
        self._alt_variation = random.uniform(5, 30)

        # Pattern-specific params
        self._orbit_radius = random.uniform(0.001, 0.004)  # ~100-400m
        self._orbit_speed = random.uniform(0.02, 0.08)     # rad per dt

        self._linear_heading = random.uniform(0, 360)       # Flight direction
        self._linear_length = random.uniform(0.005, 0.015)  # ~500m-1.5km one way
        self._linear_speed = random.uniform(0.0003, 0.001)  # Progress per dt

        self._survey_width = random.uniform(0.002, 0.006)
        self._survey_length = random.uniform(0.003, 0.008)
        self._survey_lanes = random.randint(4, 10)
        self._survey_speed = random.uniform(0.0002, 0.0006)

        self._hover_drift = random.uniform(0.00002, 0.0001)  # Tiny GPS drift

        self._fig8_radius = random.uniform(0.001, 0.003)
        self._fig8_speed = random.uniform(0.03, 0.1)

        self._spiral_max_r = random.uniform(0.002, 0.006)
        self._spiral_expand_rate = random.uniform(0.00005, 0.0002)
        self._spiral_r = random.uniform(0.0005, 0.001)
        self._spiral_growing = True

    def update(self, dt: float):
        self._t += dt
        getattr(self, f"_update_{self.pattern}")(dt)

    def _update_orbit(self, dt: float):
        """Kreisflug — typisch für Inspektionen, Überwachung."""
        angle = self._t * self._orbit_speed
        self.lat = self._home_lat + self._orbit_radius * math.sin(angle) + random.gauss(0, 0.00003)
        self.lon = self._home_lon + self._orbit_radius * math.cos(angle) + random.gauss(0, 0.00003)
        self.heading = (math.degrees(angle) + 90) % 360
        self.speed = max(1, self._speed_base + random.gauss(0, 1.5))
        self.alt = self._alt_base + self._alt_variation * math.sin(angle * 0.3)
        self.height_agl = self.alt - 20 + random.gauss(0, 1)

    def _update_linear(self, dt: float):
        """Geradeausflug mit Umkehrpunkten — typisch für Lieferungen, Pendeln."""
        # Ping-pong between two endpoints
        progress = (self._t * self._linear_speed) % 2.0
        if progress > 1.0:
            progress = 2.0 - progress  # Reverse direction

        heading_rad = math.radians(self._linear_heading)
        self.lat = self._home_lat + progress * self._linear_length * math.cos(heading_rad) + random.gauss(0, 0.00003)
        self.lon = self._home_lon + progress * self._linear_length * math.sin(heading_rad) + random.gauss(0, 0.00003)

        # Heading flips at endpoints
        raw_progress = (self._t * self._linear_speed) % 2.0
        if raw_progress > 1.0:
            self.heading = (self._linear_heading + 180) % 360
        else:
            self.heading = self._linear_heading

        # Speed: accelerate in middle, slow at turns
        turn_factor = 1.0 - abs(progress - 0.5) * 2.0  # 0 at ends, 1 in middle
        self.speed = max(2, self._speed_base * (0.3 + 0.7 * turn_factor) + random.gauss(0, 1))
        self.alt = self._alt_base + random.gauss(0, 2)
        self.height_agl = self.alt - 20 + random.gauss(0, 1)

    def _update_survey(self, dt: float):
        """Rasenmäher / Lawnmower — typisch für Kartierung, Vermessung."""
        progress = (self._t * self._survey_speed) % 1.0
        total_progress = progress * self._survey_lanes * 2  # 2 directions per lane

        lane = int(total_progress)
        lane_progress = total_progress - lane

        # Heading: bearing of the survey grid (fixed per drone)
        base_rad = math.radians(self._linear_heading)
        perp_rad = base_rad + math.pi / 2

        if lane % 2 == 0:
            # Forward pass
            along = (lane_progress - 0.5) * self._survey_length
            self.heading = self._linear_heading
        else:
            # Reverse pass
            along = (0.5 - lane_progress) * self._survey_length
            self.heading = (self._linear_heading + 180) % 360

        cross = (lane / (self._survey_lanes * 2)) * self._survey_width - self._survey_width / 2

        self.lat = self._home_lat + along * math.cos(base_rad) + cross * math.cos(perp_rad) + random.gauss(0, 0.00002)
        self.lon = self._home_lon + along * math.sin(base_rad) + cross * math.sin(perp_rad) + random.gauss(0, 0.00002)

        # Survey flights are steady and slower
        self.speed = max(2, self._speed_base * 0.6 + random.gauss(0, 0.5))
        self.alt = self._alt_base + random.gauss(0, 1)  # Very stable altitude
        self.height_agl = self.alt - 20 + random.gauss(0, 0.5)

    def _update_hover(self, dt: float):
        """Schweben — typisch für Foto/Video, Beobachtung."""
        # Tiny GPS drift around hover point
        self.lat = self._home_lat + math.sin(self._t * 0.1) * self._hover_drift + random.gauss(0, 0.00001)
        self.lon = self._home_lon + math.cos(self._t * 0.13) * self._hover_drift + random.gauss(0, 0.00001)
        self.heading = (self.heading + random.gauss(0, 3)) % 360  # Slow yaw
        self.speed = max(0, random.gauss(0.5, 0.5))  # Nearly zero
        self.alt = self._alt_base + math.sin(self._t * 0.05) * 2 + random.gauss(0, 0.3)
        self.height_agl = self.alt - 20 + random.gauss(0, 0.3)

    def _update_figure8(self, dt: float):
        """Achter-Figur — typisch für Racing, Training, Show."""
        angle = self._t * self._fig8_speed
        # Lemniscate of Bernoulli (figure-8)
        denom = 1 + math.sin(angle) ** 2
        x = self._fig8_radius * math.cos(angle) / denom
        y = self._fig8_radius * math.sin(angle) * math.cos(angle) / denom

        self.lat = self._home_lat + x + random.gauss(0, 0.00002)
        self.lon = self._home_lon + y + random.gauss(0, 0.00002)

        # Heading follows trajectory
        dx = -self._fig8_radius * math.sin(angle) / denom
        dy = self._fig8_radius * (math.cos(2 * angle)) / denom
        self.heading = math.degrees(math.atan2(dy, dx)) % 360

        # Racing drones are fast with variable speed
        self.speed = max(3, self._speed_base * 1.3 + random.gauss(0, 3))
        self.alt = self._alt_base + 10 * math.sin(angle * 0.5) + random.gauss(0, 2)
        self.height_agl = self.alt - 20 + random.gauss(0, 1)

    def _update_spiral(self, dt: float):
        """Spirale — typisch für Suchflüge, SAR."""
        angle = self._t * self._orbit_speed

        # Expand/contract spiral radius
        if self._spiral_growing:
            self._spiral_r += self._spiral_expand_rate * dt
            if self._spiral_r >= self._spiral_max_r:
                self._spiral_growing = False
        else:
            self._spiral_r -= self._spiral_expand_rate * dt
            if self._spiral_r <= 0.0003:
                self._spiral_growing = True

        self.lat = self._home_lat + self._spiral_r * math.sin(angle) + random.gauss(0, 0.00002)
        self.lon = self._home_lon + self._spiral_r * math.cos(angle) + random.gauss(0, 0.00002)
        self.heading = (math.degrees(angle) + 90) % 360

        # Speed proportional to radius (slower in tight spirals)
        radius_factor = self._spiral_r / self._spiral_max_r
        self.speed = max(2, self._speed_base * (0.4 + 0.6 * radius_factor) + random.gauss(0, 1))

        # Altitude slowly changes during search
        self.alt = self._alt_base + 15 * math.sin(self._t * 0.01) + random.gauss(0, 1)
        self.height_agl = self.alt - 20 + random.gauss(0, 1)

    def to_detection_dict(self) -> dict:
        """Return dict matching firmware http_client.cpp sendIngest() payload."""
        det: dict = {
            "basic_id": self.basic_id,
            "lat": round(self.lat, 7),
            "lon": round(self.lon, 7),
            "alt": round(self.alt, 1),
            "speed": round(self.speed, 1),
            "rssi": random.randint(-85, -45),
            "source": self.source,
        }
        if self.heading >= 0:
            det["heading"] = round(self.heading, 1)
        if self.height_agl != 0.0:
            det["height_agl"] = round(self.height_agl, 1)
        if self.mac:
            det["mac"] = self.mac
        if self.pilot_lat != 0.0 or self.pilot_lon != 0.0:
            det["pilot_lat"] = round(self.pilot_lat, 7)
            det["pilot_lon"] = round(self.pilot_lon, 7)
        if self.operator_id:
            det["operator_id"] = self.operator_id
        if self.id_type > 0:
            id_types = ["none", "serial", "caa", "utm", "specific_session"]
            if 0 <= self.id_type <= 4:
                det["id_type"] = id_types[self.id_type]
        if self.self_id_desc:
            det["self_id_desc"] = self.self_id_desc
        return det


# ─── Simulator Instance ───────────────────────────────────────

class SimulatorInstance:
    """A single running (or stopped) simulator."""

    def __init__(self, sim_id: str, tenant_id: str, receiver_node_id: str,
                 name: str, num_drones: int, lat: float, lon: float,
                 hardware_type: str):
        self.id = sim_id
        self.tenant_id = tenant_id
        self.receiver_node_id = receiver_node_id
        self.name = name
        self.num_drones = num_drones
        self.lat = lat
        self.lon = lon
        self.hardware_type = hardware_type

        self.status = "stopped"
        self.started_at: float | None = None
        self.detections_sent = 0
        self.error: str | None = None

        self._drones: list[SimulatedDrone] = []
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    def to_dict(self) -> dict:
        uptime = 0
        if self.started_at and self.status == "running":
            uptime = int(time.time() - self.started_at)
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "numDrones": self.num_drones,
            "activeDrones": len(self._drones),
            "lat": self.lat,
            "lon": self.lon,
            "hardwareType": self.hardware_type,
            "receiverNodeId": self.receiver_node_id,
            "startedAt": self.started_at,
            "uptimeSeconds": uptime,
            "detectionsSent": self.detections_sent,
            "error": self.error,
        }


# ─── Simulation Manager ──────────────────────────────────────

class SimulationManager:
    """Manages multiple SimulatorInstance threads."""

    def __init__(self, app, registry):
        self._app = app
        self._registry = registry
        self._simulators: dict[str, SimulatorInstance] = {}
        self._lock = threading.Lock()
        logger.info("SimulationManager initialized")

    def list_simulators(self, tenant_id: str) -> list[dict]:
        with self._lock:
            return [
                s.to_dict() for s in self._simulators.values()
                if s.tenant_id == tenant_id
            ]

    def get_simulator(self, sim_id: str) -> dict | None:
        with self._lock:
            s = self._simulators.get(sim_id)
            return s.to_dict() if s else None

    def create_simulator(self, tenant_id: str, name: str, num_drones: int,
                         lat: float, lon: float, hardware_type: str) -> dict:
        """Create a simulator and its backing ReceiverNode in the DB."""
        sim_id = str(uuid.uuid4())[:8]

        # Create a ReceiverNode in the DB
        with self._app.app_context():
            from models import ReceiverNode
            from database import db

            node = ReceiverNode(
                tenant_id=tenant_id,
                name=f"[SIM] {name}",
                hardware_type=hardware_type,
                api_key=secrets.token_hex(32),
                firmware_version=FIRMWARE_VERSION,
            )
            db.session.add(node)
            db.session.commit()
            node_id = node.id
            logger.info("Created ReceiverNode %s for simulator %s", node_id, sim_id)

        instance = SimulatorInstance(
            sim_id=sim_id,
            tenant_id=tenant_id,
            receiver_node_id=node_id,
            name=name,
            num_drones=num_drones,
            lat=lat,
            lon=lon,
            hardware_type=hardware_type,
        )

        with self._lock:
            self._simulators[sim_id] = instance

        return instance.to_dict()

    def delete_simulator(self, sim_id: str) -> bool:
        with self._lock:
            instance = self._simulators.get(sim_id)
            if not instance:
                return False

        # Stop if running
        if instance.status == "running":
            self._stop_instance(instance)

        # Delete ReceiverNode from DB
        with self._app.app_context():
            from models import ReceiverNode
            from database import db
            node = db.session.get(ReceiverNode, instance.receiver_node_id)
            if node:
                db.session.delete(node)
                db.session.commit()
                logger.info("Deleted ReceiverNode %s", instance.receiver_node_id)

        with self._lock:
            self._simulators.pop(sim_id, None)

        return True

    def start_simulator(self, sim_id: str) -> dict | None:
        with self._lock:
            instance = self._simulators.get(sim_id)
            if not instance:
                return None
            if instance.status == "running":
                return instance.to_dict()

        # Create drones
        instance._drones = [
            SimulatedDrone(instance.lat, instance.lon)
            for _ in range(instance.num_drones)
        ]
        instance.status = "running"
        instance.started_at = time.time()
        instance.error = None
        instance._stop_event.clear()

        thread = threading.Thread(
            target=self._run_loop,
            args=(instance,),
            daemon=True,
            name=f"sim-{sim_id}",
        )
        instance._thread = thread
        thread.start()
        logger.info("Started simulator %s (%s, %d drones)", sim_id, instance.name, instance.num_drones)
        return instance.to_dict()

    def stop_simulator(self, sim_id: str) -> dict | None:
        with self._lock:
            instance = self._simulators.get(sim_id)
            if not instance:
                return None
        self._stop_instance(instance)
        return instance.to_dict()

    def stop_all(self, tenant_id: str | None = None):
        with self._lock:
            targets = [
                s for s in self._simulators.values()
                if s.status == "running" and (tenant_id is None or s.tenant_id == tenant_id)
            ]
        for s in targets:
            self._stop_instance(s)
        logger.info("Stopped %d simulators", len(targets))

    def _stop_instance(self, instance: SimulatorInstance):
        instance._stop_event.set()
        if instance._thread and instance._thread.is_alive():
            instance._thread.join(timeout=5)
        instance.status = "stopped"
        instance._thread = None
        logger.info("Stopped simulator %s", instance.id)

    def _run_loop(self, instance: SimulatorInstance):
        """Main simulation loop — runs in a daemon thread."""
        last_ingest = 0.0
        last_heartbeat = 0.0

        while not instance._stop_event.is_set():
            now = time.time()

            # Update drone positions
            for drone in instance._drones:
                drone.update(INGEST_INTERVAL_S)

            # Ingest every 2s
            if now - last_ingest >= INGEST_INTERVAL_S:
                last_ingest = now
                detections = [d.to_detection_dict() for d in instance._drones]
                try:
                    self._registry.receiver_provider.ingest(
                        tenant_id=instance.tenant_id,
                        node_id=instance.receiver_node_id,
                        node_lat=instance.lat,
                        node_lon=instance.lon,
                        detections=detections,
                    )
                    instance.detections_sent += len(detections)
                except Exception as e:
                    logger.error("Simulator %s ingest error: %s", instance.id, e)
                    instance.error = str(e)

            # Heartbeat every 30s — update ReceiverNode DB fields
            if now - last_heartbeat >= HEARTBEAT_INTERVAL_S:
                last_heartbeat = now
                try:
                    with self._app.app_context():
                        from models import ReceiverNode
                        from database import db
                        node = db.session.get(ReceiverNode, instance.receiver_node_id)
                        if node:
                            uptime = int(now - (instance.started_at or now))
                            node.last_heartbeat = now
                            node.firmware_version = FIRMWARE_VERSION
                            node.last_latitude = instance.lat
                            node.last_longitude = instance.lon
                            node.last_location_accuracy = 10.0
                            node.wifi_ssid = "Simulation"
                            node.wifi_rssi = random.randint(-65, -35)
                            node.free_heap = random.randint(120000, 180000)
                            node.uptime_seconds = uptime
                            node.detections_since_boot = instance.detections_sent
                            node.last_ip = "127.0.0.1"
                            db.session.commit()
                except Exception as e:
                    logger.error("Simulator %s heartbeat error: %s", instance.id, e)

            instance._stop_event.wait(timeout=0.1)
