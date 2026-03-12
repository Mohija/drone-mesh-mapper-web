"""
Trail Archive — persists tracked flight trails in database with 7-day retention.
"""

import logging
import threading
import time
from contextlib import contextmanager

from flask import has_app_context

logger = logging.getLogger("trail_archive")

ARCHIVE_TTL = 7 * 86400  # 7 days
MAX_POINTS = 10000
CLEANUP_INTERVAL = 3600  # 1 hour


class TrailArchiveManager:
    def __init__(self, app=None, tenant_id=None):
        self._app = app
        self._default_tenant_id = tenant_id
        self._cleanup_timer = None

    def bind(self, app, tenant_id):
        self._app = app
        self._default_tenant_id = tenant_id
        self._schedule_cleanup()

    @contextmanager
    def _ctx(self):
        """Provide app context, reusing current one if available."""
        if has_app_context():
            yield
        elif self._app:
            with self._app.app_context():
                yield
        else:
            raise RuntimeError("No Flask app context available")

    def _schedule_cleanup(self):
        if self._cleanup_timer:
            self._cleanup_timer.cancel()
        self._cleanup_timer = threading.Timer(CLEANUP_INTERVAL, self._cleanup_expired)
        self._cleanup_timer.daemon = True
        self._cleanup_timer.start()

    def _cleanup_expired(self):
        from models import TrailArchive
        from database import db

        if not self._app:
            return
        try:
            with self._app.app_context():
                now = time.time()
                expired = TrailArchive.query.filter(TrailArchive.expires_at <= now).all()
                count = len(expired)
                for archive in expired:
                    db.session.delete(archive)
                db.session.commit()
                if count:
                    logger.info("Cleaned up %d expired archives", count)
        except Exception:
            logger.exception("Failed to clean up expired archives")
        self._schedule_cleanup()

    def list_archives(self, tenant_id=None) -> list[dict]:
        from models import TrailArchive
        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            now = time.time()
            archives = TrailArchive.query.filter(
                TrailArchive.tenant_id == tid,
                TrailArchive.expires_at > now,
            ).all()
            return [a.to_dict(include_trail=False) for a in archives]

    def get_archive(self, archive_id: str, tenant_id=None) -> dict | None:
        from models import TrailArchive
        from database import db
        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            archive = db.session.get(TrailArchive, archive_id)
            if not archive:
                return None
            if tid and archive.tenant_id != tid:
                return None
            return archive.to_dict(include_trail=True)

    def save_archive(self, data: dict, tenant_id=None) -> dict:
        from models import TrailArchive
        from database import db

        trail = data.get("trail", [])
        if len(trail) > MAX_POINTS:
            raise ValueError(f"Trail too large: {len(trail)} points (max {MAX_POINTS})")
        if len(trail) < 2:
            raise ValueError("Trail must have at least 2 points")

        tid = tenant_id or self._default_tenant_id
        now = time.time()

        with self._ctx():
            archive = TrailArchive(
                tenant_id=tid,
                drone_id=data.get("droneId", ""),
                drone_name=data.get("droneName", ""),
                source=data.get("source"),
                color=data.get("color", "#f97316"),
                trail=trail,
                started_at=data.get("startedAt", now),
                archived_at=now,
                expires_at=now + ARCHIVE_TTL,
            )
            db.session.add(archive)
            db.session.commit()
            result = archive.to_dict(include_trail=True)

        logger.info(
            "Archived trail %s: drone=%s points=%d",
            result["id"], result["droneId"], len(trail),
        )
        return result

    def delete_archive(self, archive_id: str, tenant_id=None) -> bool:
        from models import TrailArchive
        from database import db
        tid = tenant_id or self._default_tenant_id
        with self._ctx():
            archive = db.session.get(TrailArchive, archive_id)
            if not archive:
                return False
            if tid and archive.tenant_id != tid:
                return False
            db.session.delete(archive)
            db.session.commit()

        logger.info("Deleted archive %s", archive_id)
        return True
