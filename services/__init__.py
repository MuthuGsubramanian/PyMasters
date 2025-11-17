"""Service layer exports."""
from .auth_service import AuthService
from .module_service import ModuleService
from .progress_service import ProgressService
from .recommendation_service import RecommendationService
from .huggingface_service import (
    generate_image,
    generate_video,
    HuggingFaceError,
)
from .local_ai_service import (
    LocalAIError,
    list_local_models,
    create_local_chat_completion,
    create_local_completion,
    create_local_response,
    create_local_embedding,
)

__all__ = [
    "AuthService",
    "ModuleService",
    "ProgressService",
    "RecommendationService",
    "generate_image",
    "generate_video",
    "HuggingFaceError",
    "LocalAIError",
    "list_local_models",
    "create_local_chat_completion",
    "create_local_completion",
    "create_local_response",
    "create_local_embedding",
]
