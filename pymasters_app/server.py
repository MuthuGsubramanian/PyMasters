"""FastAPI application factory."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from pymasters_app.utils.db import get_database
from pymasters_app.utils.bootstrap import ensure_collections
from pymasters_app.utils.auth import AuthManager
from pymasters_app.api.middleware import SessionAuthMiddleware
from pymasters_app.api.auth import router as auth_router
from pymasters_app.api.modules import router as modules_router
from pymasters_app.api.tutor import router as tutor_router
from pymasters_app.api.studio import router as studio_router
from pymasters_app.api.playground import router as playground_router
from pymasters_app.api.activity_routes import router as activity_router

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="PyMasters", docs_url="/docs")

# Database and auth
db = get_database()
ensure_collections(db)
auth_manager = AuthManager(db)
auth_manager.ensure_super_admin()

app.state.db = db
app.state.auth_manager = auth_manager

# Middleware
app.add_middleware(SessionAuthMiddleware)

# API routers
app.include_router(auth_router)
app.include_router(modules_router)
app.include_router(tutor_router)
app.include_router(studio_router)
app.include_router(playground_router)
app.include_router(activity_router)

# Static files
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def index():
    return FileResponse(str(STATIC_DIR / "index.html"))
