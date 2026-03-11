"""
Settings Manager - Loads/saves data source settings from settings.json.
Thread-safe read/write with default configuration.
"""

import json
import logging
import os
import threading

logger = logging.getLogger("settings")

DEFAULT_SETTINGS = {
    "sources": {
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
    }
}

SETTINGS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "settings.json")


class SettingsManager:
    """Thread-safe settings manager with file persistence."""

    def __init__(self):
        self._lock = threading.Lock()
        self._settings = self._load()

    def _load(self) -> dict:
        if os.path.exists(SETTINGS_FILE):
            try:
                with open(SETTINGS_FILE, "r") as f:
                    data = json.load(f)
                # Merge with defaults to ensure all keys exist
                merged = json.loads(json.dumps(DEFAULT_SETTINGS))
                if "sources" in data:
                    for src_id, src_cfg in data["sources"].items():
                        if src_id in merged["sources"]:
                            merged["sources"][src_id].update(src_cfg)
                logger.info("Settings loaded from %s", SETTINGS_FILE)
                return merged
            except Exception:
                logger.exception("Failed to load settings, using defaults")
        return json.loads(json.dumps(DEFAULT_SETTINGS))

    def _save(self):
        try:
            with open(SETTINGS_FILE, "w") as f:
                json.dump(self._settings, f, indent=2)
            logger.debug("Settings saved to %s", SETTINGS_FILE)
        except Exception:
            logger.exception("Failed to save settings")

    def get_all(self) -> dict:
        with self._lock:
            return json.loads(json.dumps(self._settings))

    def get_enabled_sources(self) -> list[str]:
        with self._lock:
            return [
                src_id
                for src_id, cfg in self._settings["sources"].items()
                if cfg.get("enabled", False)
            ]

    def update(self, updates: dict):
        with self._lock:
            if "sources" in updates:
                for src_id, src_cfg in updates["sources"].items():
                    if src_id in self._settings["sources"]:
                        self._settings["sources"][src_id].update(src_cfg)
            self._save()
        logger.info("Settings updated: enabled=%s", self.get_enabled_sources())
