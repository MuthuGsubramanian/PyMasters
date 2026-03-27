"""
Shared Python code execution via subprocess.
Used by both Classroom evaluation and Playground terminal.
"""
import os
import sys
import tempfile
import subprocess


BLOCKED_KEYWORDS = [
    "subprocess.call", "subprocess.run", "subprocess.Popen",
    "os.system", "os.remove", "os.rmdir", "os.unlink",
    "shutil.rmtree", "shutil.move",
    "__import__('os').system",
    "eval(", "exec(",
    "open(",
    "pathlib",
]


def check_code_safety(code: str) -> str | None:
    """
    Check code against blocked keywords.
    Returns the matched keyword if unsafe, None if safe.
    """
    for kw in BLOCKED_KEYWORDS:
        if kw in code:
            return kw
    return None


def run_code_subprocess(code: str, timeout: int = 10) -> dict:
    """
    Execute Python code in an isolated subprocess.

    Returns: { "output": str, "error": str, "exit_code": int }
    """
    blocked = check_code_safety(code)
    if blocked:
        return {
            "output": "",
            "error": f"Security Error: forbidden operation '{blocked}' detected.",
            "exit_code": 1,
        }

    python_cmd = sys.executable or ("python3" if os.name != "nt" else "python")
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, encoding="utf-8"
        ) as f:
            f.write(code)
            temp_path = f.name

        result = subprocess.run(
            [python_cmd, temp_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )

        return {
            "output": result.stdout,
            "error": result.stderr,
            "exit_code": result.returncode,
        }

    except subprocess.TimeoutExpired:
        return {
            "output": "",
            "error": f"Execution timed out after {timeout} seconds.",
            "exit_code": 1,
        }
    except Exception as e:
        return {
            "output": "",
            "error": f"Execution failed: {str(e)}",
            "exit_code": 1,
        }
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass
