"""Tests for SettingsManager and settings API endpoints."""

import json
import pytest


class TestSettingsManager:
    def test_default_sources(self, settings_manager):
        enabled = settings_manager.get_enabled_sources()
        assert "simulator" in enabled
        assert "opensky" not in enabled
        assert "adsbfi" not in enabled
        assert "adsblol" not in enabled
        assert "ogn" not in enabled

    def test_get_all_returns_dict(self, settings_manager):
        all_settings = settings_manager.get_all()
        assert "sources" in all_settings
        assert "simulator" in all_settings["sources"]
        assert "opensky" in all_settings["sources"]
        assert "adsbfi" in all_settings["sources"]
        assert "adsblol" in all_settings["sources"]
        assert "ogn" in all_settings["sources"]

    def test_source_has_required_fields(self, settings_manager):
        all_settings = settings_manager.get_all()
        for source_id, cfg in all_settings["sources"].items():
            assert "enabled" in cfg, f"{source_id} missing 'enabled'"
            assert "label" in cfg, f"{source_id} missing 'label'"
            assert "description" in cfg, f"{source_id} missing 'description'"

    def test_update_enables_source(self, settings_manager):
        settings_manager.update({"sources": {"opensky": {"enabled": True}}})
        enabled = settings_manager.get_enabled_sources()
        assert "opensky" in enabled
        # Reset
        settings_manager.update({"sources": {"opensky": {"enabled": False}}})

    def test_update_disables_source(self, settings_manager):
        settings_manager.update({"sources": {"simulator": {"enabled": False}}})
        enabled = settings_manager.get_enabled_sources()
        assert "simulator" not in enabled
        # Reset
        settings_manager.update({"sources": {"simulator": {"enabled": True}}})

    def test_update_unknown_source_ignored(self, settings_manager):
        settings_manager.update({"sources": {"unknown_source": {"enabled": True}}})
        all_settings = settings_manager.get_all()
        assert "unknown_source" not in all_settings["sources"]

    def test_get_all_returns_copy(self, settings_manager):
        """Modifying returned dict should not affect internal state."""
        all1 = settings_manager.get_all()
        all1["sources"]["simulator"]["enabled"] = False
        all2 = settings_manager.get_all()
        assert all2["sources"]["simulator"]["enabled"] is True


class TestSettingsAPI:
    def test_get_settings(self, client):
        res = client.get("/api/settings")
        assert res.status_code == 200
        data = res.get_json()
        assert "sources" in data
        assert "simulator" in data["sources"]

    def test_post_settings_enable(self, client):
        res = client.post(
            "/api/settings",
            data=json.dumps({"sources": {"opensky": {"enabled": True}}}),
            content_type="application/json",
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["sources"]["opensky"]["enabled"] is True
        # Reset
        client.post(
            "/api/settings",
            data=json.dumps({"sources": {"opensky": {"enabled": False}}}),
            content_type="application/json",
        )

    def test_post_settings_empty_body(self, client):
        res = client.post(
            "/api/settings",
            data="",
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_post_settings_preserves_labels(self, client):
        res = client.post(
            "/api/settings",
            data=json.dumps({"sources": {"opensky": {"enabled": True}}}),
            content_type="application/json",
        )
        data = res.get_json()
        assert data["sources"]["opensky"]["label"] == "OpenSky Network"
        # Reset
        client.post(
            "/api/settings",
            data=json.dumps({"sources": {"opensky": {"enabled": False}}}),
            content_type="application/json",
        )


class TestDronesWithSources:
    def test_drones_response_has_sources_field(self, client):
        res = client.get("/api/drones")
        data = res.get_json()
        assert "sources" in data
        assert isinstance(data["sources"], list)
        assert "simulator" in data["sources"]

    def test_simulator_drones_have_source_field(self, client):
        res = client.get("/api/drones")
        data = res.get_json()
        for drone in data["drones"]:
            assert "source" in drone
            assert drone["source"] == "simulator"
            assert "source_label" in drone
            assert drone["source_label"] == "Simulator"

    def test_single_drone_has_source_field(self, client):
        res = client.get("/api/drones/AZTEST001")
        assert res.status_code == 200
        data = res.get_json()
        assert data["source"] == "simulator"
        assert data["source_label"] == "Simulator"
