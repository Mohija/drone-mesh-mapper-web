"""Tests for FlightZoneManager and flight zone API endpoints."""

import json
import os
import pytest
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from flight_zones import FlightZoneManager, point_in_polygon


# ─── Unit Tests: point_in_polygon ─────────────────────────


class TestPointInPolygon:
    def test_point_inside_square(self):
        square = [[0, 0], [0, 10], [10, 10], [10, 0]]
        assert point_in_polygon(5, 5, square) is True

    def test_point_outside_square(self):
        square = [[0, 0], [0, 10], [10, 10], [10, 0]]
        assert point_in_polygon(15, 5, square) is False

    def test_point_inside_triangle(self):
        triangle = [[0, 0], [10, 5], [0, 10]]
        assert point_in_polygon(3, 5, triangle) is True

    def test_point_outside_triangle(self):
        triangle = [[0, 0], [10, 5], [0, 10]]
        assert point_in_polygon(9, 1, triangle) is False

    def test_polygon_too_few_points(self):
        assert point_in_polygon(5, 5, [[0, 0], [10, 10]]) is False
        assert point_in_polygon(5, 5, []) is False

    def test_point_near_bielefeld(self):
        """Real-world polygon around Bielefeld city center."""
        bielefeld = [
            [52.025, 8.525],
            [52.025, 8.545],
            [52.035, 8.545],
            [52.035, 8.525],
        ]
        # Inside
        assert point_in_polygon(52.030, 8.535, bielefeld) is True
        # Outside
        assert point_in_polygon(52.040, 8.535, bielefeld) is False


# ─── Unit Tests: FlightZoneManager ────────────────────────


