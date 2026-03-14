"""
Connection Log — In-memory ring buffer for receiver communication telemetry.
Logs heartbeats, ingest requests, and auth failures.
Can be toggled on/off via API.
"""

import time
import threading
from collections import deque

MAX_LOG_ENTRIES = 500  # Per tenant
MAX_PER_RECEIVER = 100


class ConnectionLogEntry:
    __slots__ = (
        "timestamp", "receiver_id", "receiver_name", "tenant_id",
        "endpoint", "method", "http_status", "error",
        "detections_count", "ip", "firmware_version", "hardware_type",
        "wifi_ssid", "wifi_rssi", "wifi_channel", "free_heap", "uptime_seconds",
        "ap_active", "error_count", "last_http_code",
    )

    def __init__(self, **kwargs):
        for slot in self.__slots__:
            setattr(self, slot, kwargs.get(slot))

    def to_dict(self):
        return {s: getattr(self, s) for s in self.__slots__ if getattr(self, s) is not None}


class ConnectionLog:
    def __init__(self):
        self._enabled: dict[str, bool] = {}  # per tenant
        self._logs: dict[str, deque] = {}     # tenant_id -> deque of entries
        self._lock = threading.Lock()

    def is_enabled(self, tenant_id: str) -> bool:
        return self._enabled.get(tenant_id, False)

    def enable(self, tenant_id: str):
        with self._lock:
            self._enabled[tenant_id] = True
            if tenant_id not in self._logs:
                self._logs[tenant_id] = deque(maxlen=MAX_LOG_ENTRIES)

    def disable(self, tenant_id: str):
        with self._lock:
            self._enabled[tenant_id] = False

    def clear(self, tenant_id: str):
        with self._lock:
            if tenant_id in self._logs:
                self._logs[tenant_id].clear()

    def log(self, tenant_id: str, **kwargs):
        """Add a log entry if logging is enabled for this tenant."""
        if not self._enabled.get(tenant_id, False):
            return
        entry = ConnectionLogEntry(
            timestamp=time.time(),
            tenant_id=tenant_id,
            **kwargs,
        )
        with self._lock:
            if tenant_id not in self._logs:
                self._logs[tenant_id] = deque(maxlen=MAX_LOG_ENTRIES)
            self._logs[tenant_id].append(entry)

    def get_all(self, tenant_id: str, limit: int = 100) -> list[dict]:
        """Get all log entries for a tenant (newest first)."""
        with self._lock:
            entries = list(self._logs.get(tenant_id, []))
        entries.reverse()
        return [e.to_dict() for e in entries[:limit]]

    def get_for_receiver(self, tenant_id: str, receiver_id: str, limit: int = 50) -> list[dict]:
        """Get log entries for a specific receiver (newest first)."""
        with self._lock:
            entries = [
                e for e in self._logs.get(tenant_id, [])
                if e.receiver_id == receiver_id
            ]
        entries.reverse()
        return [e.to_dict() for e in entries[:limit]]


# Singleton
connection_log = ConnectionLog()
