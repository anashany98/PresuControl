import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase


def _env_int(name: str, default: int, minimum: int = 0) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer.") from exc
    if value < minimum:
        raise RuntimeError(f"{name} must be greater than or equal to {minimum}.")
    return value


def build_engine_kwargs(database_url: str) -> dict[str, int | bool]:
    kwargs: dict[str, int | bool] = {"pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        return kwargs
    kwargs.update({
        "pool_size": _env_int("DB_POOL_SIZE", 20, minimum=1),
        "max_overflow": _env_int("DB_MAX_OVERFLOW", 30, minimum=0),
        "pool_timeout": _env_int("DB_POOL_TIMEOUT", 30, minimum=1),
        "pool_recycle": _env_int("DB_POOL_RECYCLE", 3600, minimum=1),
    })
    return kwargs


# Credentials must be provided via DATABASE_URL environment variable
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required. Cannot connect to database without credentials.")

engine = create_engine(DATABASE_URL, **build_engine_kwargs(DATABASE_URL))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
