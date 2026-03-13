"""Code Playground API endpoint."""
from __future__ import annotations

import io
import contextlib
import traceback
from datetime import datetime

from fastapi import APIRouter, Request
from pydantic import BaseModel

from pymasters_app.utils.activity import log_activity

router = APIRouter(prefix="/api/playground", tags=["playground"])

SAFE_BUILTINS = {
    "print": print, "len": len, "range": range, "int": int, "float": float,
    "str": str, "bool": bool, "list": list, "dict": dict, "tuple": tuple,
    "set": set, "enumerate": enumerate, "zip": zip, "map": map, "filter": filter,
    "sorted": sorted, "reversed": reversed, "sum": sum, "min": min, "max": max,
    "abs": abs, "round": round, "isinstance": isinstance, "type": type,
    "hasattr": hasattr, "getattr": getattr, "setattr": setattr,
    "input": lambda *a: "", "open": None, "__import__": __import__,
    "True": True, "False": False, "None": None,
}


class RunRequest(BaseModel):
    code: str


@router.post("/run")
async def run_code(body: RunRequest, request: Request):
    db = request.app.state.db
    user = request.state.user

    stdout_capture = io.StringIO()
    status = "success"
    try:
        with contextlib.redirect_stdout(stdout_capture):
            exec(body.code[:5000], {"__builtins__": SAFE_BUILTINS})
    except Exception:
        stdout_capture.write(traceback.format_exc())
        status = "error"

    output = stdout_capture.getvalue()

    db["playground_runs"].insert_one({
        "user_id": user["id"],
        "code": body.code[:2000],
        "output": output[:2000],
        "status": status,
        "created_at": datetime.utcnow(),
    })

    log_activity(db, user["id"], "playground_run", body.code[:60])

    return {"output": output, "status": status}
