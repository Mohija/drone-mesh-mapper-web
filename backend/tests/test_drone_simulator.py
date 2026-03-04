"""Tests for drone_simulator.py - DroneSimulator and DroneFleet classes."""

import math
import time
import pytest
from drone_simulator import (
    haversine_distance,
    move_point,
    DroneSimulator,
    DroneFleet,
    FLIGHT_PATTERNS,
)


# ─── Utility functions ───────────────────────────────────


class TestHaversineDistance:
    def test_same_point_is_zero(self):
        assert haversine_distance(50.0, 8.0, 50.0, 8.0) == 0.0

    def test_known_distance(self):
        # Frankfurt to Darmstadt ~30km
        dist = haversine_distance(50.1109, 8.6821, 49.8728, 8.6512)
        assert 26000 < dist < 28000

    def test_symmetric(self):
        d1 = haversine_distance(50.0, 8.0, 51.0, 9.0)
        d2 = haversine_distance(51.0, 9.0, 50.0, 8.0)
        assert abs(d1 - d2) < 0.01

    def test_small_distance(self):
        # ~111m for 0.001 degree latitude
        dist = haversine_distance(50.0, 8.0, 50.001, 8.0)
        assert 100 < dist < 120


class TestMovePoint:
    def test_move_north(self):
        lat, lon = move_point(50.0, 8.0, 0, 1000)
        assert lat > 50.0
        assert abs(lon - 8.0) < 0.001

    def test_move_east(self):
        lat, lon = move_point(50.0, 8.0, 90, 1000)
        assert abs(lat - 50.0) < 0.001
        assert lon > 8.0

    def test_move_south(self):
        lat, lon = move_point(50.0, 8.0, 180, 1000)
        assert lat < 50.0

    def test_distance_matches(self):
        lat2, lon2 = move_point(50.0, 8.0, 45, 500)
        actual = haversine_distance(50.0, 8.0, lat2, lon2)
        assert abs(actual - 500) < 5  # within 5m tolerance


# ─── DroneSimulator ──────────────────────────────────────


class TestDroneSimulator:
    def test_init_near_center(self, drone):
        assert abs(drone.lat - 50.1109) < 0.03
        assert abs(drone.lon - 8.6821) < 0.03

    def test_init_properties(self, drone):
        assert drone.drone_id == 1
        assert drone.name == "Test Drone"
        assert drone.mac == "AA:BB:CC:DD:EE:01"
        assert drone.basic_id == "TEST001"
        assert drone.status == "active"
        assert 60 <= drone.battery <= 100

    def test_init_flight_pattern(self, drone):
        assert drone.flight_pattern in FLIGHT_PATTERNS

    def test_init_faa_data(self, drone):
        faa = drone.faa_data
        assert "registrant_name" in faa
        assert "manufacturer" in faa
        assert "model" in faa
        assert "serial_number" in faa
        assert faa["registrant_name"] == "Pilot 1"

    def test_update_position_changes_location(self, drone):
        old_lat, old_lon = drone.lat, drone.lon
        drone.update_position(dt=2.0)
        # Position should change (unless hover with tiny random)
        if drone.flight_pattern != "hover":
            assert (drone.lat != old_lat) or (drone.lon != old_lon)

    def test_update_position_drains_battery(self, drone):
        initial = drone.battery
        drone.update_position(dt=2.0)
        assert drone.battery < initial

    def test_battery_depletion_sets_lost(self, drone):
        drone.battery = 0.01
        drone.battery_drain = 1.0
        drone.update_position(dt=2.0)
        assert drone.status == "lost"

    def test_low_battery_sets_error(self, drone):
        drone.battery = 14.0
        drone.battery_drain = 0.0
        drone.speed = 10.0
        drone.update_position(dt=0.1)
        assert drone.status == "error"

    def test_lost_drone_no_update(self, drone):
        drone.status = "lost"
        old_lat = drone.lat
        drone.update_position(dt=2.0)
        assert drone.lat == old_lat

    def test_position_history_recorded(self, drone):
        assert len(drone.position_history) == 0
        drone.update_position(dt=2.0)
        assert len(drone.position_history) == 1
        entry = drone.position_history[0]
        assert "lat" in entry
        assert "lon" in entry
        assert "altitude" in entry
        assert "timestamp" in entry
        assert "status" in entry
        assert "battery" in entry

    def test_position_history_capped_at_100(self, drone):
        for _ in range(110):
            drone.update_position(dt=0.01)
        assert len(drone.position_history) <= 100

    def test_to_dict(self, drone):
        d = drone.to_dict()
        assert d["id"] == "TEST001"
        assert d["mac"] == "AA:BB:CC:DD:EE:01"
        assert d["name"] == "Test Drone"
        assert "latitude" in d
        assert "longitude" in d
        assert "altitude" in d
        assert "signal_strength" in d
        assert "battery" in d
        assert "speed" in d
        assert "status" in d
        assert "flight_pattern" in d
        assert "faa_data" in d

    def test_rssi_range(self, drone):
        rssi = drone.calculate_rssi()
        assert -90 <= rssi <= -30

    def test_altitude_stays_bounded(self, drone):
        for _ in range(200):
            drone.update_position(dt=0.1)
        assert 10 <= drone.altitude <= 400

    def test_get_history(self, drone):
        drone.update_position(dt=2.0)
        drone.update_position(dt=2.0)
        history = drone.get_history()
        assert len(history) == 2
        assert history is not drone.position_history  # returns copy


