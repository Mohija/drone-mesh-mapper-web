"""Shared pytest fixtures for backend tests.

SAFETY: These tests DELETE non-default tenants and non-admin users between runs.
They MUST NOT run against the production DB. We redirect DATABASE_URL to a
throw-away temp file BEFORE importing the app — once a production-DB URI
reaches the app module it is too late to swap.
"""

import sys
import os
import tempfile
import atexit
import pytest

# Add backend dir to path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# --- DB isolation (must happen before importing `app`) --------------------
_test_db_fd, _test_db_path = tempfile.mkstemp(prefix="flightarc-test-", suffix=".db")
os.close(_test_db_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db_path}"

def _cleanup_test_db():
    for suffix in ("", "-wal", "-shm"):
        p = _test_db_path + suffix
        try:
            os.remove(p)
        except OSError:
            pass
atexit.register(_cleanup_test_db)

# Sanity check — blow up loudly rather than silently trashing production data
_PRODUCTION_DB = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "data", "flightarc.db"
)
_PRODUCTION_DB = os.path.realpath(_PRODUCTION_DB)
assert os.path.realpath(_test_db_path) != _PRODUCTION_DB, \
    "Test DB must not be the production file"

from database import db, init_db
from drone_simulator import DroneFleet, DroneSimulator
from settings import SettingsManager, DEFAULT_SOURCES
from providers import ProviderRegistry
from auth import seed_super_admin


@pytest.fixture(autouse=True)
def setup_test_db():
    """Set up in-memory SQLite database for each test."""
    from app import app as flask_app

    # Re-initialize for in-memory DB for tests
    # The app already has db initialized, we just need to ensure clean state
    with flask_app.app_context():
        from models import Tenant, TenantSettings
        db.create_all()

        # Ensure default tenant exists
        default_tenant = Tenant.query.filter_by(name="default").first()
        if not default_tenant:
            default_tenant = Tenant(name="default", display_name="Standard")
            db.session.add(default_tenant)
            db.session.flush()
            default_settings = TenantSettings(
                tenant_id=default_tenant.id,
                sources=DEFAULT_SOURCES,
            )
            db.session.add(default_settings)
            db.session.commit()

    # Ensure super admin exists
    seed_super_admin(flask_app)

    yield

    # Clean up test data after each test.
    # Hard-guard: refuse to run this destructive cleanup against the production DB.
    active_uri = flask_app.config.get("SQLALCHEMY_DATABASE_URI", "")
    if _PRODUCTION_DB in active_uri:
        pytest.exit(
            f"Refusing to run test cleanup — DB URI points at production file:\n  {active_uri}\n"
            "Make sure DATABASE_URL is overridden before `app` is imported."
        )

    with flask_app.app_context():
        from models import FlightZone, TrailArchive as TrailArchiveModel, User, Tenant, TenantSettings, SystemLog
        # Delete zones, archives, and logs for default tenant
        FlightZone.query.delete()
        TrailArchiveModel.query.delete()
        SystemLog.query.delete()
        # Clean up non-admin users (keep only the seeded admin)
        User.query.filter(User.username != "admin").delete()
        db.session.flush()
        # Clean up non-default tenants (delete one by one for ORM cascade)
        for t in Tenant.query.filter(Tenant.name != "default").all():
            db.session.delete(t)
        db.session.commit()


@pytest.fixture(autouse=True)
def reset_settings_to_simulator_only():
    """Ensure only simulator is enabled and center matches fleet location before each test."""
    from app import settings as app_settings
    app_settings.update({
        "sources": {
            "simulator": {"enabled": True},
            "opensky": {"enabled": False},
            "adsbfi": {"enabled": False},
            "adsblol": {"enabled": False},
            "ogn": {"enabled": False},
        },
        "center_lat": 52.0302,
        "center_lon": 8.5325,
        "radius": 50000.0,
    })
    yield


@pytest.fixture
def app():
    """Create Flask app for testing."""
    from app import app as flask_app
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


@pytest.fixture
def default_tenant_id(app):
    """Return the default tenant ID."""
    with app.app_context():
        from models import Tenant
        tenant = Tenant.query.filter_by(name="default").first()
        return tenant.id


@pytest.fixture
def auth_headers(client):
    """Login as super_admin and return auth headers for API calls."""
    res = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin",
    })
    token = res.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
