#!/usr/bin/env python3
"""
FlightArc Dummy Receiver — Simuliert einen Hardware-Empfänger (ESP32/ESP8266).

Exakt gleiche Logik wie die kompilierte Firmware:
  - Alle 2 Sekunden: Ingest (Drohnen-Detections senden)
  - Alle 30 Sekunden: Heartbeat (Status senden)
  - Gleiche JSON-Payloads, gleiche Header (X-Node-Key)
  - Simulierte Drohnen mit realistischer Bewegung

Verwendung:
  python3 dummy_receiver.py --url http://localhost:3020 --key <API_KEY>

  Oder mit Umgebungsvariablen:
    BACKEND_URL=http://localhost:3020
    API_KEY=<64-char-hex>
"""

import argparse
import json
import math
import os
import random
import string
import sys
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

try:
    import requests
except ImportError:
    print("Fehler: 'requests' Paket nicht installiert.")
    print("  pip install requests")
    sys.exit(1)


# ─── Constants (matching firmware config.h) ────────────────────

INGEST_INTERVAL_S = 2       # Send detections every 2 seconds
HEARTBEAT_INTERVAL_S = 30   # Send heartbeat every 30 seconds
MAX_DETECTIONS = 50         # Ring buffer size
FIRMWARE_VERSION = "1.0.0-dummy"
AP_SSID_PREFIX = "FlightArc-"

# Pre-configured dummy API key (matching the "Dummy Simulator" receiver in the DB)
DUMMY_API_KEY = "dummy_receiver_test_key_0000000000000000000000000000000000000000"


# ─── Detection Source (matching firmware enum) ─────────────────

class Source(Enum):
    WIFI_BEACON = "wifi_beacon"
    WIFI_NAN = "wifi_nan"
    BLE = "ble"


# ─── ODID Detection (matching firmware OdidDetection struct) ───

@dataclass
class OdidDetection:
    # Basic ID
    basic_id: str = ""
    id_type: int = 0          # 0=None, 1=Serial, 2=CAA, 3=UTM, 4=SpecificSession

    # Location
    lat: float = 0.0
    lon: float = 0.0
    alt: float = 0.0          # Altitude MSL
    height_agl: float = 0.0   # Height above ground
    speed: float = 0.0
    heading: float = -1.0

    # System (Operator/Pilot position)
    pilot_lat: float = 0.0
    pilot_lon: float = 0.0

    # Operator ID
    operator_id: str = ""

    # Self ID
    self_id_desc: str = ""

    # Meta
    rssi: int = -70
    mac: str = ""
    timestamp: float = 0.0
    valid: bool = True
    source: Source = Source.WIFI_BEACON

    def to_dict(self) -> dict:
        """Serialize to JSON matching firmware http_client.cpp sendIngest()."""
        det = {
            "basic_id": self.basic_id,
            "lat": round(self.lat, 7),
            "lon": round(self.lon, 7),
            "alt": round(self.alt, 1),
            "speed": round(self.speed, 1),
            "rssi": self.rssi,
            "source": self.source.value,
        }
        # Conditional fields (matching firmware logic)
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


# ─── Flight Patterns ──────────────────────────────────────

FLIGHT_PATTERNS = [
    "orbit",       # Kreisflug (Inspektion, Überwachung)
    "linear",      # Geradeausflug mit Umkehr (Lieferung, Pendeln)
    "survey",      # Rasenmäher-Muster (Kartierung)
    "hover",       # Schweben (Foto/Video)
    "figure8",     # Achter-Figur (Racing, Training)
    "spiral",      # Spirale (Suchflug)
]


# ─── Simulated Drone (generates realistic movement) ───────────

