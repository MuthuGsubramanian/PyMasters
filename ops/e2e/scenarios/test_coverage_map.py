"""Coverage stays complete as the portal grows: every frontend route and every backend router must be exercised."""
import re
from pathlib import Path

import pytest

from conftest import BASE
from routes import LAYOUTS, REDIRECTS, ROUTES

REPO = Path(__file__).resolve().parents[3]
SCEN = Path(__file__).resolve().parent


def app_routes() -> set:
    src = (REPO / "frontend/src/App.jsx").read_text()
    paths = set(re.findall(r'<Route\s+path="([^"]+)"', src))
    if re.search(r"<Route\s+index\b", src):
        paths.add("index")
    return paths


def backend_prefixes() -> set:
    prefixes = set()
    for f in (REPO / "backend/routes").glob("*.py"):
        prefixes.update(re.findall(r'APIRouter\(\s*prefix="([^"]+)"', f.read_text()))
    prefixes.update({"/api/auth", "/api/content"})            # routes declared directly in backend/main.py
    return prefixes


def test_every_frontend_route_is_covered():
    covered = {r.pattern for r in ROUTES} | set(REDIRECTS) | LAYOUTS
    missing = sorted(app_routes() - covered)
    assert not missing, f"App.jsx routes with no scenario coverage: {missing}"


@pytest.mark.parametrize("src,dest", sorted(REDIRECTS.items()))
def test_redirect_routes_land_where_expected(logged_in_page, src, dest):
    from conftest import create_user
    page = logged_in_page(create_user())
    url = src if src.startswith("/") else f"/dashboard/{src.replace(':id', 'x').replace(':pathId', 'x')}"
    page.goto(f"{BASE}{url}", wait_until="networkidle")
    assert page.url.split("?")[0].rstrip("/").endswith(dest.rstrip("/")), page.url


@pytest.mark.xfail(strict=False, reason="module suites land in Tasks 8-10; enforced once they exist")
def test_every_backend_router_is_exercised():
    corpus = "\n".join(p.read_text() for p in SCEN.rglob("test_*.py") if p.name != Path(__file__).name)
    missing = sorted(p for p in backend_prefixes() if p not in corpus)
    assert not missing, f"backend routers no scenario touches: {missing}"
