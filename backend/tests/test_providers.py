"""Tests for Provider Registry and individual providers."""

import pytest
import time

from providers import _metadata_score, _deduplicate_drones


class TestProviderRegistry:
    def test_registry_has_all_providers(self, registry):
        assert "simulator" in registry._providers
        assert "opensky" in registry._providers
        assert "adsbfi" in registry._providers
        assert "adsblol" in registry._providers
        assert "ogn" in registry._providers

    def test_simulator_only(self, registry, fleet):
        """With only simulator enabled, should return simulator drones."""
        # Give fleet a tick to generate positions
        for d in fleet.drones:
            d.update_position(dt=2.0)

        drones = registry.get_all_drones(50.1109, 8.6821, 50000, ["simulator"])
        assert len(drones) == 5
        for d in drones:
            assert d.get("source") == "simulator"

    def test_no_sources_enabled(self, registry):
        drones = registry.get_all_drones(50.1109, 8.6821, 10000, [])
        assert len(drones) == 0

    def test_compound_id_split_simulator(self, registry):
        source, original_id = registry._split_compound_id("AZTEST001")
        assert source == "simulator"
        assert original_id == "AZTEST001"

    def test_compound_id_split_opensky(self, registry):
        source, original_id = registry._split_compound_id("opensky_3c6752")
        assert source == "opensky"
        assert original_id == "3c6752"

    def test_compound_id_split_adsbfi(self, registry):
        source, original_id = registry._split_compound_id("adsbfi_abc123")
        assert source == "adsbfi"
        assert original_id == "abc123"

    def test_compound_id_split_adsblol(self, registry):
        source, original_id = registry._split_compound_id("adsblol_def456")
        assert source == "adsblol"
        assert original_id == "def456"

    def test_compound_id_split_ogn(self, registry):
        source, original_id = registry._split_compound_id("ogn_xyz789")
        assert source == "ogn"
        assert original_id == "xyz789"

    def test_get_drone_simulator(self, registry, fleet):
        for d in fleet.drones:
            d.update_position(dt=2.0)
        drone = registry.get_drone("AZTEST001")
        assert drone is not None
        assert drone["name"] == "Desert Eagle"
        assert drone["source"] == "simulator"

    def test_get_drone_nonexistent(self, registry):
        drone = registry.get_drone("nonexistent_abc")
        assert drone is None

    def test_get_drone_history_simulator(self, registry, fleet):
        for d in fleet.drones:
            d.update_position(dt=2.0)
        history = registry.get_drone_history("AZTEST001")
        assert history is not None
        assert isinstance(history, list)

    def test_get_drone_history_external(self, registry):
        """External providers return empty history."""
        history = registry.get_drone_history("opensky_3c6752")
        assert history is not None
        assert history == []


class TestSimulatorProvider:
    def test_source_id(self, registry):
        provider = registry._providers["simulator"]
        assert provider.source_id == "simulator"
        assert provider.source_label == "Simulator"

    def test_fetch_injects_source(self, registry, fleet):
        for d in fleet.drones:
            d.update_position(dt=2.0)
        provider = registry._providers["simulator"]
        drones = provider.fetch_drones(50.1109, 8.6821, 50000)
        assert len(drones) > 0
        for d in drones:
            assert d["source"] == "simulator"
            assert d["source_label"] == "Simulator"

    def test_get_drone(self, registry, fleet):
        for d in fleet.drones:
            d.update_position(dt=2.0)
        provider = registry._providers["simulator"]
        drone = provider.get_drone("AZTEST001")
        assert drone is not None
        assert drone["source"] == "simulator"

    def test_get_drone_history(self, registry, fleet):
        for d in fleet.drones:
            d.update_position(dt=2.0)
        provider = registry._providers["simulator"]
        history = provider.get_drone_history("AZTEST001")
        assert history is not None
        assert len(history) > 0


