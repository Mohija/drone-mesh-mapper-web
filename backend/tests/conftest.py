"""Shared pytest fixtures for backend tests."""

import sys
import os
import pytest

# Add backend dir to path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import app as flask_app
from drone_simulator import DroneFleet, DroneSimulator
from settings import SettingsManager, SETTINGS_FILE
from providers import ProviderRegistry


@pytest.fixture(autouse=True)
def reset_settings_to_simulator_only():
    """Ensure only simulator is enabled before each test."""
    from app import settings as app_settings
    app_settings.update({
        "sources": {
            "simulator": {"enabled": True},
            "opensky": {"enabled": False},
            "adsbfi": {"enabled": False},
            "adsblol": {"enabled": False},
            "ogn": {"enabled": False},
        }
    })
    yield


@pytest.fixture
def app():
    """Create Flask app for testing."""
    flask_app.config["TESTING"] = True
    yield flask_app


@pytest.fixture
def client(app):
    """Create Flask test client."""
    return app.test_client()


@pytest.fixture
def fleet():
    """Create a DroneFleet for testing (not started)."""
    f = DroneFleet(center_lat=50.1109, center_lon=8.6821)
    yield f
    f.stop()


@pytest.fixture
def drone():
    """Create a single DroneSimulator for testing."""
    return DroneSimulator(
        drone_id=1,
        name="Test Drone",
        mac="AA:BB:CC:DD:EE:01",
        basic_id="TEST001",
        center_lat=50.1109,
        center_lon=8.6821,
    )


@pytest.fixture
def settings_manager():
    """Create a SettingsManager for testing."""
    return SettingsManager()


@pytest.fixture
def registry(fleet):
    """Create a ProviderRegistry with a test fleet."""
    return ProviderRegistry(fleet)