@dataclass
class SimulatedDrone:
    basic_id: str
    id_type: int
    operator_id: str
    self_id_desc: str
    mac: str
    source: Source

    # Position & flight parameters
    lat: float = 0.0
    lon: float = 0.0
    alt: float = 100.0
    speed: float = 10.0
    heading: float = 0.0
    height_agl: float = 80.0

    # Pilot position (stays fixed)
    pilot_lat: float = 0.0
    pilot_lon: float = 0.0

    # Flight pattern
    pattern: str = ""

    # Internal state (set in __post_init__)
    _home_lat: float = 0.0
    _home_lon: float = 0.0
    _t: float = 0.0
    _speed_base: float = 10.0
    _alt_base: float = 100.0
    _alt_variation: float = 20.0
    _orbit_radius: float = 0.002
    _orbit_speed: float = 0.05
    _linear_heading: float = 0.0
    _linear_length: float = 0.01
    _linear_speed: float = 0.0005
    _survey_width: float = 0.004
    _survey_length: float = 0.005
    _survey_lanes: int = 6
    _survey_speed: float = 0.0004
    _hover_drift: float = 0.00005
    _fig8_radius: float = 0.002
    _fig8_speed: float = 0.06
    _spiral_max_r: float = 0.004
    _spiral_expand_rate: float = 0.0001
    _spiral_r: float = 0.0008
    _spiral_growing: bool = True

    def __post_init__(self):
        self._home_lat = self.lat
        self._home_lon = self.lon
        self._t = random.uniform(0, 100)
        self._alt_base = random.uniform(60, 160)
        self._alt_variation = random.uniform(5, 30)

        if not self.pattern:
            self.pattern = random.choice(FLIGHT_PATTERNS)

        # Randomize pattern-specific params
        self._orbit_radius = random.uniform(0.001, 0.004)
        self._orbit_speed = random.uniform(0.02, 0.08)
        self._speed_base = random.uniform(5, 25)
        self._linear_heading = random.uniform(0, 360)
        self._linear_length = random.uniform(0.005, 0.015)
        self._linear_speed = random.uniform(0.0003, 0.001)
        self._survey_width = random.uniform(0.002, 0.006)
        self._survey_length = random.uniform(0.003, 0.008)
        self._survey_lanes = random.randint(4, 10)
        self._survey_speed = random.uniform(0.0002, 0.0006)
        self._hover_drift = random.uniform(0.00002, 0.0001)
        self._fig8_radius = random.uniform(0.001, 0.003)
        self._fig8_speed = random.uniform(0.03, 0.1)
        self._spiral_max_r = random.uniform(0.002, 0.006)
        self._spiral_expand_rate = random.uniform(0.00005, 0.0002)
        self._spiral_r = random.uniform(0.0005, 0.001)

    def update(self, dt: float):
        """Update position based on elapsed time using assigned flight pattern."""
        self._t += dt
        handler = getattr(self, f"_update_{self.pattern}", self._update_orbit)
        handler(dt)

    def _update_orbit(self, dt: float):
        angle = self._t * self._orbit_speed
        self.lat = self._home_lat + self._orbit_radius * math.sin(angle) + random.gauss(0, 0.00003)
        self.lon = self._home_lon + self._orbit_radius * math.cos(angle) + random.gauss(0, 0.00003)
        self.heading = (math.degrees(angle) + 90) % 360
        self.speed = max(1, self._speed_base + random.gauss(0, 1.5))
        self.alt = self._alt_base + self._alt_variation * math.sin(angle * 0.3)
        self.height_agl = self.alt - 20 + random.gauss(0, 1)

    def _update_linear(self, dt: float):
        progress = (self._t * self._linear_speed) % 2.0
        if progress > 1.0:
            progress = 2.0 - progress
        heading_rad = math.radians(self._linear_heading)
        self.lat = self._home_lat + progress * self._linear_length * math.cos(heading_rad) + random.gauss(0, 0.00003)
        self.lon = self._home_lon + progress * self._linear_length * math.sin(heading_rad) + random.gauss(0, 0.00003)
        raw = (self._t * self._linear_speed) % 2.0
        self.heading = (self._linear_heading + 180) % 360 if raw > 1.0 else self._linear_heading
        turn_factor = 1.0 - abs(progress - 0.5) * 2.0
        self.speed = max(2, self._speed_base * (0.3 + 0.7 * turn_factor) + random.gauss(0, 1))
        self.alt = self._alt_base + random.gauss(0, 2)
        self.height_agl = self.alt - 20 + random.gauss(0, 1)

    def _update_survey(self, dt: float):
        progress = (self._t * self._survey_speed) % 1.0
        total = progress * self._survey_lanes * 2
        lane = int(total)
        lane_p = total - lane
        base_rad = math.radians(self._linear_heading)
        perp_rad = base_rad + math.pi / 2
        along = ((lane_p - 0.5) if lane % 2 == 0 else (0.5 - lane_p)) * self._survey_length
        self.heading = self._linear_heading if lane % 2 == 0 else (self._linear_heading + 180) % 360
        cross = (lane / (self._survey_lanes * 2)) * self._survey_width - self._survey_width / 2
        self.lat = self._home_lat + along * math.cos(base_rad) + cross * math.cos(perp_rad) + random.gauss(0, 0.00002)
        self.lon = self._home_lon + along * math.sin(base_rad) + cross * math.sin(perp_rad) + random.gauss(0, 0.00002)
        self.speed = max(2, self._speed_base * 0.6 + random.gauss(0, 0.5))
        self.alt = self._alt_base + random.gauss(0, 1)
        self.height_agl = self.alt - 20 + random.gauss(0, 0.5)

    def _update_hover(self, dt: float):
        self.lat = self._home_lat + math.sin(self._t * 0.1) * self._hover_drift + random.gauss(0, 0.00001)
        self.lon = self._home_lon + math.cos(self._t * 0.13) * self._hover_drift + random.gauss(0, 0.00001)
        self.heading = (self.heading + random.gauss(0, 3)) % 360
        self.speed = max(0, random.gauss(0.5, 0.5))
        self.alt = self._alt_base + math.sin(self._t * 0.05) * 2 + random.gauss(0, 0.3)
        self.height_agl = self.alt - 20 + random.gauss(0, 0.3)

    def _update_figure8(self, dt: float):
        angle = self._t * self._fig8_speed
        denom = 1 + math.sin(angle) ** 2
        x = self._fig8_radius * math.cos(angle) / denom
        y = self._fig8_radius * math.sin(angle) * math.cos(angle) / denom
        self.lat = self._home_lat + x + random.gauss(0, 0.00002)
        self.lon = self._home_lon + y + random.gauss(0, 0.00002)
        dx = -self._fig8_radius * math.sin(angle) / denom
        dy = self._fig8_radius * math.cos(2 * angle) / denom
        self.heading = math.degrees(math.atan2(dy, dx)) % 360
        self.speed = max(3, self._speed_base * 1.3 + random.gauss(0, 3))
        self.alt = self._alt_base + 10 * math.sin(angle * 0.5) + random.gauss(0, 2)
        self.height_agl = self.alt - 20 + random.gauss(0, 1)

    def _update_spiral(self, dt: float):
        angle = self._t * self._orbit_speed
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
        radius_factor = self._spiral_r / self._spiral_max_r
        self.speed = max(2, self._speed_base * (0.4 + 0.6 * radius_factor) + random.gauss(0, 1))
        self.alt = self._alt_base + 15 * math.sin(self._t * 0.01) + random.gauss(0, 1)
        self.height_agl = self.alt - 20 + random.gauss(0, 1)

    def to_detection(self) -> OdidDetection:
        """Create an OdidDetection from current state."""
        return OdidDetection(
            basic_id=self.basic_id,
            id_type=self.id_type,
            lat=self.lat,
            lon=self.lon,
            alt=self.alt,
            height_agl=self.height_agl,
            speed=self.speed,
            heading=self.heading,
            pilot_lat=self.pilot_lat,
            pilot_lon=self.pilot_lon,
            operator_id=self.operator_id,
            self_id_desc=self.self_id_desc,
            rssi=random.randint(-85, -45),
            mac=self.mac,
            timestamp=time.time(),
            valid=True,
            source=self.source,
        )


