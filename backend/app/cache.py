"""
In-memory cache for presupuesto counters and other lightweight data.

WARNING: This cache is per-process. When running with multiple uvicorn/gunicorn
workers (e.g., --workers N), each worker maintains its own cache instance,
so stale data is guaranteed across workers. For single-worker deployments
(workers=1) the cache works correctly.

If multi-worker deployment is needed, replace with Redis-based caching.
"""
from __future__ import annotations

import time
from threading import Lock


class MemoryCache:
    def __init__(self):
        self._store: dict[str, tuple[float, object]] = {}
        self._lock = Lock()

    def get(self, key: str, ttl: int = 30) -> object | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if time.time() > expires_at:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: object, ttl: int = 30):
        with self._lock:
            self._store[key] = (time.time() + ttl, value)

    def invalidate(self, prefix: str = ""):
        with self._lock:
            if prefix:
                keys = [k for k in self._store if k.startswith(prefix)]
                for k in keys:
                    del self._store[k]
            else:
                self._store.clear()


cache = MemoryCache()
