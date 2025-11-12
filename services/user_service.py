"""User service for profile management."""
from __future__ import annotations

from typing import Optional

from models import User
from services.auth_service import AuthService


class UserService:
    def __init__(self, auth_service: AuthService | None = None) -> None:
        self._auth_service = auth_service or AuthService()

    def get_user(self, user_id: int) -> Optional[User]:
        return self._auth_service.get_user(user_id)

    def update_user(self, user: User) -> User:
        # In a real application this would persist to the database.
        return user
