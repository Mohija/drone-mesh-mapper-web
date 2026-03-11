"""
Simulator Provider - Wraps existing DroneFleet simulation.
"""

from providers.base_provider import BaseProvider


class SimulatorProvider(BaseProvider):
    source_id = "simulator"
    source_label = "Simulator"

    def __init__(self, fleet):
        super().__init__()
        self.fleet = fleet
        self._cache_max_age = 1.0  # Short cache, fleet updates every 2s

    def _fetch(self, center_lat: float, center_lon: float, radius_m: float) -> list[dict]:
        if radius_m <= 0:
            drones = self.fleet.get_all_drones()
        else:
            drones = self.fleet.get_drones_in_radius(center_lat, center_lon, radius_m)
        for d in drones:
            d["source"] = self.source_id
            d["source_label"] = self.source_label
        return drones

    def _normalize(self, raw: dict) -> dict:
        """Simulator drones are already fully populated, just add source."""
        raw.setdefault("source", self.source_id)
        raw.setdefault("source_label", self.source_label)
        return raw

    def get_drone(self, drone_id: str) -> dict | None:
        drone = self.fleet.get_drone(drone_id)
        if drone:
            drone["source"] = self.source_id
            drone["source_label"] = self.source_label
        return drone

    def get_drone_history(self, drone_id: str) -> list[dict] | None:
        return self.fleet.get_drone_history(drone_id)
