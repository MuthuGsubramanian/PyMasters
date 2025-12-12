"""Database engine setup for future persistence needs."""
from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from config.settings import settings

ENGINE = create_engine(settings.database_url, future=True, echo=False)
SessionLocal = sessionmaker(bind=ENGINE, autoflush=False, autocommit=False)

__all__ = ["ENGINE", "SessionLocal"]