# ─── HTTP Client (matching firmware FlightArcClient) ──────────

class FlightArcClient:
    def __init__(self, backend_url: str, api_key: str):
        # Remove trailing slash (matching firmware)
        self._url = backend_url.rstrip("/")
        self._api_key = api_key
        self._retry_count = 0
        self._last_http_code = 0
        self._last_success = False

    @property
    def is_backend_reachable(self) -> bool:
        return self._last_success

    def send_ingest(self, detections: list[OdidDetection],
                    node_lat: float = 0.0, node_lon: float = 0.0) -> bool:
        """POST /api/receivers/ingest — matching firmware sendIngest()."""
        if not detections:
            return True

        payload: dict = {}
        if node_lat != 0.0 or node_lon != 0.0:
            payload["node_lat"] = node_lat
            payload["node_lon"] = node_lon

        payload["detections"] = [d.to_dict() for d in detections]

        ok = self._http_post("/api/receivers/ingest", payload)
        if ok:
            print(f"  [HTTP] Ingested {len(detections)} detections")
        return ok

    def send_heartbeat(self, fw_version: str, hw_type: str,
                       wifi_ssid: str, wifi_rssi: int, wifi_channel: int,
                       free_heap: int, uptime_seconds: int,
                       detections_since_boot: int, ap_active: bool,
                       lat: float = 0.0, lon: float = 0.0,
                       accuracy: float = 0.0) -> bool:
        """POST /api/receivers/heartbeat — matching firmware sendHeartbeat()."""
        payload = {
            "firmware_version": fw_version,
            "hardware_type": hw_type,
            "wifi_ssid": wifi_ssid,
            "wifi_rssi": wifi_rssi,
            "wifi_channel": wifi_channel,
            "free_heap": free_heap,
            "uptime_seconds": uptime_seconds,
            "detections_since_boot": detections_since_boot,
            "ap_active": ap_active,
        }

        # Error stats (matching firmware)
        if self._retry_count > 0:
            payload["error_count"] = self._retry_count
            payload["last_http_code"] = self._last_http_code

        if lat != 0.0 or lon != 0.0:
            payload["latitude"] = lat
            payload["longitude"] = lon
            if accuracy > 0:
                payload["accuracy"] = accuracy

        return self._http_post("/api/receivers/heartbeat", payload)

    def _http_post(self, path: str, payload: dict) -> bool:
        """HTTP POST with JSON — matching firmware _httpPost()."""
        url = self._url + path
        headers = {
            "Content-Type": "application/json",
            "X-Node-Key": self._api_key,
        }

        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
            self._last_http_code = resp.status_code
            self._last_success = 200 <= resp.status_code < 300

            if not self._last_success:
                self._retry_count += 1
                print(f"  [HTTP] POST {path} failed: {resp.status_code} (retry {self._retry_count})")
                try:
                    err = resp.json()
                    print(f"         {err}")
                except Exception:
                    pass
            else:
                self._retry_count = 0

            return self._last_success
        except requests.exceptions.ConnectionError:
            self._retry_count += 1
            self._last_http_code = 0
            self._last_success = False
            print(f"  [HTTP] Connection refused: {url} (retry {self._retry_count})")
            return False
        except requests.exceptions.Timeout:
            self._retry_count += 1
            self._last_http_code = 0
            self._last_success = False
            print(f"  [HTTP] Timeout: {url} (retry {self._retry_count})")
            return False


