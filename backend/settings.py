"""
Settings Manager — reads/writes tenant settings from database.
Falls back to in-memory defaults when no DB is available (e.g. during import).
Thread-safe. Backward-compatible API.
"""

import json
import logging
import threading
from flask import has_app_context

logger = logging.getLogger("settings")

DEFAULT_SOURCES = {
    "simulator": {
        "enabled": True,
        "label": "Simulator",
        "description": "Simulierte Drohnen (lokal generiert)",
    },
    "opensky": {
        "enabled": False,
        "label": "OpenSky Network",
        "description": "ADS-B Flugzeug- und UAV-Daten (opensky-network.org)",
    },
    "adsbfi": {
        "enabled": False,
        "label": "adsb.fi",
        "description": "ADS-B Tracking via adsb.fi Community-Netzwerk",
    },
    "adsblol": {
        "enabled": False,
        "label": "adsb.lol",
        "description": "ADS-B Tracking via adsb.lol Community-Netzwerk",
    },
    "ogn": {
        "enabled": False,
        "label": "Open Glider Network",
        "description": "Gleiter und Kleinfluggeraete (experimental)",
    },
    "receiver": {
        "enabled": False,
        "label": "Empfänger",
        "description": "Hardware-Empfänger (ESP32/ESP8266) für Open Drone ID",
    },
}


def _deep_copy(d):
    return json.loads(json.dumps(d))


class SettingsManager:
    """Thread-safe settings manager backed by TenantSettings DB model."""

    def __init__(self):
        self._lock = threading.Lock()
        self._tenant_id = None
        self._app = None
        self._mem_settings = {"sources": _deep_copy(DEFAULT_SOURCES)}
        self._versions: dict[str, int] = {}  # tenant_id -> version counter

    def get_version(self, tenant_id=None) -> int:
        """Return current settings version for a tenant."""
        tid = tenant_id or self._tenant_id or "__default__"
        return self._versions.get(tid, 0)

    def _bump_version(self, tenant_id=None):
        """Increment settings version so clients know to refetch."""
        tid = tenant_id or self._tenant_id or "__default__"
        self._versions[tid] = self._versions.get(tid, 0) + 1

    def bind(self, tenant_id: str, app):
        """Bind this manager to a specific tenant and Flask app."""
        self._tenant_id = tenant_id
        self._app = app
        logger.info("SettingsManager bound to tenant %s", tenant_id)

    def _ensure_context(self):
        """Return a context manager for app context, or None if already in one."""
        if has_app_context():
            return None
        if self._app:
            return self._app.app_context()
        return None

    def _read_from_db(self, tenant_id):
        """Read settings from DB and merge with defaults."""
        from models import TenantSettings
        ts = TenantSettings.query.filter_by(tenant_id=tenant_id).first()
        if ts:
            merged = _deep_copy(DEFAULT_SOURCES)
            if ts.sources:
                for src_id, src_cfg in ts.sources.items():
                    if src_id in merged:
                        merged[src_id].update(src_cfg)
            return {
                "sources": merged,
                "center_lat": ts.center_lat,
                "center_lon": ts.center_lon,
                "radius": ts.radius,
            }
        return {"sources": _deep_copy(DEFAULT_SOURCES)}

    def get_all(self, tenant_id=None) -> dict:
        """Get all settings."""
        tid = tenant_id or self._tenant_id
        if tid and self._app:
            try:
                ctx = self._ensure_context()
                if ctx:
                    with ctx:
                        return self._read_from_db(tid)
                else:
                    return self._read_from_db(tid)
            except Exception:
                pass
        with self._lock:
            return _deep_copy(self._mem_settings)

    def get_enabled_sources(self, tenant_id=None) -> list[str]:
        """Get list of enabled source IDs."""
        settings = self.get_all(tenant_id=tenant_id)
        return [
            src_id
            for src_id, cfg in settings.get("sources", {}).items()
            if cfg.get("enabled", False)
        ]

    def update(self, updates: dict, tenant_id=None):
        """Update settings."""
        tid = tenant_id or self._tenant_id
        if tid and self._app:
            try:
                ctx = self._ensure_context()
                if ctx:
                    with ctx:
                        self._write_to_db(tid, updates)
                else:
                    self._write_to_db(tid, updates)
                self._bump_version(tid)
                logger.info("Settings updated for tenant %s (v%d): enabled=%s",
                            tid, self.get_version(tid), self.get_enabled_sources(tenant_id=tid))
                return
            except Exception:
                logger.exception("Failed to update settings in DB")

        # In-memory fallback
        with self._lock:
            if "sources" in updates:
                for src_id, src_cfg in updates["sources"].items():
                    if src_id in self._mem_settings["sources"]:
                        self._mem_settings["sources"][src_id].update(src_cfg)
        self._bump_version(tenant_id)
        logger.info("Settings updated (in-memory, v%d): enabled=%s",
                    self.get_version(tenant_id), self.get_enabled_sources())

    def _write_to_db(self, tenant_id, updates):
        """Write settings update to DB."""
        from models import TenantSettings
        from database import db
        ts = TenantSettings.query.filter_by(tenant_id=tenant_id).first()
        if ts:
            if "sources" in updates:
                current = _deep_copy(ts.sources) if ts.sources else _deep_copy(DEFAULT_SOURCES)
                for src_id, src_cfg in updates["sources"].items():
                    if src_id in current:
                        current[src_id].update(src_cfg)
                ts.sources = current
            if "center_lat" in updates:
                ts.center_lat = updates["center_lat"]
            if "center_lon" in updates:
                ts.center_lon = updates["center_lon"]
            if "radius" in updates:
                ts.radius = updates["radius"]
            db.session.commit()
