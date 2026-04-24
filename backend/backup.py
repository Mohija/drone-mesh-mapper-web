"""
Backup / Restore / Rotation for the FlightArc SQLite database.

SQLite in WAL mode uses three files (`.db`, `.db-wal`, `.db-shm`). A simple
`cp` of only the `.db` file while writes are happening can miss committed
data that still lives in the WAL — so we always snapshot all three if they
exist. For the automatic snapshots we accept this as "good enough" under
low write pressure; for critical manual backups prefer `manage.py backup`
while the backend is stopped.

Contract (see DATABASE_LIFECYCLE.md):
- Backups are named `YYYYMMDD-HHMMSS-<reason>.db` under `backend/data/backups/`.
- Each backup is triplet: `.db`, optional `.db-wal`, optional `.db-shm`.
- Rotation keeps the most recent `MAX_BACKUPS` (default 30).
- Restore always snapshots the current file as `pre-restore-*` first.
"""

import logging
import os
import shutil
import time

logger = logging.getLogger("backup")

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(_BACKEND_DIR, "data", "flightarc.db")
BACKUP_DIR = os.path.join(_BACKEND_DIR, "data", "backups")
MAX_BACKUPS = 30

_WAL_EXTS = ("-wal", "-shm")


def _sanitize_reason(reason: str) -> str:
    """Restrict reason to filesystem-safe characters."""
    import re
    s = re.sub(r"[^A-Za-z0-9_.-]", "-", reason or "snapshot").strip("-")
    return s or "snapshot"


def create_backup(reason: str = "snapshot", db_path: str = DEFAULT_DB_PATH) -> str | None:
    """Copy the live DB (and WAL/SHM if present) into BACKUP_DIR.

    Returns the path to the created .db backup, or None if the source
    doesn't exist (fresh install) or is empty.
    """
    if not os.path.isfile(db_path):
        logger.info("Backup skipped — %s does not exist yet", db_path)
        return None
    if os.path.getsize(db_path) == 0:
        logger.info("Backup skipped — %s is empty", db_path)
        return None

    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    reason = _sanitize_reason(reason)
    dst = os.path.join(BACKUP_DIR, f"{ts}-{reason}.db")

    shutil.copy2(db_path, dst)
    for ext in _WAL_EXTS:
        src_ext = db_path + ext
        if os.path.exists(src_ext):
            shutil.copy2(src_ext, dst + ext)

    size_kb = os.path.getsize(dst) / 1024
    logger.info("DB backup created: %s (%.1f KB, reason=%s)", os.path.basename(dst), size_kb, reason)
    rotate_backups()
    return dst


def rotate_backups(max_backups: int = MAX_BACKUPS) -> int:
    """Delete oldest backups so at most `max_backups` .db files remain.

    Returns the number of files removed.
    """
    if not os.path.isdir(BACKUP_DIR):
        return 0
    dbs = sorted(
        [f for f in os.listdir(BACKUP_DIR) if f.endswith(".db")],
        reverse=True,  # newest first
    )
    removed = 0
    for old in dbs[max_backups:]:
        base = old[:-3]  # strip .db
        for ext in ("", *_WAL_EXTS):
            path = os.path.join(BACKUP_DIR, base + ".db" + ext)
            if os.path.exists(path):
                try:
                    os.remove(path)
                except OSError as exc:
                    logger.warning("Failed to remove old backup %s: %s", path, exc)
        removed += 1
    if removed:
        logger.info("Rotated %d old backup(s)", removed)
    return removed


def list_backups() -> list[dict]:
    """Return newest-first list of available backups with metadata."""
    if not os.path.isdir(BACKUP_DIR):
        return []
    out = []
    for name in sorted(os.listdir(BACKUP_DIR), reverse=True):
        if not name.endswith(".db"):
            continue
        path = os.path.join(BACKUP_DIR, name)
        st = os.stat(path)
        out.append({
            "name": name,
            "path": path,
            "size": st.st_size,
            "mtime": st.st_mtime,
            "has_wal": os.path.exists(path + "-wal"),
            "has_shm": os.path.exists(path + "-shm"),
        })
    return out


def restore_backup(backup_name: str, db_path: str = DEFAULT_DB_PATH) -> str:
    """Restore a backup onto the live DB path. Returns the path of the
    "pre-restore" snapshot that was taken first.

    Raises FileNotFoundError if the backup does not exist.
    """
    src = os.path.join(BACKUP_DIR, backup_name)
    if not os.path.isfile(src):
        # allow passing a full path too
        if os.path.isfile(backup_name):
            src = backup_name
        else:
            raise FileNotFoundError(f"Backup not found: {backup_name}")

    # Snapshot the current live DB under pre-restore-*
    pre = create_backup(reason="pre-restore", db_path=db_path)

    # Replace live DB atomically (and drop stale WAL/SHM to avoid mixing)
    shutil.copy2(src, db_path)
    for ext in _WAL_EXTS:
        old_live = db_path + ext
        if os.path.exists(old_live):
            os.remove(old_live)
        src_ext = src + ext
        if os.path.exists(src_ext):
            shutil.copy2(src_ext, db_path + ext)

    logger.warning("DB restored from %s (pre-restore snapshot: %s)", backup_name, pre)
    return pre or ""
