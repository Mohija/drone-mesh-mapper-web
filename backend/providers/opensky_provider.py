"""
OpenSky Network Provider - ADS-B aircraft and UAV data.
API: https://opensky-network.org/api/states/all
Rate limit: 400 credits/day (anonymous)
"""

import logging
import math
import time

import requests

from providers.base_provider import BaseProvider

logger = logging.getLogger("providers.opensky")

OPENSKY_API = "https://opensky-network.org/api/states/all"


class OpenSkyProvider(BaseProvider):
    source_id = "opensky"
    source_label = "OpenSky Network"

    def __init__(self):
        super().__init__()
        self._cache_max_age = 15.0  # OpenSky updates every 10-15s
        self._credit_count = 0
        self._credit_reset_time = time.time()

    def _check_credits(self) -> bool:
        """Check if we have API credits remaining (400/day)."""
        if time.time() - self._credit_reset_time > 86400:
            self._credit_count = 0
            self._credit_reset_time = time.time()
        return self._credit_count < 380  # Leave some margin

    def _fetch(self, center_lat: float, center_lon: float, radius_m: float) -> list[dict]:
        if not self._check_credits():
            logger.warning("OpenSky daily credit limit approaching, skipping fetch")
            return []

        # Calculate bounding box from center + radius
        lat_offset = radius_m / 111320
        lon_offset = radius_m / (111320 * math.cos(math.radians(center_lat)))

        params = {
            "lamin": center_lat - lat_offset,
            "lamax": center_lat + lat_offset,
            "lomin": center_lon - lon_offset,
            "lomax": center_lon + lon_offset,
        }

        resp = requests.get(OPENSKY_API, params=params, timeout=10)
        resp.raise_for_status()
        self._credit_count += 1

        data = resp.json()
        states = data.get("states") or []

        results = []
        for s in states:
            if s[5] is None or s[6] is None:
                continue  # Skip entries without position
            results.append({
                "id": s[0],  # icao24
                "name": (s[1] or s[0]).strip(),  # callsign or icao24
                "latitude": s[6],
                "longitude": s[5],
                "altitude": s[7] or s[13] or 0,  # baro_altitude or geo_altitude
                "speed": s[9] or 0,  # velocity in m/s
                "status": "idle" if s[8] else "active",  # on_ground
                "basic_id": s[0],
                "last_update": s[3] or time.time(),  # time_position
                "flight_pattern": "unknown",
            })

        logger.info("OpenSky returned %d aircraft (credits used: %d)", len(results), self._credit_count)
        return results