class TestFlightZoneManager:
    @pytest.fixture
    def zone_mgr(self, tmp_path):
        return FlightZoneManager(str(tmp_path / "zones"))

    @pytest.fixture
    def sample_polygon(self):
        return [[52.025, 8.525], [52.025, 8.545], [52.035, 8.545], [52.035, 8.525]]

    def test_create_zone(self, zone_mgr, sample_polygon):
        zone = zone_mgr.create_zone({"name": "Test Zone", "polygon": sample_polygon})
        assert zone["name"] == "Test Zone"
        assert zone["id"]
        assert len(zone["polygon"]) == 4
        assert zone["assignedDrones"] == []
        assert zone["createdAt"] > 0
        # Verify file was written
        path = os.path.join(zone_mgr._dir, f"{zone['id']}.json")
        assert os.path.exists(path)

    def test_create_zone_missing_name(self, zone_mgr, sample_polygon):
        with pytest.raises(ValueError, match="name"):
            zone_mgr.create_zone({"name": "", "polygon": sample_polygon})

    def test_create_zone_too_few_points(self, zone_mgr):
        with pytest.raises(ValueError, match="3 points"):
            zone_mgr.create_zone({"name": "Bad", "polygon": [[0, 0], [1, 1]]})

    def test_list_zones(self, zone_mgr, sample_polygon):
        zone_mgr.create_zone({"name": "A", "polygon": sample_polygon})
        zone_mgr.create_zone({"name": "B", "polygon": sample_polygon})
        zones = zone_mgr.list_zones()
        assert len(zones) == 2
        names = {z["name"] for z in zones}
        assert names == {"A", "B"}

    def test_get_zone(self, zone_mgr, sample_polygon):
        created = zone_mgr.create_zone({"name": "Get Me", "polygon": sample_polygon})
        fetched = zone_mgr.get_zone(created["id"])
        assert fetched is not None
        assert fetched["name"] == "Get Me"

    def test_get_zone_not_found(self, zone_mgr):
        assert zone_mgr.get_zone("nonexistent") is None

    def test_update_zone(self, zone_mgr, sample_polygon):
        zone = zone_mgr.create_zone({"name": "Original", "polygon": sample_polygon, "color": "#ff0000"})
        updated = zone_mgr.update_zone(zone["id"], {"name": "Renamed", "color": "#00ff00"})
        assert updated["name"] == "Renamed"
        assert updated["color"] == "#00ff00"
        assert updated["updatedAt"] >= zone["createdAt"]

    def test_update_zone_not_found(self, zone_mgr):
        assert zone_mgr.update_zone("nonexistent", {"name": "X"}) is None

    def test_update_zone_empty_name(self, zone_mgr, sample_polygon):
        zone = zone_mgr.create_zone({"name": "Test", "polygon": sample_polygon})
        with pytest.raises(ValueError, match="name"):
            zone_mgr.update_zone(zone["id"], {"name": ""})

    def test_update_zone_bad_polygon(self, zone_mgr, sample_polygon):
        zone = zone_mgr.create_zone({"name": "Test", "polygon": sample_polygon})
        with pytest.raises(ValueError, match="3 points"):
            zone_mgr.update_zone(zone["id"], {"polygon": [[0, 0]]})

    def test_delete_zone(self, zone_mgr, sample_polygon):
        zone = zone_mgr.create_zone({"name": "Delete Me", "polygon": sample_polygon})
        assert zone_mgr.delete_zone(zone["id"]) is True
        assert zone_mgr.get_zone(zone["id"]) is None
        path = os.path.join(zone_mgr._dir, f"{zone['id']}.json")
        assert not os.path.exists(path)

    def test_delete_zone_not_found(self, zone_mgr):
        assert zone_mgr.delete_zone("nonexistent") is False

    def test_assign_drones(self, zone_mgr, sample_polygon):
        zone = zone_mgr.create_zone({"name": "Assign Test", "polygon": sample_polygon})
        updated = zone_mgr.assign_drones(zone["id"], ["DRONE1", "DRONE2"])
        assert set(updated["assignedDrones"]) == {"DRONE1", "DRONE2"}

    def test_assign_drones_idempotent(self, zone_mgr, sample_polygon):
        zone = zone_mgr.create_zone({"name": "Idem", "polygon": sample_polygon})
        zone_mgr.assign_drones(zone["id"], ["DRONE1"])
        updated = zone_mgr.assign_drones(zone["id"], ["DRONE1", "DRONE2"])
        assert sorted(updated["assignedDrones"]) == ["DRONE1", "DRONE2"]

    def test_assign_drones_not_found(self, zone_mgr):
        assert zone_mgr.assign_drones("nonexistent", ["DRONE1"]) is None

    def test_unassign_drones(self, zone_mgr, sample_polygon):
        zone = zone_mgr.create_zone({"name": "Unassign", "polygon": sample_polygon})
        zone_mgr.assign_drones(zone["id"], ["DRONE1", "DRONE2", "DRONE3"])
        updated = zone_mgr.unassign_drones(zone["id"], ["DRONE2"])
        assert "DRONE2" not in updated["assignedDrones"]
        assert "DRONE1" in updated["assignedDrones"]
        assert "DRONE3" in updated["assignedDrones"]

    def test_unassign_drones_not_found(self, zone_mgr):
        assert zone_mgr.unassign_drones("nonexistent", ["DRONE1"]) is None


# ─── Unit Tests: Violation Detection ──────────────────────


