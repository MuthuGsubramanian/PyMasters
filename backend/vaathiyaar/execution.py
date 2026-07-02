"""
Shared Python code execution sandbox.

Used by Classroom evaluation (strict: imports/builtins denied via check_code_safety)
and the Playground terminal (permissive: imports allowed, executor hardening only).

Security model — defense in depth, since this runs arbitrary student code:
  1. A minimal, secret-free environment is handed to the child (the parent's
     env — JWT_SECRET, OLLAMA_API_KEY, SMTP creds — is never inherited).
  2. The child runs in an isolated, auto-deleted working directory, so relative
     file operations can't read or clobber the repo.
  3. On POSIX, RLIMIT_AS / RLIMIT_CPU / RLIMIT_FSIZE / RLIMIT_NPROC bound memory,
     CPU, output file size and process count (fork-bomb guard); the child gets its
     own session so a timeout kills the whole process group.
  4. `python -I` runs in isolated mode (ignores PYTHON* vars and user site).
  5. A wall-clock timeout bounds every run.

This is strong but not a true jail. For fully untrusted public traffic, additionally
wrap the process in an OS sandbox (gVisor / Firecracker / a locked-down container).
Network access is NOT blocked here (the Playground's pip flow needs it).
"""
import ast
import os
import shutil
import subprocess
import sys
import tempfile

# Modules a beginner/intermediate lesson never legitimately needs, and which
# grant system, filesystem, network, process or introspection-escape powers.
_BLOCKED_MODULES = {
    "os", "sys", "subprocess", "shutil", "socket", "ctypes", "importlib",
    "multiprocessing", "threading", "asyncio", "pathlib", "pickle", "marshal",
    "builtins", "gc", "resource", "signal", "mmap", "fcntl", "pty", "platform",
    "glob", "tempfile", "io", "urllib", "http", "requests", "ftplib", "smtplib",
    "webbrowser", "ssl", "select", "termios", "shelve", "dbm", "sqlite3",
}

# Builtins that enable arbitrary execution, dynamic import, or file/stdin access.
_BLOCKED_NAMES = {
    "eval", "exec", "compile", "__import__", "open", "input",
    "breakpoint", "exit", "quit", "memoryview",
}

# Dunder attributes used to climb out of the sandbox via object introspection
# (e.g. ().__class__.__bases__[0].__subclasses__()).
_BLOCKED_DUNDERS = {
    "__class__", "__bases__", "__base__", "__mro__", "__subclasses__",
    "__subclasshook__", "__globals__", "__builtins__", "__import__",
    "__code__", "__dict__", "__getattribute__", "__reduce__", "__reduce_ex__",
    "__init_subclass__", "__loader__",
}


# SAFE-OPEN WHITELIST (2026-07-02): keyword args open() may carry when a lesson
# whitelists literal file access (file-I/O lessons). Values must be constants.
_SAFE_OPEN_KWARGS = {"mode", "encoding", "errors", "newline", "buffering"}


def _approved_open_funcs(tree: ast.AST, allowed_open_files) -> set:
    """
    Return the exact ``ast.Name`` nodes that are the *func* of a statically-safe
    ``open()`` call: first argument is a string literal contained in
    ``allowed_open_files`` (plain basenames seeded into the throwaway sandbox
    cwd), any mode is a literal read/write/append/create mode, at most two
    positional args, and only constant-valued kwargs from _SAFE_OPEN_KWARGS.
    Every other appearance of the name ``open`` (aliasing, variable paths,
    computed modes, opener=/file= kwargs) stays blocked exactly as before.
    """
    approved: set = set()
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                and node.func.id == "open"):
            continue
        if not node.args or len(node.args) > 2:
            continue
        first = node.args[0]
        if not (isinstance(first, ast.Constant) and isinstance(first.value, str)
                and first.value in allowed_open_files):
            continue
        mode_nodes = list(node.args[1:2]) + [
            kw.value for kw in node.keywords if kw.arg == "mode"
        ]
        ok = True
        for m in mode_nodes:
            if not (isinstance(m, ast.Constant) and isinstance(m.value, str)
                    and m.value.replace("b", "").replace("t", "") in {"r", "w", "a", "x"}):
                ok = False
        for kw in node.keywords:
            if kw.arg not in _SAFE_OPEN_KWARGS or not isinstance(kw.value, ast.Constant):
                ok = False
        if ok:
            approved.add(node.func)
    return approved


