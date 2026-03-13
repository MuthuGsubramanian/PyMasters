"""Session authentication middleware."""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

SESSION_COOKIE = "pymasters_session"
PUBLIC_PATHS = {"/api/auth/login", "/api/auth/signup", "/api/auth/me"}


class SessionAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Allow static files and public API paths
        if not path.startswith("/api/") or path in PUBLIC_PATHS:
            return await call_next(request)

        session_id = request.cookies.get(SESSION_COOKIE)
        if not session_id:
            return JSONResponse({"error": "Not authenticated"}, status_code=401)

        auth_manager = request.app.state.auth_manager
        user = auth_manager.get_current_user(session_id)
        if not user:
            response = JSONResponse({"error": "Session expired"}, status_code=401)
            response.delete_cookie(SESSION_COOKIE)
            return response

        request.state.user = user
        request.state.session_id = session_id
        return await call_next(request)
