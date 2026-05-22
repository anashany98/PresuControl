from __future__ import annotations

import json
import logging
import os
import time
import uuid
from contextvars import ContextVar
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("presucontrol.access")
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


def get_request_id() -> str:
    return request_id_ctx.get()


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware que registra cada request en formato JSON estructurado."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = str(uuid.uuid4())[:8]
        request_id_ctx.set(request_id)
        start = time.monotonic()

        user_email = getattr(getattr(request.state, "user", None), "email", None)

        response: Response | None = None
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        except Exception:
            status_code = 500
            raise
        finally:
            elapsed_ms = round((time.monotonic() - start) * 1000, 2)
            log_entry = {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": status_code,
                "duration_ms": elapsed_ms,
                "user": user_email,
                "client_ip": request.client.host if request.client else None,
            }
            level = logging.WARNING if status_code >= 400 else logging.INFO
            logger.log(level, json.dumps(log_entry, default=str))