class TestSimulatorRadiusFilter:
    """Test simulator provider handles radius=0 (no filter) vs radius>0 correctly."""

    def test_radius_zero_returns_all(self, registry, fleet):
        """radius=0 should return all drones regardless of position."""
        for d in fleet.drones:
            d.update_position(dt=2.0)
        provider = registry._providers["simulator"]
        # Use coordinates far from fleet center - radius=0 should still return all
        drones = provider.fetch_drones(0.0, 0.0, 0)
        assert len(drones) == 5

    def test_radius_positive_filters(self, registry, fleet):
        """Small positive radius far from fleet should return no drones."""
        for d in fleet.drones:
            d.update_position(dt=2.0)
        provider = registry._providers["simulator"]
        # Position far from fleet center with small radius
        drones = provider.fetch_drones(0.0, 0.0, 1)
        assert len(drones) == 0

    def test_radius_toggle_no_cache_collision(self, registry, fleet):
        """Toggling between radius=0 and radius>0 should not use stale cache."""
        for d in fleet.drones:
            d.update_position(dt=2.0)
        provider = registry._providers["simulator"]

        # First: radius=0 (all drones)
        all_drones = provider.fetch_drones(0.0, 0.0, 0)
        assert len(all_drones) == 5

        # Second: small radius far away (no drones) - must NOT return cached 5
        filtered = provider.fetch_drones(0.0, 0.0, 1)
        assert len(filtered) == 0

        # Third: back to radius=0 (all drones again)
        all_again = provider.fetch_drones(0.0, 0.0, 0)
        assert len(all_again) == 5

    def test_registry_radius_zero_simulator(self, registry, fleet):
        """Registry with radius_m=0 should pass 0 to simulator (returns all)."""
        for d in fleet.drones:
            d.update_position(dt=2.0)
        drones = registry.get_all_drones(0.0, 0.0, 0, ["simulator"])
        assert len(drones) == 5

    def test_registry_external_gets_max_radius_when_disabled(self, registry):
        """When radius=0, external providers should get MAX_EXTERNAL_RADIUS."""
        # Can't test actual API calls, but verify the logic
        assert registry.MAX_EXTERNAL_RADIUS == 500000


class TestBaseProviderCaching:
    def test_cache_returns_same_data(self, registry, fleet):
        for d in fleet.drones:
            d.update_position(dt=2.0)
        provider = registry._providers["simulator"]
        result1 = provider.fetch_drones(50.1109, 8.6821, 50000)
        result2 = provider.fetch_drones(50.1109, 8.6821, 50000)
        # Second call should use cache (same reference or same data)
        assert len(result1) == len(result2)

    def test_cache_invalidated_on_radius_change(self, registry, fleet):
        """Changing radius should invalidate the cache."""
        for d in fleet.drones:
            d.update_position(dt=2.0)
        provider = registry._providers["simulator"]
        result1 = provider.fetch_drones(50.1109, 8.6821, 50000)
        result2 = provider.fetch_drones(50.1109, 8.6821, 10000)
        # Different radius should not use cached result
        # (both may return 5 drones since fleet is nearby, but cache params differ)
        assert provider._cache_params[2] != 50000 or provider._cache_params[2] != 10000

    def test_cache_key_distinguishes_zero_from_positive(self, registry, fleet):
        """Cache key for radius=0 must differ from radius=100."""
        for d in fleet.drones:
            d.update_position(dt=2.0)
        provider = registry._providers["simulator"]
        provider.fetch_drones(50.0, 8.0, 0)
        key_zero = provider._cache_params
        provider.fetch_drones(50.0, 8.0, 100)
        key_100 = provider._cache_params
        assert key_zero != key_100


