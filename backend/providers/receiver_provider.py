"""
ReceiverProvider — In-memory store for drone detections from hardware receivers.

Push-based: ESP devices POST detections via /api/receivers/ingest.
This provider stores them in memory and returns them when polled.
Deduplicates by basic_id across multiple receivers (strongest RSSI wins).
Thread-safe via Lock.
"""

import logging
import threading
import time

logger = logging.getLogger("providers.receiver")

# Detections older than this are considered stale and discarded
DETECTION_STALE_SECONDS = 30


class ReceiverProvider:
    """In-memory store for receiver-reported drone detections."""

    def __init__(self):
        self._lock = threading.Lock()
        # _store[tenant_id][basic_id] = {
        #   "detections": {node_id: {data + "timestamp": float, "rssi": int}},
        #   "merged": {standard drone dict}
        # }
        self._store: dict[str, dict[str, dict]] = {}
        # Version counter per tenant (bumped on each ingest)
        self._versions: dict[str, int] = {}

    def get_version(self, tenant_id: str) -> int:
        """Return current receiver data version for a tenant."""
        return self._versions.get(tenant_id, 0)

    def ingest(self, tenant_id: str, node_id: str, node_lat: float | None,
               node_lon: float | None, detections: list[dict]) -> int:
        """Store detections from a receiver node. Returns number of detections stored."""
        now = time.time()
        count = 0

        with self._lock:
            tenant_store = self._store.setdefault(tenant_id, {})

            for det in detections:
                basic_id = det.get("basic_id", "")
                if not basic_id:
                    continue

                entry = tenant_store.setdefault(basic_id, {"detections": {}, "merged": {}})
                entry["detections"][node_id] = {
                    "lat": det.get("lat", 0.0),
                    "lon": det.get("lon", 0.0),
                    "alt": det.get("alt", 0.0),
                    "speed": det.get("speed", 0.0),
                    "heading": det.get("heading"),
                    "rssi": det.get("rssi", -100),
                    "mac": det.get("mac"),
                    "id_type": det.get("id_type"),
                    "ua_type": det.get("ua_type"),
                    "pilot_lat": det.get("pilot_lat"),
                    "pilot_lon": det.get("pilot_lon"),
                    "node_lat": node_lat,
                    "node_lon": node_lon,
                    "timestamp": now,
                }

                # Rebuild merged drone dict from strongest RSSI
                self._rebuild_merged(entry, basic_id)
                count += 1

            # Bump version
            self._versions[tenant_id] = self._versions.get(tenant_id, 0) + 1

        logger.debug("Ingested %d detections from node %s (tenant %s)", count, node_id, tenant_id)
        return count

    def _rebuild_merged(self, entry: dict, basic_id: str):
        """Rebuild the merged drone dict from all receiver detections.
        Picks the detection with strongest RSSI for position data.
        """
        detections = entry["detections"]
        if not detections:
            entry["merged"] = {}
            return

        # Find detection with strongest RSSI
        best_node = max(detections, key=lambda nid: detections[nid].get("rssi", -999))
        best = detections[best_node]

        # Collect pilot location from any detection that has it
        pilot_lat = None
        pilot_lon = None
        for det in detections.values():
            if det.get("pilot_lat") is not None and det.get("pilot_lon") is not None:
                pilot_lat = det["pilot_lat"]
                pilot_lon = det["pilot_lon"]
                break

        entry["merged"] = {
            "id": basic_id,  # Will be prefixed with "receiver_" in ProviderRegistry
            "basic_id": basic_id,
            "name": basic_id,
            "mac": best.get("mac"),
            "latitude": best["lat"],
            "longitude": best["lon"],
            "altitude": best.get("alt", 0.0),
            "altitude_baro": None,
            "altitude_geom": None,
            "speed": best.get("speed", 0.0),
            "heading": best.get("heading"),
            "pilot_latitude": pilot_lat,
            "pilot_longitude": pilot_lon,
            "signal_strength": best.get("rssi"),
            "battery": None,
            "status": "active",
            "flight_pattern": "unknown",
            "faa_data": None,
            "last_update": best["timestamp"],
            "source": "receiver",
            "source_label": "Empfänger",
            "receiver_count": len(detections),
            "receiver_nodes": list(detections.keys()),
        }

    def fetch_drones(self, tenant_id: str) -> list[dict]:
        """Return non-stale drone detections for a tenant."""
        now = time.time()
        result = []
        stale_keys = []

        with self._lock:
            tenant_store = self._store.get(tenant_id, {})

            for basic_id, entry in tenant_store.items():
                # Remove stale per-node detections
                stale_nodes = [
                    nid for nid, det in entry["detections"].items()
                    if now - det["timestamp"] > DETECTION_STALE_SECONDS
                ]
                for nid in stale_nodes:
                    del entry["detections"][nid]

                if not entry["detections"]:
                    stale_keys.append(basic_id)
                    continue

                # Rebuild merged after cleanup
                self._rebuild_merged(entry, basic_id)
                if entry["merged"]:
                    result.append(dict(entry["merged"]))

            # Cleanup fully stale entries
            for key in stale_keys:
                del tenant_store[key]

        return result

    def get_drone(self, tenant_id: str, basic_id: str) -> dict | None:
        """Get a single drone detection by basic_id."""
        with self._lock:
            tenant_store = self._store.get(tenant_id, {})
            entry = tenant_store.get(basic_id)
            if entry and entry.get("merged"):
                return dict(entry["merged"])
        return None

    def clear_tenant(self, tenant_id: str):
        """Clear all detections for a tenant."""
        with self._lock:
            self._store.pop(tenant_id, None)
