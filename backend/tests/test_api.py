"""Tests for Flask API endpoints in app.py."""

import json
import pytest


class TestHealthEndpoint:
    def test_health_returns_ok(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "ok"


class TestGetDrones:
    def test_returns_all_drones(self, client, auth_headers):
        res = client.get("/api/drones", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert "drones" in data
        assert "count" in data
        assert "center" in data
        assert data["count"] == len(data["drones"])
        assert data["count"] == 5

    def test_returns_center(self, client, auth_headers):
        res = client.get("/api/drones", headers=auth_headers)
        data = res.get_json()
        assert "lat" in data["center"]
        assert "lon" in data["center"]

    def test_with_location_filter(self, client, auth_headers):
        res = client.get("/api/drones?lat=52.0302&lon=8.5325&radius=50000", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert "drones" in data
        # All drones near center should be included with large radius
        assert data["count"] == 5

    def test_with_radius_zero_returns_all(self, client, auth_headers):
        """radius=0 means no filter - should return all simulator drones."""
        res = client.get("/api/drones?lat=0&lon=0&radius=0", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        # radius=0 disables filter, all 5 simulator drones visible regardless of position
        assert data["count"] == 5

    def test_with_small_radius(self, client, auth_headers):
        res = client.get("/api/drones?lat=52.0302&lon=8.5325&radius=1", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data["count"] <= 5

    def test_radius_toggle_sequence(self, client, auth_headers):
        """Toggling radius between 0 and a value should give different results."""
        # With radius far away from drones -> 0 results
        res1 = client.get("/api/drones?lat=0&lon=0&radius=1", headers=auth_headers)
        data1 = res1.get_json()
        assert data1["count"] == 0

        # Disable radius (radius=0) -> all drones visible
        res2 = client.get("/api/drones?lat=0&lon=0&radius=0", headers=auth_headers)
        data2 = res2.get_json()
        assert data2["count"] == 5

        # Re-enable radius far away -> 0 again (cache should not interfere)
        res3 = client.get("/api/drones?lat=0&lon=0&radius=1", headers=auth_headers)
        data3 = res3.get_json()
        assert data3["count"] == 0

    def test_default_radius_applied(self, client, auth_headers):
        """Without explicit radius param, DEFAULT_RADIUS should be used."""
        res = client.get("/api/drones", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        # Default is 50km around Bielefeld, simulator drones should be within
        assert data["count"] == 5

    def test_drone_data_structure(self, client, auth_headers):
        res = client.get("/api/drones", headers=auth_headers)
        data = res.get_json()
        drone = data["drones"][0]
        required_fields = [
            "id", "mac", "name", "latitude", "longitude", "altitude",
            "pilot_latitude", "pilot_longitude", "signal_strength",
            "battery", "speed", "status", "flight_pattern", "basic_id",
            "faa_data", "last_update",
        ]
        for field in required_fields:
            assert field in drone, f"Missing field: {field}"

    def test_unauthenticated_returns_401(self, client):
        res = client.get("/api/drones")
        assert res.status_code == 401


class TestGetDrone:
    def test_existing_drone(self, client, auth_headers):
        res = client.get("/api/drones/AZTEST001", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data["name"] == "Desert Eagle"
        assert data["id"] == "AZTEST001"

    def test_nonexistent_drone(self, client, auth_headers):
        res = client.get("/api/drones/NONEXISTENT", headers=auth_headers)
        assert res.status_code == 404
        data = res.get_json()
        assert "error" in data

    def test_all_configured_drones(self, client, auth_headers):
        for drone_id in ["AZTEST001", "AZTEST002", "AZTEST003", "AZTEST004", "AZTEST005"]:
            res = client.get(f"/api/drones/{drone_id}", headers=auth_headers)
            assert res.status_code == 200


class TestGetDroneHistory:
    def test_existing_drone_history(self, client, auth_headers):
        res = client.get("/api/drones/AZTEST001/history", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data["drone_id"] == "AZTEST001"
        assert "history" in data
        assert isinstance(data["history"], list)

    def test_nonexistent_drone_history(self, client, auth_headers):
        res = client.get("/api/drones/NONEXISTENT/history", headers=auth_headers)
        assert res.status_code == 404
        data = res.get_json()
        assert "error" in data


class TestSetFleetCenter:
    def test_valid_recenter(self, client, auth_headers):
        res = client.post(
            "/api/fleet/center",
            data=json.dumps({"lat": 48.1351, "lon": 11.5820}),
            content_type="application/json",
            headers=auth_headers,
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "ok"
        assert data["center"]["lat"] == 48.1351
        assert data["center"]["lon"] == 11.5820

    def test_missing_lat(self, client, auth_headers):
        res = client.post(
            "/api/fleet/center",
            data=json.dumps({"lon": 11.0}),
            content_type="application/json",
            headers=auth_headers,
        )
        assert res.status_code == 400

    def test_missing_lon(self, client, auth_headers):
        res = client.post(
            "/api/fleet/center",
            data=json.dumps({"lat": 48.0}),
            content_type="application/json",
            headers=auth_headers,
        )
        assert res.status_code == 400

    def test_empty_body(self, client, auth_headers):
        res = client.post(
            "/api/fleet/center",
            data="",
            content_type="application/json",
            headers=auth_headers,
        )
        assert res.status_code == 400

    def test_recenter_updates_drones(self, client, auth_headers):
        client.post(
            "/api/fleet/center",
            data=json.dumps({"lat": 48.0, "lon": 11.0}),
            content_type="application/json",
            headers=auth_headers,
        )
        res = client.get("/api/drones", headers=auth_headers)
        data = res.get_json()
        assert data["center"]["lat"] == 48.0
        assert data["center"]["lon"] == 11.0


class TestGetStatus:
    def test_status_response(self, client, auth_headers):
        res = client.get("/api/status", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert "running" in data
        assert "drone_count" in data
        assert "center" in data
        assert data["drone_count"] == 5


class TestFrontendServing:
    def test_root_returns_content(self, client):
        res = client.get("/")
        # Either serves index.html or returns 404 with hint
        assert res.status_code in [200, 404]

    def test_unknown_api_path(self, client):
        res = client.get("/api/nonexistent")
        # Falls through to frontend serving
        assert res.status_code in [200, 404]
