import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from services import AuthService, ModuleService, ProgressService, RecommendationService


def test_auth_service_can_authenticate_demo_user():
    service = AuthService()
    user = service.authenticate("jane@pymasters.net", "pymasters")
    assert user is not None
    assert user.name == "Jane Developer"


def test_module_service_loads_seed_data():
    service = ModuleService()
    modules = service.list_modules()
    assert any(module.title == "Python Foundations" for module in modules)


def test_progress_service_returns_records():
    service = ProgressService()
    records = service.list_progress(user_id=1)
    assert len(records) > 0


def test_recommendation_service_filters_completed_modules():
    service = RecommendationService()
    recs = service.get_recommendations(user_id=1, completed_module_ids=[2])
    assert all(rec["module_id"] != 2 for rec in recs)