class TestViolationDetection:
    @pytest.fixture
    def zone_mgr(self, tmp_path):
        return FlightZoneManager(str(tmp_path / "zones"))

    @pytest.fixture
    def bielefeld_zone(self):
        return [[52.025, 8.525], [52.025, 8.545], [52.035, 8.545], [52.035, 8.525]]

    def test_drone_inside_unassigned_is_violation(self, zone_mgr, bielefeld_zone):
        zone_mgr.create_zone({"name": "Restricted", "polygon": bielefeld_zone})
        drones = [{"id": "D1", "name": "Intruder", "basic_id": "D1", "latitude": 52.030, "longitude": 8.535}]
        violations = zone_mgr.check_violations(drones)
        assert len(violations) == 1
        assert violations[0]["droneId"] == "D1"
        assert violations[0]["zoneName"] == "Restricted"

    def test_drone_inside_assigned_no_violation(self, zone_mgr, bielefeld_zone):
        zone = zone_mgr.create_zone({"name": "Allowed", "polygon": bielefeld_zone})
        zone_mgr.assign_drones(zone["id"], ["D1"])
        drones = [{"id": "D1", "name": "Allowed Drone", "basic_id": "D1", "latitude": 52.030, "longitude": 8.535}]
        violations = zone_mgr.check_violations(drones)
        assert len(violations) == 0

    def test_drone_outside_no_violation(self, zone_mgr, bielefeld_zone):
        zone_mgr.create_zone({"name": "Far Zone", "polygon": bielefeld_zone})
        drones = [{"id": "D1", "name": "Far Away", "basic_id": "D1", "latitude": 53.0, "longitude": 10.0}]
        violations = zone_mgr.check_violations(drones)
        assert len(violations) == 0

    def test_assigned_by_basic_id(self, zone_mgr, bielefeld_zone):
        """Assigning by basic_id should also prevent violations."""
        zone = zone_mgr.create_zone({"name": "BasicID", "polygon": bielefeld_zone})
        zone_mgr.assign_drones(zone["id"], ["BASIC001"])
        drones = [{"id": "opensky_abc", "name": "Test", "basic_id": "BASIC001", "latitude": 52.030, "longitude": 8.535}]
        violations = zone_mgr.check_violations(drones)
        assert len(violations) == 0

    def test_multiple_zones_multiple_violations(self, zone_mgr, bielefeld_zone):
        zone_mgr.create_zone({"name": "Zone A", "polygon": bielefeld_zone})
        zone_mgr.create_zone({"name": "Zone B", "polygon": bielefeld_zone})
        drones = [{"id": "D1", "name": "Intruder", "basic_id": "D1", "latitude": 52.030, "longitude": 8.535}]
        violations = zone_mgr.check_violations(drones)
        assert len(violations) == 2
        zone_names = {v["zoneName"] for v in violations}
        assert zone_names == {"Zone A", "Zone B"}

    def test_no_zones_no_violations(self, zone_mgr):
        drones = [{"id": "D1", "name": "Solo", "basic_id": "D1", "latitude": 52.030, "longitude": 8.535}]
        violations = zone_mgr.check_violations(drones)
        assert len(violations) == 0

    def test_no_drones_no_violations(self, zone_mgr, bielefeld_zone):
        zone_mgr.create_zone({"name": "Empty", "polygon": bielefeld_zone})
        violations = zone_mgr.check_violations([])
        assert len(violations) == 0


# ─── Unit Tests: Persistence ──────────────────────────────


class TestPersistence:
    def test_reload_from_disk(self, tmp_path):
        data_dir = str(tmp_path / "zones")
        mgr1 = FlightZoneManager(data_dir)
        polygon = [[0, 0], [0, 10], [10, 10], [10, 0]]
        zone = mgr1.create_zone({"name": "Persist", "polygon": polygon})
        mgr1.assign_drones(zone["id"], ["DRONE1"])

        # Create a new manager that loads from disk
        mgr2 = FlightZoneManager(data_dir)
        loaded = mgr2.get_zone(zone["id"])
        assert loaded is not None
        assert loaded["name"] == "Persist"
        assert "DRONE1" in loaded["assignedDrones"]


# ─── API Tests ────────────────────────────────────────────


