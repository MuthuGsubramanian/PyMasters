"""Authentication API endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel
from typing import Optional

from pymasters_app.api.middleware import SESSION_COOKIE

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    identifier: str
    password: str


class SignupRequest(BaseModel):
    name: str
    username: str
    password: str
    email: Optional[str] = None
    phone: Optional[str] = None


class ProfileUpdate(BaseModel):
    name: str
    username: str
    email: Optional[str] = None
    phone: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
async def login(body: LoginRequest, request: Request, response: Response):
    auth = request.app.state.auth_manager
    result = auth.login(identifier=body.identifier, password=body.password)
    if not result:
        return {"ok": False, "error": "Invalid credentials"}
    user, session_id = result
    response.set_cookie(SESSION_COOKIE, session_id, httponly=True, samesite="lax", max_age=86400 * 7)
    return {"ok": True, "user": user}


@router.post("/signup")
async def signup(body: SignupRequest, request: Request, response: Response):
    auth = request.app.state.auth_manager
    ok, user, message, session_id = auth.signup(
        name=body.name, username=body.username, password=body.password,
        email=body.email, phone=body.phone,
    )
    if not ok:
        return {"ok": False, "error": message}
    response.set_cookie(SESSION_COOKIE, session_id, httponly=True, samesite="lax", max_age=86400 * 7)
    return {"ok": True, "user": user}


@router.get("/me")
async def me(request: Request):
    session_id = request.cookies.get(SESSION_COOKIE)
    if not session_id:
        return {"user": None}
    auth = request.app.state.auth_manager
    user = auth.get_current_user(session_id)
    return {"user": user}


@router.post("/logout")
async def logout(request: Request, response: Response):
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        request.app.state.auth_manager.logout(session_id)
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@router.put("/profile")
async def update_profile(body: ProfileUpdate, request: Request):
    user = request.state.user
    auth = request.app.state.auth_manager
    ok, message, updated = auth.update_profile(
        user["id"], name=body.name, username=body.username,
        email=body.email, phone=body.phone,
    )
    if not ok:
        return {"ok": False, "error": message}
    return {"ok": True, "user": updated}


@router.put("/password")
async def change_password(body: PasswordChange, request: Request):
    user = request.state.user
    auth = request.app.state.auth_manager
    ok, message = auth.change_password(
        user["id"], current_password=body.current_password,
        new_password=body.new_password,
    )
    if not ok:
        return {"ok": False, "error": message}
    return {"ok": True}
