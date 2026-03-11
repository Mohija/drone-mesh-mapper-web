"""
Abstract base class for drone data providers.
Provides caching, error handling, and data normalization.
"""

import logging
import time
from abc import ABC, abstractmethod

logger = logging.getLogger("providers")


class BaseProvider(ABC):
    """Abstract base class for all drone data providers."""

    source_id: str = ""
    source_label: str = ""

    def __init__(self):
        self._cache: list[dict] = []
        self._cache_time: float = 0
        self._cache_max_age: float = 10.0
        self._cache_params: tuple = ()

    def _is_cache_valid(self, params: tuple) -> bool:
        return (
            (time.time() - self._cache_time) < self._cache_max_age
            and self._cache_params == params
        )

    @abstractmethod
    def _fetch(self, center_lat: float, center_lon: float, radius_m: float) -> list[dict]:
        """Fetch raw drone data. Subclasses implement this."""
        ...

    def fetch_drones(self, center_lat: float, center_lon: float, radius_m: float) -> list[dict]:
        """Fetch drones with caching and error handling."""
        # radius=0 means "no filter" — keep it distinct from small positive radii
        radius_key = 0 if radius_m <= 0 else max(round(radius_m, -2), 100)
        params = (round(center_lat, 2), round(center_lon, 2), radius_key)
        if self._is_cache_valid(params) and self._cache:
            return self._cache

        try:
            raw = self._fetch(center_lat, center_lon, radius_m)
            normalized = [self._normalize(d) for d in raw]
            self._cache = normalized
            self._cache_time = time.time()
            self._cache_params = params
            return normalized
        except Exception:
            logger.exception("Provider %s fetch failed", self.source_id)
            return self._cache if self._cache else []

    def get_drone(self, drone_id: str) -> dict | None:
        """Find a drone by its original ID in cache."""
        for d in self._cache:
            if d.get("basic_id") == drone_id or d.get("id") == drone_id:
                return d
        return None

    def get_drone_history(self, drone_id: str) -> list[dict] | None:
        """Get history for a drone. Only simulator has real history."""
        return []

    def _normalize(self, raw: dict) -> dict:
        """Fill in missing fields with defaults and add source info."""
        return {
            "id": raw.get("id", "unknown"),
            "mac": raw.get("mac"),
            "name": raw.get("name", "Unknown"),
            "latitude": raw.get("latitude", 0.0),
            "longitude": raw.get("longitude", 0.0),
            "altitude": raw.get("altitude", 0.0),
            "pilot_latitude": raw.get("pilot_latitude"),
            "pilot_longitude": raw.get("pilot_longitude"),
            "signal_strength": raw.get("signal_strength"),
            "battery": raw.get("battery"),
            "speed": raw.get("speed", 0.0),
            "status": raw.get("status", "active"),
            "flight_pattern": raw.get("flight_pattern", "unknown"),
            "basic_id": raw.get("basic_id", raw.get("id", "unknown")),
            "faa_data": raw.get("faa_data"),
            "last_update": raw.get("last_update", time.time()),
            "source": self.source_id,
            "source_label": self.source_label,
        }
