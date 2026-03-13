"""
Provider Registry - Manages all data source providers.
Supports parallel fetching via ThreadPoolExecutor.
Deduplicates drones across sources, preferring the most metadata-rich entry.
"""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from providers.simulator_provider import SimulatorProvider
from providers.opensky_provider import OpenSkyProvider
from providers.adsbfi_provider import AdsbFiProvider
from providers.adsblol_provider import AdsbLolProvider
from providers.ogn_provider import OgnProvider
from providers.receiver_provider import ReceiverProvider

logger = logging.getLogger("providers")

# Fields that indicate rich metadata (non-None/non-default = higher score)
_METADATA_FIELDS = [
    "pilot_latitude",
    "pilot_longitude",
    "battery",
    "signal_strength",
    "faa_data",
    "mac",
]


def _metadata_score(drone: dict) -> int:
    """Score a drone by how much metadata it carries. Higher = better."""
    score = 0
    for field in _METADATA_FIELDS:
        val = drone.get(field)
        if val is not None:
            score += 1
    # flight_pattern != "unknown" counts as metadata
    if drone.get("flight_pattern") and drone["flight_pattern"] != "unknown":
        score += 1
    return score


def _deduplicate_drones(drones: list[dict]) -> list[dict]:
    """Remove duplicates across sources.

    Groups drones by basic_id (the raw aircraft identifier before any
    source prefix). When the same basic_id appears from multiple sources,
    keeps only the entry with the most metadata.
    """
    groups: dict[str, list[dict]] = {}
    for d in drones:
        key = d.get("basic_id", d.get("id", ""))
        groups.setdefault(key, []).append(d)

    result = []
    for key, group in groups.items():
        if len(group) == 1:
            result.append(group[0])
        else:
            # Pick the drone with the highest metadata score
            best = max(group, key=_metadata_score)
            sources = [d["source"] for d in group if d.get("source")]
            logger.debug(
                "Dedup basic_id=%s: %d sources (%s), kept %s (score=%d)",
                key, len(group), ", ".join(sources),
                best.get("source", "?"), _metadata_score(best),
            )
            result.append(best)

    return result


class ProviderRegistry:
    """Central registry for all drone data providers."""

    def __init__(self, fleet):
        self._providers = {
            "simulator": SimulatorProvider(fleet),
            "opensky": OpenSkyProvider(),
            "adsbfi": AdsbFiProvider(),
            "adsblol": AdsbLolProvider(),
            "ogn": OgnProvider(),
        }
        self._receiver_provider = ReceiverProvider()

    # Max radius for external APIs when "no limit" is requested (500km)
    MAX_EXTERNAL_RADIUS = 500000

    def get_all_drones(
        self, center_lat: float, center_lon: float, radius_m: float,
        enabled_sources: list[str], tenant_id: str | None = None,
    ) -> list[dict]:
        """Fetch drones from all enabled sources in parallel.
        radius_m <= 0 means no radius filter (all drones).
        Deduplicates across sources, keeping the most metadata-rich entry.
        tenant_id is required for receiver source (per-tenant isolation).
        """
        active = {sid: p for sid, p in self._providers.items() if sid in enabled_sources}
        include_receiver = "receiver" in enabled_sources

        if not active and not include_receiver:
            return []

        all_drones = []

        # External APIs always need a radius, use large default when disabled
        external_radius = radius_m if radius_m > 0 else self.MAX_EXTERNAL_RADIUS

        if active:
            with ThreadPoolExecutor(max_workers=len(active)) as executor:
                futures = {
                    executor.submit(
                        p.fetch_drones, center_lat, center_lon,
                        radius_m if sid == "simulator" else external_radius
                    ): sid
                    for sid, p in active.items()
                }
                for future in as_completed(futures):
                    sid = futures[future]
                    try:
                        drones = future.result()
                        # Add compound IDs for non-simulator sources
                        for d in drones:
                            if sid != "simulator":
                                d["id"] = f"{sid}_{d['basic_id']}"
                        all_drones.extend(drones)
                    except Exception:
                        logger.exception("Provider %s failed", sid)

        # Add receiver drones (push-based, per-tenant)
        if include_receiver and tenant_id:
            try:
                receiver_drones = self._receiver_provider.fetch_drones(tenant_id)
                for d in receiver_drones:
                    d["id"] = f"receiver_{d['basic_id']}"
                all_drones.extend(receiver_drones)
            except Exception:
                logger.exception("ReceiverProvider failed")

        # Deduplicate across sources (same basic_id from different providers)
        total_sources = len(active) + (1 if include_receiver else 0)
        if total_sources > 1:
            before = len(all_drones)
            all_drones = _deduplicate_drones(all_drones)
            removed = before - len(all_drones)
            if removed > 0:
                logger.info("Deduplication removed %d duplicates (%d → %d)", removed, before, len(all_drones))

        return all_drones

    @property
    def receiver_provider(self) -> ReceiverProvider:
        """Access the receiver provider for ingest/version operations."""
        return self._receiver_provider

    def get_drone(self, compound_id: str, tenant_id: str | None = None) -> dict | None:
        """Get a single drone by compound ID (source_originalId)."""
        source, original_id = self._split_compound_id(compound_id)

        # Receiver drones are handled separately (per-tenant)
        if source == "receiver":
            if not tenant_id:
                return None
            drone = self._receiver_provider.get_drone(tenant_id, original_id)
            if drone:
                drone["id"] = compound_id
            return drone

        provider = self._providers.get(source)
        if not provider:
            return None
        drone = provider.get_drone(original_id)
        if drone and source != "simulator":
            drone["id"] = compound_id
        return drone

    def get_drone_history(self, compound_id: str) -> list[dict] | None:
        """Get history for a drone by compound ID."""
        source, original_id = self._split_compound_id(compound_id)
        provider = self._providers.get(source)
        if not provider:
            return None
        return provider.get_drone_history(original_id)

    def _split_compound_id(self, compound_id: str) -> tuple[str, str]:
        """Split compound ID into (source, original_id).
        Simulator IDs don't have a prefix, external IDs are source_originalId.
        """
        # Check receiver prefix first
        if compound_id.startswith("receiver_"):
            return "receiver", compound_id[len("receiver_"):]

        for source_id in self._providers:
            if source_id == "simulator":
                continue
            prefix = f"{source_id}_"
            if compound_id.startswith(prefix):
                return source_id, compound_id[len(prefix):]
        # No prefix found -> simulator drone
        return "simulator", compound_id
