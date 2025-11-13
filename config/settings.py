"""Application settings and configuration helpers."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    mongodb_uri: Optional[str] = Field(
        default=None,
        env="mongodb_uri",
        description="Optional MongoDB connection string for auxiliary services.",
    )
    mongodb_db: Optional[str] = Field(
        default=None,
        env="mongodb_db",
        description="Optional MongoDB database name for auxiliary services.",
    )
    huggingfacehub_api_token: Optional[str] = Field(
        default=None,
        env="HUGGINGFACEHUB_API_TOKEN",
        description="API token for Hugging Face Inference endpoints.",
    )
    oauth_client_id: Optional[str] = Field(
        default=None,
        env="CLIENT_ID",
        description="OAuth client ID for external providers (read from .env or Streamlit secrets).",
    )
    oauth_client_secret: Optional[str] = Field(
        default=None,
        env="CLIENT_SECRET",
        description="OAuth client secret for external providers (read from .env or Streamlit secrets).",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    """Return a cached settings instance to avoid redundant parsing."""

    return Settings()


settings = get_settings()
