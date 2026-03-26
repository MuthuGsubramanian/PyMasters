from pydantic import BaseModel
from typing import Optional


class ModuleRequest(BaseModel):
    user_id: int
    topic: str
    context: Optional[str] = None


class JobStatus(BaseModel):
    job_id: str
    status: str
    current_stage: Optional[str] = None
    progress_pct: int = 0
    error_message: Optional[str] = None
