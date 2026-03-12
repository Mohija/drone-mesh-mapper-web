#!/usr/bin/env python3
"""Migrate existing JSON data (zones, trails, settings) into the SQLAlchemy database.

Usage:
    cd backend && python scripts/migrate_json_to_db.py

This script:
1. Gets or creates the default tenant
2. Imports all zones from data/zones/*.json
3. Imports all trail archives from data/archives/*.json
4. Imports settings from settings.json into TenantSettings
"""

import json
import os
import sys
import time
import logging

# Add backend dir to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
logger = logging.getLogger("migration")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZONES_DIR = os.path.join(BASE_DIR, "data", "zones")
ARCHIVES_DIR = os.path.join(BASE_DIR, "data", "archives")
SETTINGS_FILE = os.path.join(BASE_DIR, "settings.json")


def migrate_json_to_db():
    """Run the full JSON → DB migration."""
    from app import app
    from database import db
    from models import Tenant, TenantSettings, FlightZone, TrailArchive
    from settings import DEFAULT_SOURCES

    with app.app_context():
        # 1. Ensure default tenant
        tenant = Tenant.query.filter_by(name="default").first()
        if not tenant:
            tenant = Tenant(name="default", display_name="Standard")
            db.session.add(tenant)
            db.session.flush()
            settings = TenantSettings(tenant_id=tenant.id, sources=DEFAULT_SOURCES)
            db.session.add(settings)
            db.session.commit()
            logger.info("Created default tenant: %s", tenant.id)
        else:
            logger.info("Default tenant exists: %s", tenant.id)

        tenant_id = tenant.id
        stats = {"zones": 0, "archives": 0, "settings": False}

        # 2. Import zones
        if os.path.isdir(ZONES_DIR):
            for fname in os.listdir(ZONES_DIR):
                if not fname.endswith(".json"):
                    continue
                fpath = os.path.join(ZONES_DIR, fname)
                try:
                    with open(fpath) as f:
                        data = json.load(f)

                    zone_id = data.get("id", fname.replace(".json", ""))
                    # Skip if already in DB
                    if db.session.get(FlightZone, zone_id):
                        logger.info("Zone %s already in DB, skipping", zone_id)
                        continue

                    zone = FlightZone(
                        id=zone_id,
                        tenant_id=tenant_id,
                        name=data.get("name", "Unnamed"),
                        color=data.get("color", "#3b82f6"),
                        polygon=data.get("polygon", []),
                        min_altitude_agl=data.get("minAltitudeAGL"),
                        max_altitude_agl=data.get("maxAltitudeAGL"),
                        assigned_drones=data.get("assignedDrones", []),
                        created_at=data.get("createdAt", time.time()),
                        updated_at=data.get("updatedAt", time.time()),
                    )
                    db.session.add(zone)
                    stats["zones"] += 1
                    logger.info("Imported zone: %s (%s)", zone.name, zone.id)
                except Exception as e:
                    logger.warning("Failed to import zone %s: %s", fname, e)

        # 3. Import trail archives
        if os.path.isdir(ARCHIVES_DIR):
            for fname in os.listdir(ARCHIVES_DIR):
                if not fname.endswith(".json"):
                    continue
                fpath = os.path.join(ARCHIVES_DIR, fname)
                try:
                    with open(fpath) as f:
                        data = json.load(f)

                    archive_id = data.get("id", fname.replace(".json", ""))
                    # Skip if already in DB
                    if db.session.get(TrailArchive, archive_id):
                        logger.info("Archive %s already in DB, skipping", archive_id)
                        continue

                    archive = TrailArchive(
                        id=archive_id,
                        tenant_id=tenant_id,
                        drone_id=data.get("droneId", ""),
                        drone_name=data.get("droneName", "Unknown"),
                        source=data.get("source"),
                        color=data.get("color", "#3b82f6"),
                        trail=data.get("trail", []),
                        started_at=data.get("startedAt", time.time()),
                        archived_at=data.get("archivedAt", time.time()),
                        expires_at=data.get("expiresAt", time.time() + 604800),
                    )
                    db.session.add(archive)
                    stats["archives"] += 1
                    logger.info("Imported archive: %s (%s)", archive.drone_name, archive.id)
                except Exception as e:
                    logger.warning("Failed to import archive %s: %s", fname, e)

        # 4. Import settings
        if os.path.isfile(SETTINGS_FILE):
            try:
                with open(SETTINGS_FILE) as f:
                    settings_data = json.load(f)

                ts = TenantSettings.query.filter_by(tenant_id=tenant_id).first()
                if ts and "sources" in settings_data:
                    # Merge enabled/disabled flags into existing sources
                    for src_id, src_cfg in settings_data["sources"].items():
                        if src_id in ts.sources:
                            ts.sources[src_id]["enabled"] = src_cfg.get("enabled", False)
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(ts, "sources")
                    stats["settings"] = True
                    logger.info("Updated settings from settings.json")
            except Exception as e:
                logger.warning("Failed to import settings: %s", e)

        db.session.commit()
        logger.info(
            "Migration complete: %d zones, %d archives, settings=%s",
            stats["zones"], stats["archives"], stats["settings"],
        )
        return stats


if __name__ == "__main__":
    migrate_json_to_db()
