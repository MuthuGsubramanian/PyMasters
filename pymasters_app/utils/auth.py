"""Authentication and session utilities for PyMasters."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

import bcrypt
from bson import ObjectId


class AuthManager:
    """Encapsulate Mongo backed authentication helpers."""

    def __init__(self, database: Any) -> None:
        self._db = database
        self._users = database["users"]
        self._sessions = database["sessions"]
        self._ensure_indexes()

    def _ensure_indexes(self) -> None:
        self._users.create_index("email", unique=True, sparse=True)
        self._users.create_index("username_normalized", unique=True)
        self._users.create_index("phone_normalized", unique=True, sparse=True)
        self._sessions.create_index("session_id", unique=True)
        self._sessions.create_index("user_id")

    # ------------------------------------------------------------------
    # Session helpers
    # ------------------------------------------------------------------
    def get_current_user(self, session_id: str) -> Optional[dict[str, Any]]:
        """Return the current user for the given session_id, or None."""
        if not session_id:
            return None
        session = self._sessions.find_one({"session_id": session_id})
        if not session:
            return None
        user_id = session.get("user_id")
        if not user_id:
            return None
        try:
            record = self._users.find_one({"_id": ObjectId(user_id)})
        except Exception:
            return None
        if not record:
            return None
        self._touch_session(session_id)
        return self._serialize_user(record)

    def _touch_session(self, session_id: str) -> None:
        if not session_id:
            return
        self._sessions.update_one(
            {"session_id": session_id},
            {"$set": {"last_active": datetime.utcnow()}},
            upsert=True,
        )

    def logout(self, session_id: str) -> None:
        """Terminate the session identified by session_id."""
        if session_id:
            self._sessions.delete_one({"session_id": session_id})

    # ------------------------------------------------------------------
    # User management
    # ------------------------------------------------------------------
    def ensure_super_admin(self) -> None:
        """Seed a default super administrator if missing."""
        email = "muthu.g.subramanian"
        existing = self._users.find_one({"email": email})
        if existing:
            return

        password_hash = self._hash_password("Password@123")
        user_doc = {
            "name": "Muthu G Subramanian",
            "username": "founder",
            "username_normalized": "founder",
            "email": email,
            "phone": None,
            "phone_normalized": None,
            "password_hash": password_hash,
            "role": "superadmin",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        self._users.insert_one(user_doc)

    def login(self, *, identifier: str, password: str) -> Optional[tuple[dict[str, Any], str]]:
        lookup = identifier.strip().lower()
        if not lookup:
            return None

        record = self._users.find_one({"username_normalized": lookup})
        if not record and "@" in lookup:
            record = self._users.find_one({"email": lookup})
        if not record:
            phone_lookup = self._normalize_phone(identifier)
            if phone_lookup:
                record = self._users.find_one({"phone_normalized": phone_lookup})
        if not record:
            record = self._users.find_one({"email": lookup})
        if not record:
            return None

        if not self._verify_password(password, record["password_hash"]):
            return None

        user = self._serialize_user(record)
        session_id = self._start_session(user)
        return user, session_id

    def signup(
        self,
        *,
        name: str,
        username: str,
        password: str,
        email: Optional[str] = None,
        phone: Optional[str] = None,
    ) -> tuple[bool, Optional[dict[str, Any]], str | None, Optional[str]]:
        username_normalized = self._normalize_username(username)
        if not username_normalized:
            return False, None, "Please choose a valid user ID.", None

        existing_username = self._users.find_one({"username_normalized": username_normalized})
        if existing_username:
            return False, None, "That user ID is already taken.", None

        email_normalized = self._normalize_email(email)
        if email_normalized:
            existing_email = self._users.find_one({"email": email_normalized})
            if existing_email:
                return False, None, "An account with that email already exists.", None

        phone_normalized = self._normalize_phone(phone)
        if phone_normalized:
            existing_phone = self._users.find_one({"phone_normalized": phone_normalized})
            if existing_phone:
                return False, None, "That phone number is already linked to another account.", None

        user_doc = {
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
        inserted = self._users.insert_one(user_doc)
        user_doc["_id"] = inserted.inserted_id
        user = self._serialize_user(user_doc)
        session_id = self._start_session(user)
        return True, user, None, session_id

    def update_profile(
        self,
        user_id: str,
        *,
        name: str,
        username: str,
        email: Optional[str],
        phone: Optional[str],
    ) -> tuple[bool, str | None, dict[str, Any] | None]:
        email_normalized = self._normalize_email(email)
        username_normalized = self._normalize_username(username)
        phone_normalized = self._normalize_phone(phone)

        if not username_normalized:
            return False, "User ID cannot be empty.", None

        updates: dict[str, Any] = {
            "name": name.strip(),
            "username": username.strip(),
            "username_normalized": username_normalized,
            "email": email_normalized,
            "phone": phone.strip() if phone else None,
            "phone_normalized": phone_normalized,
            "updated_at": datetime.utcnow(),
        }

        try:
            object_id = ObjectId(user_id)
        except Exception:
            return False, "Invalid user identifier", None

        if email_normalized:
            duplicate_email = self._users.find_one({"email": email_normalized, "_id": {"$ne": object_id}})
            if duplicate_email:
                return False, "Another account already uses that email address.", None

        duplicate_username = self._users.find_one(
            {"username_normalized": username_normalized, "_id": {"$ne": object_id}}
        )
        if duplicate_username:
            return False, "That user ID is already taken.", None

        if phone_normalized:
            duplicate_phone = self._users.find_one(
                {"phone_normalized": phone_normalized, "_id": {"$ne": object_id}}
            )
            if duplicate_phone:
                return False, "Another account already uses that phone number.", None

        result = self._users.update_one({"_id": object_id}, {"$set": updates})
        if result.matched_count == 0:
            return False, "Profile not found.", None

        record = self._users.find_one({"_id": object_id})
        user = self._serialize_user(record)
        return True, None, user

    def change_password(self, user_id: str, *, current_password: str, new_password: str) -> tuple[bool, str | None]:
        try:
            object_id = ObjectId(user_id)
        except Exception:
            return False, "Invalid user identifier"

        record = self._users.find_one({"_id": object_id})
        if not record or not self._verify_password(current_password, record["password_hash"]):
            return False, "Current password is incorrect."

        password_hash = self._hash_password(new_password)
        self._users.update_one(
            {"_id": object_id},
            {"$set": {"password_hash": password_hash, "updated_at": datetime.utcnow()}},
        )
        return True, None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _start_session(self, user: dict[str, Any]) -> str:
        session_id = str(uuid4())
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
        return session_id

    def _hash_password(self, password: str) -> str:
        salt = bcrypt.gensalt(rounds=12)
        hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
        return hashed.decode("utf-8")

    def _verify_password(self, password: str, hashed: str) -> bool:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))

    def _serialize_user(self, record: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(record["_id"]),
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