# ─── Drone Scenario Generator ─────────────────────────────────

def random_mac() -> str:
    """Generate a random MAC address."""
    octets = [random.randint(0, 255) for _ in range(6)]
    octets[0] = octets[0] & 0xFE  # Unicast
    return ":".join(f"{o:02x}" for o in octets)


def random_serial() -> str:
    """Generate a realistic drone serial number."""
    prefixes = ["1581F", "3SQK9", "4A2DX", "7RW8L", "9NKJ3"]
    prefix = random.choice(prefixes)
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=15))
    return (prefix + suffix)[:20]


def create_drone_scenario(center_lat: float, center_lon: float,
                          num_drones: int) -> list[SimulatedDrone]:
    """Create a set of simulated drones around a center point."""

    drone_types = [
        {"desc": "DJI Mavic 3 Pro", "speed_range": (8, 20)},
        {"desc": "DJI Mini 4 Pro", "speed_range": (5, 15)},
        {"desc": "Autel EVO II", "speed_range": (10, 22)},
        {"desc": "Skydio 2+", "speed_range": (6, 18)},
        {"desc": "DJI Air 3", "speed_range": (7, 19)},
        {"desc": "Parrot Anafi", "speed_range": (5, 14)},
        {"desc": "DJI Matrice 350", "speed_range": (10, 25)},
        {"desc": "Freefly Astro", "speed_range": (8, 16)},
    ]

    sources = [Source.WIFI_BEACON, Source.WIFI_NAN, Source.BLE]
    source_weights = [0.5, 0.2, 0.3]  # WiFi Beacon most common

    drones = []
    for i in range(num_drones):
        drone_type = random.choice(drone_types)
        source = random.choices(sources, weights=source_weights, k=1)[0]

        # Spread drones around center with some randomness
        offset_lat = random.uniform(-0.005, 0.005)
        offset_lon = random.uniform(-0.005, 0.005)

        # Pilot stays near launch point
        pilot_offset_lat = random.uniform(-0.001, 0.001)
        pilot_offset_lon = random.uniform(-0.001, 0.001)

        drone = SimulatedDrone(
            basic_id=random_serial(),
            id_type=random.choice([1, 1, 1, 2, 3]),  # Mostly serial
            operator_id=f"DEU-{random.randint(10000, 99999)}",
            self_id_desc=drone_type["desc"][:23],
            mac=random_mac(),
            source=source,
            lat=center_lat + offset_lat,
            lon=center_lon + offset_lon,
            alt=random.uniform(50, 200),
            speed=random.uniform(*drone_type["speed_range"]),
            heading=random.uniform(0, 360),
            height_agl=random.uniform(30, 150),
            pilot_lat=center_lat + offset_lat + pilot_offset_lat,
            pilot_lon=center_lon + offset_lon + pilot_offset_lon,
        )
        drones.append(drone)

    return drones