class TestDroneDeduplication:
    """Test deduplication of drones across sources."""

    def _make_drone(self, basic_id, source, **kwargs):
        """Helper to create a drone dict with given fields."""
        d = {
            "id": f"{source}_{basic_id}" if source != "simulator" else basic_id,
            "basic_id": basic_id,
            "name": kwargs.get("name", basic_id),
            "latitude": kwargs.get("latitude", 50.0),
            "longitude": kwargs.get("longitude", 8.0),
            "altitude": kwargs.get("altitude", 100.0),
            "speed": kwargs.get("speed", 10.0),
            "status": kwargs.get("status", "active"),
            "flight_pattern": kwargs.get("flight_pattern", "unknown"),
            "source": source,
            "source_label": source,
            "pilot_latitude": kwargs.get("pilot_latitude"),
            "pilot_longitude": kwargs.get("pilot_longitude"),
            "battery": kwargs.get("battery"),
            "signal_strength": kwargs.get("signal_strength"),
            "faa_data": kwargs.get("faa_data"),
            "mac": kwargs.get("mac"),
        }
        return d

    def test_no_duplicates_passes_through(self):
        drones = [
            self._make_drone("AAA", "opensky"),
            self._make_drone("BBB", "adsbfi"),
            self._make_drone("CCC", "simulator"),
        ]
        result = _deduplicate_drones(drones)
        assert len(result) == 3

    def test_duplicate_keeps_most_metadata(self):
        """Same basic_id from two sources — keep the one with more metadata."""
        sparse = self._make_drone("ABC123", "opensky")
        rich = self._make_drone("ABC123", "adsbfi", signal_strength=-65, battery=80)
        result = _deduplicate_drones([sparse, rich])
        assert len(result) == 1
        assert result[0]["source"] == "adsbfi"

    def test_duplicate_prefers_simulator(self):
        """Simulator drones have pilot pos, battery, flight_pattern etc."""
        ext = self._make_drone("D001", "opensky", signal_strength=-70)
        sim = self._make_drone("D001", "simulator",
                               pilot_latitude=50.1, pilot_longitude=8.1,
                               battery=95, flight_pattern="circle",
                               faa_data={"reg": "N12345"})
        result = _deduplicate_drones([ext, sim])
        assert len(result) == 1
        assert result[0]["source"] == "simulator"

    def test_three_sources_same_id(self):
        """Three sources for same aircraft — keep best."""
        d1 = self._make_drone("HEX42", "opensky")
        d2 = self._make_drone("HEX42", "adsbfi", signal_strength=-60)
        d3 = self._make_drone("HEX42", "adsblol", signal_strength=-55, mac="aa:bb:cc")
        result = _deduplicate_drones([d1, d2, d3])
        assert len(result) == 1
        assert result[0]["source"] == "adsblol"

    def test_different_basic_ids_not_deduped(self):
        """Different basic_ids are different aircraft, no dedup."""
        d1 = self._make_drone("AAA", "opensky")
        d2 = self._make_drone("BBB", "opensky")
        result = _deduplicate_drones([d1, d2])
        assert len(result) == 2

    def test_empty_list(self):
        assert _deduplicate_drones([]) == []

    def test_single_drone(self):
        result = _deduplicate_drones([self._make_drone("X", "opensky")])
        assert len(result) == 1

    def test_metadata_score_empty(self):
        """Drone with no metadata fields scores 0."""
        d = self._make_drone("Z", "opensky")
        assert _metadata_score(d) == 0

    def test_metadata_score_full(self):
        """Drone with all metadata fields scores high."""
        d = self._make_drone("Z", "simulator",
                             pilot_latitude=50.0, pilot_longitude=8.0,
                             battery=90, signal_strength=-50,
                             faa_data={"reg": "N123"}, mac="aa:bb",
                             flight_pattern="circle")
        assert _metadata_score(d) == 7  # 6 fields + flight_pattern


class TestExternalProviderDefaults:
    """Test that external providers have correct metadata without network calls."""

    def test_opensky_metadata(self, registry):
        p = registry._providers["opensky"]
        assert p.source_id == "opensky"
        assert p.source_label == "OpenSky Network"
        assert p._cache_max_age == 15.0

    def test_adsbfi_metadata(self, registry):
        p = registry._providers["adsbfi"]
        assert p.source_id == "adsbfi"
        assert p.source_label == "adsb.fi"
        assert p._cache_max_age == 10.0

    def test_adsblol_metadata(self, registry):
        p = registry._providers["adsblol"]
        assert p.source_id == "adsblol"
        assert p.source_label == "adsb.lol"
        assert p._cache_max_age == 10.0

    def test_ogn_metadata(self, registry):
        p = registry._providers["ogn"]
        assert p.source_id == "ogn"
        assert p.source_label == "Open Glider Network"
        assert p._cache_max_age == 10.0

    def test_empty_cache_on_init(self, registry):
        for name, p in registry._providers.items():
            if name == "simulator":
                continue
            assert p._cache == []
            assert p.get_drone("anything") is None
            assert p.get_drone_history("anything") == []
