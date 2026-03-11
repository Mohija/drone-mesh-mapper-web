"""
Trail Archive — persists tracked flight trails as JSON files for up to 7 days.
"""

import json
import logging
import os
import threading
import time
import uuid

logger = logging.getLogger("trail_archive")

ARCHIVE_TTL = 7 * 86400  # 7 days
MAX_POINTS = 10000
CLEANUP_INTERVAL = 3600  # 1 hour


class TrailArchive:
    def __init__(self, data_dir: str):
        self._dir = data_dir
        self._lock = threading.Lock()
        self._index: dict[str, dict] = {}
        os.makedirs(data_dir, exist_ok=True)
        self._load_index()
        self._schedule_cleanup()

    def _load_index(self):
        """Scan JSON files and build in-memory index (metadata only)."""
        count = 0
        for fname in os.listdir(self._dir):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(self._dir, fname)
            try:
                with open(path, "r") as f:
                    data = json.load(f)
                archive_id = data.get("id", fname.replace(".json", ""))
                self._index[archive_id] = {
                    "id": archive_id,
                    "droneId": data.get("droneId", ""),
                    "droneName": data.get("droneName", ""),
                    "source": data.get("source"),
                    "color": data.get("color", "#f97316"),
                    "startedAt": data.get("startedAt", 0),
                    "archivedAt": data.get("archivedAt", 0),
                    "expiresAt": data.get("expiresAt", 0),
                    "pointCount": len(data.get("trail", [])),
                }
                count += 1
            except Exception as e:
                logger.warning("Failed to load archive %s: %s", fname, e)
        if count:
            logger.info("Loaded %d archived trails", count)

    def list_archives(self) -> list[dict]:
        with self._lock:
            now = time.time()
            return [
                m for m in self._index.values()
                if m.get("expiresAt", 0) > now
            ]

    def get_archive(self, archive_id: str) -> dict | None:
        with self._lock:
            if archive_id not in self._index:
                return None
        path = os.path.join(self._dir, f"{archive_id}.json")
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.warning("Failed to read archive %s: %s", archive_id, e)
            return None

    def save_archive(self, data: dict) -> dict:
        trail = data.get("trail", [])
        if len(trail) > MAX_POINTS:
            raise ValueError(f"Trail too large: {len(trail)} points (max {MAX_POINTS})")
        if len(trail) < 2:
            raise ValueError("Trail must have at least 2 points")

        archive_id = str(uuid.uuid4())[:8]
        now = time.time()
        archive = {
            "id": archive_id,
            "droneId": data.get("droneId", ""),
            "droneName": data.get("droneName", ""),
            "source": data.get("source"),
            "color": data.get("color", "#f97316"),
            "trail": trail,
            "startedAt": data.get("startedAt", now),
            "archivedAt": now,
            "expiresAt": now + ARCHIVE_TTL,
        }

        path = os.path.join(self._dir, f"{archive_id}.json")
        with open(path, "w") as f:
            json.dump(archive, f)

        meta = {k: v for k, v in archive.items() if k != "trail"}
        meta["pointCount"] = len(trail)

        with self._lock:
            self._index[archive_id] = meta

        logger.info(
            "Archived trail %s: drone=%s points=%d",
            archive_id, archive["droneId"], len(trail),
        )
        return archive

    def delete_archive(self, archive_id: str) -> bool:
        with self._lock:
            if archive_id not in self._index:
                return False
            del self._index[archive_id]
        path = os.path.join(self._dir, f"{archive_id}.json")
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        logger.info("Deleted archive %s", archive_id)
        return True

    def _cleanup_expired(self):
        now = time.time()
        expired = []
        with self._lock:
            for aid, meta in list(self._index.items()):
                if meta.get("expiresAt", 0) <= now:
                    expired.append(aid)
                    del self._index[aid]
        for aid in expired:
            path = os.path.join(self._dir, f"{aid}.json")
            try:
                os.remove(path)
            except FileNotFoundError:
                pass
        if expired:
            logger.info("Cleaned up %d expired archives", len(expired))
        self._schedule_cleanup()

    def _schedule_cleanup(self):
        t = threading.Timer(CLEANUP_INTERVAL, self._cleanup_expired)
        t.daemon = True
        t.start()
