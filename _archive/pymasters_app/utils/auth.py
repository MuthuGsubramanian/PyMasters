"""Authentication and session utilities for PyMasters."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID, uuid4

import bcrypt
import streamlit as st

from pymasters_app.utils.user_store import UserStore


class AuthManager:
    """Encapsulate DuckDB-backed authentication helpers."""

    def __init__(self, database: Any, user_store: UserStore | None = None) -> None:
        self._db = database
        self._user_store = user_store or UserStore()
        self._sessions = database["sessions"]
        self._ensure_session_indexes()

    def _ensure_session_indexes(self) -> None:
        self._sessions.create_index("session_id", unique=True)
        self._sessions.create_index("user_id")

    # ------------------------------------------------------------------
    # Session helpers
    # ------------------------------------------------------------------
    def get_current_user(self) -> Optional[dict[str, Any]]:
        """Return the current user stored in session state."""
        user = st.session_state.get("user")
        if user:
            self._touch_session()
        return user

    def _touch_session(self) -> None:
        session_id = st.session_state.get("session_id")
        if not session_id:
            return
        self._sessions.update_one(
            {"session_id": session_id},
            {"$set": {"last_active": datetime.utcnow()}},
            upsert=True,
        )

    def logout(self) -> None:
        """Terminate the active session."""
        session_id = st.session_state.get("session_id")
        if session_id:
            self._sessions.delete_one({"session_id": session_id})
        st.session_state.pop("user", None)
        st.session_state.pop("session_id", None)
        st.session_state["current_page"] = "Login"

    # ------------------------------------------------------------------
    # User management
    # ------------------------------------------------------------------
    def ensure_super_admin(self) -> None:
        """Seed a default super administrator if missing."""

        username = "founder"
        normalized_username = self._normalize_username(username)
        if self._user_store.get_by_username(normalized_username):
            return

        password_hash = self._hash_password("Password@123")
        user_doc = {
            "id": str(uuid4()),
            "name": "Muthu G Subramanian",
            "username": username,
            "username_normalized": normalized_username,
            "email": "muthu.g.subramanian@pymasters.local",
            "phone": None,
            "phone_normalized": None,
            "password_hash": password_hash,
            "role": "superadmin",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        self._user_store.insert(user_doc)

    def login(self, *, identifier: str, password: str) -> Optional[dict[str, Any]]:
        """Authenticate using the unique user ID (case-insensitive)."""

        lookup = self._normalize_username(identifier)
        if not lookup:
            return None
        record = self._user_store.get_by_username(lookup)
        if not record:
            return None
        if not self._verify_password(password, record["password_hash"]):
            return None

        user = self._serialize_user(record)
        self._start_session(user)
        return user

    def signup(
        self,
        *,
        name: str,
        username: str,
        password: str,
        email: Optional[str] = None,
        phone: Optional[str] = None,
    ) -> tuple[bool, Optional[dict[str, Any]], str | None]:
        username_normalized = self._normalize_username(username)
        if not username_normalized:
            return False, None, "Please choose a valid user ID."

        if self._user_store.get_by_username(username_normalized):
            return False, None, "That user ID is already taken."

        email_normalized = self._normalize_email(email)
        if email_normalized and self._user_store.get_by_email(email_normalized):
            return False, None, "An account with that email already exists."

        phone_normalized = self._normalize_phone(phone)
        if phone_normalized and self._user_store.get_by_phone(phone_normalized):
            return False, None, "That phone number is already linked to another account."

        user_doc = {
            "id": str(uuid4()),
            "name": name.strip(),
            "username": username.strip(),
            "username_normalized": username_normalized,
            "email": email_normalized,
            "phone": phone.strip() if phone else None,
            "phone_normalized": phone_normalized,
            "password_hash": self._hash_password(password),
            "role": "learner",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        record = self._user_store.insert(user_doc)
        user = self._serialize_user(record)
        self._start_session(user)
        return True, user, None

    def update_profile(
        self,
        user_id: str,
        *,
        name: str,
        username: str,
        email: Optional[str],
        phone: Optional[str],
    ) -> tuple[bool, str | None, dict[str, Any] | None]:
        if not self._is_valid_user_id(user_id):
            return False, "Invalid user identifier", None

        username_normalized = self._normalize_username(username)
        if not username_normalized:
            return False, "User ID cannot be empty.", None

        email_normalized = self._normalize_email(email)
        phone_normalized = self._normalize_phone(phone)

        existing_username = self._user_store.get_by_username(username_normalized)
        if existing_username and existing_username["id"] != user_id:
            return False, "That user ID is already taken.", None

        existing_email = self._user_store.get_by_email(email_normalized) if email_normalized else None
        if existing_email and existing_email["id"] != user_id:
            return False, "Another account already uses that email address.", None

        existing_phone = self._user_store.get_by_phone(phone_normalized) if phone_normalized else None
        if existing_phone and existing_phone["id"] != user_id:
            return False, "Another account already uses that phone number.", None

        updates = {
            "name": name.strip(),
            "username": username.strip(),
            "username_normalized": username_normalized,
            "email": email_normalized,
            "phone": phone.strip() if phone else None,
            "phone_normalized": phone_normalized,
            "updated_at": datetime.utcnow(),
        }
        record = self._user_store.update(user_id, updates)
        if not record:
            return False, "Profile not found.", None

        user = self._serialize_user(record)
        st.session_state["user"] = user
        return True, None, user

    def change_password(self, user_id: str, *, current_password: str, new_password: str) -> tuple[bool, str | None]:
        if not self._is_valid_user_id(user_id):
            return False, "Invalid user identifier"

        record = self._user_store.get_by_id(user_id)
        if not record or not self._verify_password(current_password, record["password_hash"]):
            return False, "Current password is incorrect."

        password_hash = self._hash_password(new_password)
        self._user_store.update_password(user_id, password_hash)
        return True, None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _start_session(self, user: dict[str, Any]) -> None:
        session_id = st.session_state.get("session_id") or str(uuid4())
        st.session_state["session_id"] = session_id
        st.session_state["user"] = user
        self._sessions.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "session_id": session_id,
                    "user_id": user["id"],
                    "email": user.get("email"),
                    "username": user.get("username"),
                    "role": user.get("role", "learner"),
                    "last_active": datetime.utcnow(),
                },
                "$setOnInsert": {"created_at": datetime.utcnow()},
            },
            upsert=True,
        )

    def _hash_password(self, password: str) -> str:
        salt = bcrypt.gensalt(rounds=12)
        hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
        return hashed.decode("utf-8")

    def _verify_password(self, password: str, hashed: str) -> bool:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))

    def _serialize_user(self, record: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(record["id"]),
            "name": record.get("name", ""),
            "username": record.get("username", ""),
            "email": record.get("email", ""),
            "phone": record.get("phone"),
            "role": record.get("role", "learner"),
            "created_at": record.get("created_at"),
        }

    def _normalize_username(self, value: Optional[str]) -> str:
        return value.strip().lower() if value else ""

    def _normalize_email(self, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        normalized = value.strip().lower()
        return normalized or None

    def _normalize_phone(self, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        digits = "".join(ch for ch in value if ch.isdigit())
        return digits or None

    def _is_valid_user_id(self, value: str) -> bool:
        try:
            UUID(str(value))
            return True
        except Exception:
            return False

    def _get_user_by_username(self, identifier: str) -> Optional[dict[str, Any]]:
        username = self._normalize_username(identifier)
        if not username:
            return None
        return self._user_store.get_by_username(username)


def require_user(auth_manager: AuthManager) -> dict[str, Any]:
    """Ensure there is an authenticated user before proceeding."""
    user = auth_manager.get_current_user()
    if user:
        return user
    st.session_state["current_page"] = "Login"
    st.error("Please sign in to continue.")
    st.stop()