# ─── DroneFleet ───────────────────────────────────────────


class TestDroneFleet:
    def test_init_creates_5_drones(self, fleet):
        assert len(fleet.drones) == 5

    def test_init_center(self, fleet):
        assert fleet.center_lat == 50.1109
        assert fleet.center_lon == 8.6821

    def test_not_running_initially(self, fleet):
        assert fleet.running is False

    def test_start_stop(self, fleet):
        fleet.start(interval=0.1)
        assert fleet.running is True
        fleet.stop()
        assert fleet.running is False

    def test_double_start(self, fleet):
        fleet.start(interval=0.1)
        fleet.start(interval=0.1)  # should not error
        assert fleet.running is True

    def test_get_all_drones(self, fleet):
        drones = fleet.get_all_drones()
        assert len(drones) == 5
        assert all(isinstance(d, dict) for d in drones)

    def test_get_drone_existing(self, fleet):
        drone = fleet.get_drone("AZTEST001")
        assert drone is not None
        assert drone["name"] == "Desert Eagle"

    def test_get_drone_nonexistent(self, fleet):
        assert fleet.get_drone("NONEXISTENT") is None

    def test_get_drone_history_existing(self, fleet):
        history = fleet.get_drone_history("AZTEST001")
        assert history is not None
        assert isinstance(history, list)

    def test_get_drone_history_nonexistent(self, fleet):
        assert fleet.get_drone_history("NONEXISTENT") is None

    def test_get_drones_in_radius(self, fleet):
        # All drones start near center, large radius should get all
        drones = fleet.get_drones_in_radius(50.1109, 8.6821, 50000)
        assert len(drones) == 5
        # Each should have distance key
        assert all("distance" in d for d in drones)
        # Should be sorted by distance
        distances = [d["distance"] for d in drones]
        assert distances == sorted(distances)

    def test_get_drones_in_radius_small(self, fleet):
        # Very small radius might exclude some
        drones = fleet.get_drones_in_radius(50.1109, 8.6821, 1)
        assert len(drones) <= 5

    def test_set_center(self, fleet):
        fleet.set_center(48.0, 11.0)
        assert fleet.center_lat == 48.0
        assert fleet.center_lon == 11.0
        assert len(fleet.drones) == 5

    def test_set_center_reinitializes_drones(self, fleet):
        old_ids = [d.basic_id for d in fleet.drones]
        fleet.set_center(48.0, 11.0)
        new_ids = [d.basic_id for d in fleet.drones]
        assert old_ids == new_ids  # same drone configs

    def test_set_center_restarts_if_running(self, fleet):
        fleet.start(interval=0.1)
        fleet.set_center(48.0, 11.0)
        assert fleet.running is True

    def test_drone_configs(self):
        configs = DroneFleet.DRONE_CONFIGS
        assert len(configs) == 5
        ids = [c["basic_id"] for c in configs]
        assert len(set(ids)) == 5  # all unique

    def test_background_updates(self, fleet):
        fleet.start(interval=0.1)
        time.sleep(0.5)
        fleet.stop()
        # After running, at least some drones should have history
        total_history = sum(len(d.position_history) for d in fleet.drones)
        assert total_history > 0
