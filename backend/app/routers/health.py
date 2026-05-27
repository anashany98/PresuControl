from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import get_db

router = APIRouter()


@router.get("/health")
def health():
    """Liveness probe: el proceso está vivo."""
    return {"status": "ok", "service": "PresuControl"}


@router.get("/health/db")
def health_db(db: Session = Depends(get_db)):
    """Readiness probe: la base de datos responde."""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception:
        raise HTTPException(
            status_code=503,
            detail={"status": "error", "database": "unavailable"},
        )
