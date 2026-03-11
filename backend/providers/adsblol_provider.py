"""
adsb.lol Provider - ADS-B tracking via community network.
API: https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{dist}
Rate limit: ~1 req/s
Same format as adsb.fi.
"""

import logging
import time

import requests

from providers.base_provider import BaseProvider

logger = logging.getLogger("providers.adsblol")

ADSBLOL_API = "https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{dist}"


class AdsbLolProvider(BaseProvider):
    source_id = "adsblol"
    source_label = "adsb.lol"

    def __init__(self):
        super().__init__()
        self._cache_max_age = 10.0

    def _fetch(self, center_lat: float, center_lon: float, radius_m: float) -> list[dict]:
        dist_nm = max(1, radius_m / 1852)

        url = ADSBLOL_API.format(lat=center_lat, lon=center_lon, dist=int(dist_nm))
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()

        data = resp.json()
        aircraft = data.get("ac") or []

        results = []
        for ac in aircraft:
            lat = ac.get("lat")
            lon = ac.get("lon")
            if lat is None or lon is None:
                continue

            gs = ac.get("gs") or 0
            speed_ms = gs * 0.5144

            alt_ft = ac.get("alt_baro")
            if isinstance(alt_ft, str):
                alt_ft = 0
            altitude = (alt_ft or 0) / 3.281

            name = (ac.get("flight") or ac.get("r") or ac.get("hex", "")).strip()

            results.append({
                "id": ac.get("hex", ""),
                "name": name or ac.get("hex", "unknown"),
                "latitude": lat,
                "longitude": lon,
                "altitude": round(altitude, 1),
                "speed": round(speed_ms, 1),
                "signal_strength": ac.get("rssi"),
                "status": "active" if speed_ms > 1 else "idle",
                "basic_id": ac.get("hex", ""),
                "last_update": ac.get("seen_pos", time.time()),
                "flight_pattern": ac.get("type", "unknown"),
            })

        logger.info("adsb.lol returned %d aircraft", len(results))
        return results