def check_code_safety(code: str, allowed_open_files=None) -> str | None:
    """
    Statically analyse code via its AST. Returns a human-readable reason if the
    code is disallowed, or None if it is safe to run in the strict (classroom)
    context.

    AST-based rather than substring matching, so it neither false-positives on
    innocent identifiers (a user function named ``reopen``) nor is fooled by
    obfuscation that a keyword blocklist would miss.

    ``allowed_open_files`` (2026-07-02, optional — default preserves the exact
    previous behaviour): a collection of plain filenames a file-I/O lesson has
    seeded into the sandbox cwd. When given, ``open('<one of them>')`` with a
    literal read/write mode is permitted; all other uses of ``open`` remain
    blocked. Callers that don't pass it are byte-for-byte unaffected.

    Syntax errors pass through (return None): the same interpreter runs the code,
    so unparseable input fails harmlessly with a real SyntaxError downstream.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return None

    approved_open = (
        _approved_open_funcs(tree, allowed_open_files) if allowed_open_files else ()
    )

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root in _BLOCKED_MODULES:
                    return f"import of module '{root}' is not allowed here"
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if root in _BLOCKED_MODULES:
                return f"import of module '{root}' is not allowed here"
        elif isinstance(node, ast.Name):
            if node.id in _BLOCKED_NAMES:
                if node.id == "open" and node in approved_open:
                    continue
                return f"use of '{node.id}' is not allowed here"
        elif isinstance(node, ast.Attribute):
            if node.attr in _BLOCKED_DUNDERS:
                return f"access to '{node.attr}' is not allowed here"

    return None


# Modules that stay blocked for challenge grading: network, process spawning,
# native code, dynamic import, serialization-based escapes, persistence.
# (Note: os/tempfile/shutil/threading/asyncio/contextlib/time/etc. are allowed —
# challenges legitimately need them, and the subprocess is secret-free,
# cwd-isolated, resource-limited and time-limited.)
_CHALLENGE_BLOCKED_MODULES = {
    "subprocess", "socket", "ctypes", "multiprocessing", "importlib",
    "marshal", "pickle", "urllib", "http", "requests", "ftplib",
    "smtplib", "webbrowser", "ssl", "select", "termios", "shelve", "dbm",
    "sqlite3", "mmap", "fcntl", "pty", "sys",
}


def check_challenge_safety(code: str) -> str | None:
    """Relaxed variant of check_code_safety for graded challenge submissions.

    Blocks the genuinely dangerous surface (network, process, native, dynamic
    import, introspection escape) but allows computational stdlib. Returns a
    reason string if disallowed, else None.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return None  # a real SyntaxError surfaces when the harness runs

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root in _CHALLENGE_BLOCKED_MODULES:
                    return f"import of module '{root}' is not allowed in challenges"
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if root in _CHALLENGE_BLOCKED_MODULES:
                return f"import of module '{root}' is not allowed in challenges"
        elif isinstance(node, ast.Name):
            if node.id in {"eval", "exec", "compile", "__import__", "open", "input", "breakpoint"}:
                return f"use of '{node.id}' is not allowed in challenges"
        elif isinstance(node, ast.Attribute):
            if node.attr in _BLOCKED_DUNDERS:
                return f"access to '{node.attr}' is not allowed in challenges"
    return None


def _minimal_env(python_cmd: str) -> dict:
    """Build a secret-free environment sufficient to start the interpreter."""
    env = {
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUNBUFFERED": "1",
    }
    # The interpreter's own directory on PATH so it can locate its runtime DLLs.
    py_dir = os.path.dirname(python_cmd)
    env["PATH"] = py_dir or "/usr/bin:/bin"
    if os.name == "nt":
        # Windows needs these to bootstrap the interpreter (os.urandom, sockets).
        for key in ("SYSTEMROOT", "SystemRoot", "WINDIR", "COMSPEC",
                    "PATHEXT", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE"):
            if key in os.environ:
                env[key] = os.environ[key]
    return env


def _posix_limits(timeout: int):
    """preexec_fn factory: cap CPU, memory, output size, processes; new session."""
    def _apply():
        import resource
        os.setsid()  # own process group → timeout can kill the whole tree
        cpu = max(1, timeout) + 1
        resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu))
        mem = 512 * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (mem, mem))
        resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        try:
            resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
        except (ValueError, OSError):
            pass
    return _apply


def run_code_subprocess(code: str, timeout: int = 10, seed_files: dict | None = None) -> dict:
    """
    Execute Python code in a hardened, isolated subprocess.

    ``seed_files`` (2026-07-02, optional — default preserves the exact previous
    behaviour): mapping of plain filename → text content written into the
    throwaway working directory before the run, so file-I/O lessons can grade
    real ``open()`` code against a known fixture. Names containing path
    separators, or clashing with the script itself, are silently refused.

    Returns: { "output": str, "error": str, "exit_code": int }
    """
    python_cmd = sys.executable or ("python" if os.name == "nt" else "python3")
    work_dir = tempfile.mkdtemp(prefix="pm_sandbox_")
    script_path = os.path.join(work_dir, "main.py")

    try:
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(code)

        if seed_files:
            for _name, _content in seed_files.items():
                if (not isinstance(_name, str) or not isinstance(_content, str)
                        or os.path.basename(_name) != _name or _name == "main.py"):
                    continue  # refuse path tricks / clobbering the script
                with open(os.path.join(work_dir, _name), "w", encoding="utf-8") as sf:
                    sf.write(_content)

        popen_kwargs = dict(
            cwd=work_dir,
            env=_minimal_env(python_cmd),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if os.name != "nt":
            popen_kwargs["preexec_fn"] = _posix_limits(timeout)

        proc = subprocess.Popen(
            [python_cmd, "-I", "-B", script_path], **popen_kwargs
        )
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
            return {"output": stdout, "error": stderr, "exit_code": proc.returncode}
        except subprocess.TimeoutExpired:
            _kill_process_tree(proc)
            proc.communicate()
            return {
                "output": "",
                "error": f"Execution timed out after {timeout} seconds.",
                "exit_code": 1,
            }
    except Exception as exc:  # noqa: BLE001 — surface any spawn failure to the user
        return {"output": "", "error": f"Execution failed: {exc}", "exit_code": 1}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _kill_process_tree(proc: "subprocess.Popen") -> None:
    """Kill the child and, on POSIX, its whole session/group."""
    if os.name != "nt":
        try:
            os.killpg(os.getpgid(proc.pid), 9)
            return
        except (ProcessLookupError, PermissionError, OSError):
            pass
    try:
        proc.kill()
    except OSError:
        pass
