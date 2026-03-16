"""
Database Logging Handler — stores log records in the SystemLog DB table.
Buffers entries and flushes periodically to avoid per-line DB writes.
Supports per-tenant log levels.
"""

import logging
import threading
import time

# Log level name -> numeric priority (lower = more verbose)
LEVEL_PRIORITY = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
}

MAX_LOGS_PER_TENANT = 10000


class DatabaseLogHandler(logging.Handler):
    """Logging handler that stores log records in the SystemLog DB table."""

    def __init__(self, app):
        super().__init__()
        self._app = app
        self._buffer: list[dict] = []
        self._lock = threading.Lock()
        self._flush_interval = 2.0  # seconds
        self._max_buffer = 100
        self._tenant_levels: dict[str, int] = {}  # tenant_id -> numeric level
        self._running = True
        self._start_flush_thread()

    def _start_flush_thread(self):
        """Start daemon thread that periodically flushes buffered entries."""
        t = threading.Thread(target=self._flush_loop, daemon=True, name="db-log-flush")
        t.start()

    def _flush_loop(self):
        """Periodically flush buffered log entries to DB."""
        while self._running:
            time.sleep(self._flush_interval)
            self._flush()

    def emit(self, record: logging.LogRecord):
        """Buffer a log entry. Resolves tenant_id from extras or Flask g context."""
        tenant_id = getattr(record, "tenant_id", None)

        # Auto-resolve tenant_id from Flask request context (g.tenant_id)
        if not tenant_id:
            try:
                from flask import g, has_request_context
                if has_request_context():
                    tenant_id = getattr(g, "tenant_id", None)
            except Exception:
                pass

        if not tenant_id:
            return

        # Check per-tenant log level
        min_level = self._tenant_levels.get(tenant_id, logging.INFO)
        if record.levelno < min_level:
            return

        entry = {
            "tenant_id": tenant_id,
            "timestamp": time.time(),
            "level": record.levelname.lower(),
            "module": record.name,
            "message": record.getMessage(),
            "details": getattr(record, "details", None),
        }

        with self._lock:
            self._buffer.append(entry)
            if len(self._buffer) >= self._max_buffer:
                self._do_flush()

    def _flush(self):
        """Flush buffered entries (called from flush thread)."""
        with self._lock:
            self._do_flush()

    def _do_flush(self):
        """Write buffered entries to DB. Must be called while holding self._lock."""
        if not self._buffer:
            return

        entries = self._buffer[:]
        self._buffer.clear()

        try:
            with self._app.app_context():
                from models import SystemLog
                from database import db

                for entry in entries:
                    log = SystemLog(
                        tenant_id=entry["tenant_id"],
                        timestamp=entry["timestamp"],
                        level=entry["level"],
                        module=entry["module"],
                        message=entry["message"],
                        details=entry["details"],
                    )
                    db.session.add(log)
                db.session.commit()

                # Auto-prune: keep only MAX_LOGS_PER_TENANT per tenant
                tenant_ids = set(e["tenant_id"] for e in entries)
                for tid in tenant_ids:
                    count = SystemLog.query.filter_by(tenant_id=tid).count()
                    if count > MAX_LOGS_PER_TENANT:
                        excess = count - MAX_LOGS_PER_TENANT
                        oldest = (
                            SystemLog.query
                            .filter_by(tenant_id=tid)
                            .order_by(SystemLog.timestamp.asc())
                            .limit(excess)
                            .all()
                        )
                        for old in oldest:
                            db.session.delete(old)
                        db.session.commit()
        except Exception:
            # Avoid recursive logging — silently drop on error
            pass

    def set_tenant_level(self, tenant_id: str, level: str):
        """Set the minimum log level for a specific tenant."""
        numeric = LEVEL_PRIORITY.get(level.lower(), logging.INFO)
        self._tenant_levels[tenant_id] = numeric

    def get_tenant_level(self, tenant_id: str) -> str:
        """Get the current log level name for a tenant."""
        numeric = self._tenant_levels.get(tenant_id, logging.INFO)
        for name, val in LEVEL_PRIORITY.items():
            if val == numeric:
                return name
        return "info"

    def stop(self):
        """Stop the flush thread and flush remaining entries."""
        self._running = False
        self._flush()
