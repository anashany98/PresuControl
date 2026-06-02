from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from .config import settings


def build_engine_kwargs(database_url: str) -> dict[str, int | bool]:
    kwargs: dict[str, int | bool] = {"pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        return kwargs
    kwargs.update({
        "pool_size": settings.db_pool_size,
        "max_overflow": settings.db_max_overflow,
        "pool_timeout": settings.db_pool_timeout,
        "pool_recycle": settings.db_pool_recycle,
    })
    return kwargs


engine = create_engine(settings.database_url, **build_engine_kwargs(settings.database_url))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
