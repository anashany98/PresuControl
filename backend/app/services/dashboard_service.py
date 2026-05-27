from __future__ import annotations

from sqlalchemy.orm import Session

from ..analytics import build_dashboard_payload, build_sidebar_counters


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def get_dashboard(self, gestor: str | None = None) -> dict:
        return build_dashboard_payload(self.db, gestor=gestor)

    def get_sidebar_counters(self, user_id: int | None = None) -> dict:
        return build_sidebar_counters(self.db, user_id)
