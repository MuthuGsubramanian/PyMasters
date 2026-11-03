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


def frontend_api_calls() -> set:
    """(METHOD, path) for every `api.<verb>('/path…')` call in frontend/src (unit tests excluded).
    A segment starting with ${…} becomes {param}; a ${…} glued after text (a query string) is dropped."""
    calls = set()
    for f in (REPO / "frontend/src").rglob("*.js*"):
        if "__tests__" in f.parts:
            continue
        for verb, raw in re.findall(r"\bapi\.(get|post|put|patch|delete)\(\s*[`'\"](/[^`'\"?]*)", f.read_text()):
            segs = ["{param}" if s.startswith("${") else re.sub(r"\$\{[^}]+\}", "", s)
                    for s in raw.strip("/").split("/")]
            calls.add((verb.upper(), "/api/" + "/".join(segs)))
    return calls


def _segments_match(front: str, back: str) -> bool:
    f, b = front.strip("/").split("/"), back.strip("/").split("/")
    return len(f) == len(b) and all(x == y or x == "{param}" or y.startswith("{") for x, y in zip(f, b))


def test_every_frontend_api_call_has_a_backend_route():
    from conftest import CONTAINER, DOCKER
    import json
    import subprocess
    out = subprocess.run([DOCKER, "exec", "-w", "/app/backend", CONTAINER, "python", "-c",
                          "import json, main; print(json.dumps([[r.path, sorted(r.methods)] "
                          "for r in main.app.routes if hasattr(r, 'methods')]))"],
                         capture_output=True, text=True, timeout=120)
    routes = json.loads(out.stdout.strip().splitlines()[-1])
    dead = sorted(f"{m} {p}" for m, p in frontend_api_calls()
                  if not any(_segments_match(p, rp) and m in rm for rp, rm in routes))
    assert not dead, f"frontend calls endpoints the backend does not have: {dead}"


def test_every_backend_router_is_exercised():
    corpus = "\n".join(p.read_text() for p in SCEN.rglob("test_*.py") if p.name != Path(__file__).name)
    missing = sorted(p for p in backend_prefixes() if p not in corpus)
    assert not missing, f"backend routers no scenario touches: {missing}"
