from fastapi import HTTPException

from app.routers.health import health_db


class BrokenSession:
    def execute(self, statement):
        raise RuntimeError("database unavailable")


def test_health_db_raises_503_when_database_fails():
    try:
        health_db(BrokenSession())
    except HTTPException as exc:
        assert exc.status_code == 503
        assert exc.detail["status"] == "error"
    else:
        raise AssertionError("health_db should raise HTTPException when the database is unavailable")
