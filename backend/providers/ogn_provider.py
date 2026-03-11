"""
Open Glider Network (OGN) Provider - Gliders and small aircraft.
API: https://live.glidernet.org/lxml.php (XML, bounding box query)
Returns XML with <m a="lat,lon,cn,call,alt,time,?,speed,track,vario,..."/> markers.
"""

import logging
import math
import time
import xml.etree.ElementTree as ET

import requests

from providers.base_provider import BaseProvider

logger = logging.getLogger("providers.ogn")

OGN_API = "https://live.glidernet.org/lxml.php"

# OGN aircraft type codes (field index 10)
OGN_AIRCRAFT_TYPES = {
    0: "Unknown",
    1: "Segelflugzeug",
    2: "Schleppflugzeug",
    3: "Helikopter",
    4: "Fallschirmspringer",
    5: "Absetzflugzeug",
    6: "Hängegleiter",
    7: "Gleitschirm",
    8: "Motorflugzeug",
    9: "Jet / Mehrmotorig",
    10: "Unbekannt",
    11: "Ballon",
    12: "Luftschiff",
    13: "UAV / Drohne",
    14: "Bodenstation",
    15: "Sonstiges",
}


class OgnProvider(BaseProvider):
    source_id = "ogn"
    source_label = "Open Glider Network"

    def __init__(self):
        super().__init__()
        self._cache_max_age = 10.0

    def _fetch(self, center_lat: float, center_lon: float, radius_m: float) -> list[dict]:
        lat_offset = radius_m / 111320
        lon_offset = radius_m / (111320 * math.cos(math.radians(center_lat)))

        params = {
            "a": 1,                           # all
            "b": center_lat + lat_offset,      # lat_max
            "c": center_lat - lat_offset,      # lat_min
            "d": center_lon + lon_offset,      # lon_max
            "e": center_lon - lon_offset,      # lon_min
        }

        resp = requests.get(OGN_API, params=params, timeout=10, headers={
            "User-Agent": "drone-mesh-mapper/1.0",
            "Referer": "https://live.glidernet.org/",
        })
        resp.raise_for_status()

        root = ET.fromstring(resp.text)
        markers = root.findall(".//m")

        results = []
        for marker in markers:
            raw = marker.get("a", "")
            parts = raw.split(",")
            if len(parts) < 10:
                continue

            try:
                lat = float(parts[0])
                lon = float(parts[1])
            except (ValueError, IndexError):
                continue

            cn = parts[2]          # competition number / short name
            call = parts[3]        # callsign or device ID
            name = call if not call.startswith("_") else cn

            try:
                altitude = float(parts[4])  # meters
            except ValueError:
                altitude = 0.0

            try:
                speed_kmh = float(parts[7])
                speed_ms = speed_kmh / 3.6
            except (ValueError, IndexError):
                speed_ms = 0.0

            # Aircraft type code (field 10)
            try:
                aircraft_type_code = int(parts[10]) if len(parts) > 10 else 0
            except ValueError:
                aircraft_type_code = 0

            # ICAO hex code from Mode-S transponder (field 12), "0" means no transponder
            icao_hex = parts[12] if len(parts) > 12 and parts[12] != "0" else None

            ogn_id = parts[13] if len(parts) > 13 else parts[3]

            drone = {
                "id": ogn_id,
                "name": name,
                "latitude": lat,
                "longitude": lon,
                "altitude": round(altitude, 1),
                "altitude_baro": None,  # OGN has no barometric altitude
                "altitude_geom": round(altitude, 1),  # OGN altitude is GPS-based (AMSL)
                "speed": round(speed_ms, 1),
                "status": "active" if speed_ms > 1 else "idle",
                "basic_id": ogn_id,
                "last_update": time.time(),
                "flight_pattern": "glider",
                "ogn_aircraft_type": aircraft_type_code,
                "ogn_aircraft_type_label": OGN_AIRCRAFT_TYPES.get(aircraft_type_code, "Unbekannt"),
            }

            if icao_hex:
                drone["icao_hex"] = icao_hex

            results.append(drone)

        logger.info("OGN returned %d aircraft", len(results))
        return results
