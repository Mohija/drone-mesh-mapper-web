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

            ogn_id = parts[13] if len(parts) > 13 else parts[3]

            results.append({
                "id": ogn_id,
                "name": name,
                "latitude": lat,
                "longitude": lon,
                "altitude": round(altitude, 1),
                "speed": round(speed_ms, 1),
                "status": "active" if speed_ms > 1 else "idle",
                "basic_id": ogn_id,
                "last_update": time.time(),
                "flight_pattern": "glider",
            })

        logger.info("OGN returned %d aircraft", len(results))
        return results
