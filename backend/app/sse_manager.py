"""Simple Server-Sent Events manager for real-time notifications."""
import asyncio
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class SSEManager:
    """Manages SSE connections and broadcasts events to all clients."""

    def __init__(self):
        self._queues: list[asyncio.Queue] = []
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue:
        """Register a new client. Returns an asyncio.Queue to listen on."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=50)
        async with self._lock:
            self._queues.append(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue):
        """Remove a client from the broadcast list."""
        async with self._lock:
            if queue in self._queues:
                self._queues.remove(queue)

    async def broadcast(self, event_type: str, data: dict):
        """Send an event to all connected clients."""
        payload = json.dumps({
            "type": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        async with self._lock:
            dead: list[asyncio.Queue] = []
            for q in self._queues:
                try:
                    q.put_nowait(payload)
                except asyncio.QueueFull:
                    dead.append(q)
            for q in dead:
                self._queues.remove(q)

    @property
    def client_count(self) -> int:
        return len(self._queues)

    def safe_broadcast(self, event_type: str, data: dict) -> None:
        """Schedule a broadcast if an event loop is running in this thread.
        Silently drops the event otherwise (e.g. when called from TestClient
        or a synchronous test that has no running event loop).
        """
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self.broadcast(event_type, data))


# Singleton
sse = SSEManager()
