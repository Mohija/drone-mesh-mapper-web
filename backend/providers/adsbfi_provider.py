"""
adsb.fi Provider - ADS-B tracking via community network.
API: https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{dist}
Rate limit: ~1 req/s
"""

import logging
import time

import requests

from providers.base_provider import BaseProvider

logger = logging.getLogger("providers.adsbfi")

ADSBFI_API = "https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{dist}"


class AdsbFiProvider(BaseProvider):
    source_id = "adsbfi"
    source_label = "adsb.fi"

    def __init__(self):
        super().__init__()
        self._cache_max_age = 10.0

    def _fetch(self, center_lat: float, center_lon: float, radius_m: float) -> list[dict]:
        dist_nm = max(1, radius_m / 1852)  # Convert meters to nautical miles

        url = ADSBFI_API.format(lat=center_lat, lon=center_lon, dist=int(dist_nm))
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()

        data = resp.json()
        # adsb.fi uses "aircraft" key (not "ac")
        aircraft = data.get("aircraft") or data.get("ac") or []

        results = []
        for ac in aircraft:
            lat = ac.get("lat")
            lon = ac.get("lon")
            if lat is None or lon is None:
                continue

            # Speed: ground speed in knots -> m/s
            gs = ac.get("gs") or 0
            speed_ms = gs * 0.514444

            # Altitude: barometric in feet -> meters (1 ft = 0.3048 m)
            alt_baro_ft = ac.get("alt_baro")
            if isinstance(alt_baro_ft, str):  # "ground" or similar
                alt_baro_ft = 0
            altitude_baro = (alt_baro_ft or 0) * 0.3048

            # Altitude: geometric (GPS) in feet -> meters
            alt_geom_ft = ac.get("alt_geom")
            altitude_geom = (alt_geom_ft or 0) * 0.3048 if alt_geom_ft else None

            name = (ac.get("flight") or ac.get("r") or ac.get("hex", "")).strip()

            results.append({
                "id": ac.get("hex", ""),
                "name": name or ac.get("hex", "unknown"),
                "latitude": lat,
                "longitude": lon,
                "altitude": round(altitude_baro, 1),
                "altitude_baro": round(altitude_baro, 1),
                "altitude_geom": round(altitude_geom, 1) if altitude_geom is not None else None,
                "speed": round(speed_ms, 1),
                "signal_strength": ac.get("rssi"),
                "status": "active" if speed_ms > 1 else "idle",
                "basic_id": ac.get("hex", ""),
                "last_update": ac.get("seen_pos", time.time()),
                "flight_pattern": ac.get("type", "unknown"),
            })

        logger.info("adsb.fi returned %d aircraft", len(results))
        return results
