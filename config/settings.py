"""Application settings and configuration helpers."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    """Central application configuration using environment variables."""

    app_name: str = "PyMasters"
    environment: str = Field("development", description="Current deployment environment")
    database_url: str = Field(
        "sqlite:///pymasters.db",
        env="DATABASE_URL",
        description="SQLAlchemy connection string for the primary database.",
    )
    sandbox_api_url: str = Field(
        "http://localhost:8001/execute",
        description="Endpoint for the secure Python execution sandbox service.",
    )
    recommendation_api_url: str = Field(
        "http://localhost:8002/recommendations",
        description="Endpoint for the recommendation engine service.",
    )
    asset_path: Path = Field(Path("assets"), description="Base path for static assets.")
    feature_flags: Optional[dict[str, bool]] = Field(
        default_factory=lambda: {
            "recommendations": True,
            "code_playground": True,
            "community_features": False,
        }
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Return a cached settings instance to avoid redundant parsing."""

    return Settings()


settings = get_settings()