class TestZoneAPI:
    @pytest.fixture(autouse=True)
    def clean_zones(self, client):
        """Clean up zones before each test."""
        res = client.get("/api/zones")
        for zone in res.get_json():
            client.delete(f"/api/zones/{zone['id']}")
        yield

    def _sample_zone(self):
        return {
            "name": "Test Zone",
            "color": "#ff0000",
            "polygon": [[52.025, 8.525], [52.025, 8.545], [52.035, 8.545], [52.035, 8.525]],
        }

    def test_create_zone_valid(self, client):
        res = client.post("/api/zones", data=json.dumps(self._sample_zone()), content_type="application/json")
        assert res.status_code == 201
        data = res.get_json()
        assert data["name"] == "Test Zone"
        assert data["id"]

    def test_create_zone_missing_name(self, client):
        zone = self._sample_zone()
        zone["name"] = ""
        res = client.post("/api/zones", data=json.dumps(zone), content_type="application/json")
        assert res.status_code == 400

    def test_create_zone_too_few_points(self, client):
        res = client.post("/api/zones", data=json.dumps({"name": "Bad", "polygon": [[0, 0]]}), content_type="application/json")
        assert res.status_code == 400

    def test_create_zone_no_body(self, client):
        res = client.post("/api/zones", data="", content_type="application/json")
        assert res.status_code == 400

    def test_list_zones_empty(self, client):
        res = client.get("/api/zones")
        assert res.status_code == 200
        assert res.get_json() == []

    def test_list_zones_with_data(self, client):
        client.post("/api/zones", data=json.dumps(self._sample_zone()), content_type="application/json")
        res = client.get("/api/zones")
        assert res.status_code == 200
        assert len(res.get_json()) == 1

    def test_get_zone_found(self, client):
        create_res = client.post("/api/zones", data=json.dumps(self._sample_zone()), content_type="application/json")
        zone_id = create_res.get_json()["id"]
        res = client.get(f"/api/zones/{zone_id}")
        assert res.status_code == 200
        assert res.get_json()["name"] == "Test Zone"

    def test_get_zone_not_found(self, client):
        res = client.get("/api/zones/nonexistent")
        assert res.status_code == 404

    def test_update_zone(self, client):
        create_res = client.post("/api/zones", data=json.dumps(self._sample_zone()), content_type="application/json")
        zone_id = create_res.get_json()["id"]
        res = client.put(f"/api/zones/{zone_id}", data=json.dumps({"name": "Updated"}), content_type="application/json")
        assert res.status_code == 200
        assert res.get_json()["name"] == "Updated"

    def test_update_zone_not_found(self, client):
        res = client.put("/api/zones/nonexistent", data=json.dumps({"name": "X"}), content_type="application/json")
        assert res.status_code == 404

    def test_delete_zone(self, client):
        create_res = client.post("/api/zones", data=json.dumps(self._sample_zone()), content_type="application/json")
        zone_id = create_res.get_json()["id"]
        res = client.delete(f"/api/zones/{zone_id}")
        assert res.status_code == 200
        assert client.get(f"/api/zones/{zone_id}").status_code == 404

    def test_delete_zone_not_found(self, client):
        res = client.delete("/api/zones/nonexistent")
        assert res.status_code == 404

    def test_assign_drones(self, client):
        create_res = client.post("/api/zones", data=json.dumps(self._sample_zone()), content_type="application/json")
        zone_id = create_res.get_json()["id"]
        res = client.post(f"/api/zones/{zone_id}/assign", data=json.dumps({"droneIds": ["D1", "D2"]}), content_type="application/json")
        assert res.status_code == 200
        assert set(res.get_json()["assignedDrones"]) == {"D1", "D2"}

    def test_assign_drones_missing_body(self, client):
        create_res = client.post("/api/zones", data=json.dumps(self._sample_zone()), content_type="application/json")
        zone_id = create_res.get_json()["id"]
        res = client.post(f"/api/zones/{zone_id}/assign", data=json.dumps({}), content_type="application/json")
        assert res.status_code == 400

    def test_assign_drones_zone_not_found(self, client):
        res = client.post("/api/zones/nonexistent/assign", data=json.dumps({"droneIds": ["D1"]}), content_type="application/json")
        assert res.status_code == 404

    def test_unassign_drones(self, client):
        create_res = client.post("/api/zones", data=json.dumps(self._sample_zone()), content_type="application/json")
        zone_id = create_res.get_json()["id"]
        client.post(f"/api/zones/{zone_id}/assign", data=json.dumps({"droneIds": ["D1", "D2"]}), content_type="application/json")
        res = client.post(f"/api/zones/{zone_id}/unassign", data=json.dumps({"droneIds": ["D1"]}), content_type="application/json")
        assert res.status_code == 200
        assert "D1" not in res.get_json()["assignedDrones"]
        assert "D2" in res.get_json()["assignedDrones"]

    def test_violations_endpoint(self, client):
        """Violations endpoint returns correct structure."""
        zone = {
            "name": "Bielefeld Zone",
            "polygon": [[51.9, 8.4], [51.9, 8.7], [52.1, 8.7], [52.1, 8.4]],
        }
        client.post("/api/zones", data=json.dumps(zone), content_type="application/json")
        res = client.get("/api/zones/violations")
        assert res.status_code == 200
        data = res.get_json()
        assert "violations" in data
        assert "count" in data
        assert isinstance(data["violations"], list)
        assert data["count"] == len(data["violations"])
        # Each violation has required fields
        for v in data["violations"]:
            assert "droneId" in v
            assert "droneName" in v
            assert "zoneId" in v
            assert "zoneName" in v