# ─── Main Loop (matching firmware main.cpp) ────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="FlightArc Dummy Receiver — Simuliert einen Hardware-Empfänger",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Beispiele:
  %(prog)s --url http://localhost:3020 --key abc123...
  %(prog)s --url http://localhost:3020 --key abc123... --drones 5 --hardware esp32-s3
  %(prog)s --url http://localhost:3020 --key abc123... --lat 50.037 --lon 8.562
        """,
    )
    parser.add_argument("--url", default=os.environ.get("BACKEND_URL", "http://localhost:3020"),
                        help="Backend-URL (default: $BACKEND_URL oder http://localhost:3020)")
    parser.add_argument("--key", default=os.environ.get("API_KEY", DUMMY_API_KEY),
                        help="API-Key des Empfängers (default: vorkonfigurierter Dummy-Key)")
    parser.add_argument("--hardware", default="esp32-s3",
                        choices=["esp32-s3", "esp32-c3", "esp8266"],
                        help="Simulierter Hardware-Typ (default: esp32-s3)")
    parser.add_argument("--name", default="Dummy-Node",
                        help="Node-Name (default: Dummy-Node)")
    parser.add_argument("--drones", type=int, default=3,
                        help="Anzahl simulierter Drohnen (default: 3)")
    parser.add_argument("--lat", type=float, default=52.0302,
                        help="Empfänger-Breitengrad (default: 52.0302 / Bielefeld)")
    parser.add_argument("--lon", type=float, default=8.5325,
                        help="Empfänger-Längengrad (default: 8.5325 / Bielefeld)")
    parser.add_argument("--disappear", action="store_true",
                        help="Drohnen verschwinden und tauchen zufällig wieder auf")

    args = parser.parse_args()

    if not args.key:
        print("Fehler: API-Key erforderlich!")
        print("  Erstelle einen Empfänger in der Admin-UI und kopiere den API-Key.")
        print("  Oder nutze den vorkonfigurierten Dummy (Receiver 'Dummy Simulator' muss in DB existieren).")
        sys.exit(1)

    # ── Setup (matching firmware setup()) ──

    print()
    print("================================")
    print(f"FlightArc Dummy Receiver v{FIRMWARE_VERSION}")
    print(f"Hardware: {args.hardware} (simuliert)")
    if args.hardware in ("esp32-s3", "esp32-c3"):
        print("BLE: enabled (simuliert)")
    else:
        print("BLE: disabled")
    print("TLS: enabled" if args.url.startswith("https") else "TLS: disabled")
    print("================================")
    print()

    # HTTP Client
    client = FlightArcClient(args.url, args.key)
    print(f"[HTTP] Backend: {args.url}")

    # Create simulated drones
    drones = create_drone_scenario(args.lat, args.lon, args.drones)
    print(f"[Scanner] {len(drones)} simulierte Drohnen erstellt:")
    for d in drones:
        print(f"  - {d.basic_id} ({d.self_id_desc}) via {d.source.value} [{d.pattern}]")

    # Node location
    node_lat = args.lat
    node_lon = args.lon
    print(f"[GPS] Node-Position: {node_lat:.4f}, {node_lon:.4f}")
    print()
    print("[Main] Setup complete — Starte Loop (Ctrl+C zum Beenden)")
    print()

    # ── Loop variables (matching firmware) ──

    detections_since_boot = 0
    start_time = time.time()
    last_ingest = 0.0
    last_heartbeat = 0.0
    active_drones = set(range(len(drones)))  # All drones active initially

    try:
        while True:
            now = time.time()
            uptime = now - start_time

            # ── Scanner loop: update drone positions ──
            dt = INGEST_INTERVAL_S  # Simulate time step
            for i in active_drones:
                drones[i].update(dt)

            # ── Disappear/reappear logic ──
            if args.disappear and random.random() < 0.05:  # 5% chance per cycle
                if active_drones and random.random() < 0.5:
                    # Remove a drone
                    drone_idx = random.choice(list(active_drones))
                    active_drones.discard(drone_idx)
                    print(f"  [Scanner] Drohne verschwunden: {drones[drone_idx].basic_id}")
                elif len(active_drones) < len(drones):
                    # Re-add a drone
                    inactive = set(range(len(drones))) - active_drones
                    drone_idx = random.choice(list(inactive))
                    active_drones.add(drone_idx)
                    print(f"  [Scanner] Drohne wieder erkannt: {drones[drone_idx].basic_id}")

            # ── Send detections every INGEST_INTERVAL_S (matching firmware) ──
            if now - last_ingest >= INGEST_INTERVAL_S:
                last_ingest = now

                # Get detections from active drones
                detections = [drones[i].to_detection() for i in sorted(active_drones)]

                if detections:
                    if client.send_ingest(detections, node_lat, node_lon):
                        detections_since_boot += len(detections)

            # ── Send heartbeat every HEARTBEAT_INTERVAL_S (matching firmware) ──
            if now - last_heartbeat >= HEARTBEAT_INTERVAL_S:
                last_heartbeat = now

                # Simulate ESP32 system stats
                free_heap = random.randint(120000, 180000)  # ~150KB typical
                wifi_rssi = random.randint(-65, -35)
                wifi_channel = random.choice([1, 6, 11])

                ok = client.send_heartbeat(
                    fw_version=FIRMWARE_VERSION,
                    hw_type=args.hardware,
                    wifi_ssid="SimulatedWiFi",
                    wifi_rssi=wifi_rssi,
                    wifi_channel=wifi_channel,
                    free_heap=free_heap,
                    uptime_seconds=int(uptime),
                    detections_since_boot=detections_since_boot,
                    ap_active=False,
                    lat=node_lat,
                    lon=node_lon,
                    accuracy=10.0,
                )
                if ok:
                    print(f"  [Heartbeat] uptime={int(uptime)}s detections={detections_since_boot} "
                          f"heap={free_heap} rssi={wifi_rssi}dBm")

            # Small yield (matching firmware delay(1))
            time.sleep(0.1)

    except KeyboardInterrupt:
        print()
        print(f"[Main] Beendet. Laufzeit: {int(time.time() - start_time)}s, "
              f"Detections: {detections_since_boot}")


# Fix string reference
def _fix():
    pass

if __name__ == "__main__":
    main()
