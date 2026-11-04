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

  6. NETWORK EGRESS is blocked at the OS level: on POSIX the child runs inside a
     fresh network namespace with no route out (`unshare --net`), so it cannot reach
     the cloud metadata server (169.254.169.254) to steal the runtime SA token, nor
     any other host. This is a namespace, not a Python module blocklist (which is
     bypassable). Where the platform can't create the namespace (Windows dev; a
     container that forbids user namespaces) the prefix is empty and egress is NOT
     blocked there — the compensating control is least-privilege IAM on the runtime
     SA. /install-package does not depend on the sandbox's egress (it runs pip in
     its own flow).
"""
import ast
import functools
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time


@functools.lru_cache(maxsize=1)
def _net_isolation_prefix() -> tuple:
    """A command prefix that runs the child with NO network egress, or () if the
    platform can't provide one.

    Uses an unprivileged network namespace (`unshare --net`): the child gets only a
    down loopback interface and no default route, so every outbound connection —
    including to the GCP metadata endpoint — fails. Probed once and cached; falls
    back to user-namespace mapping for kernels that require it, then to () (no
    isolation) so execution still works on platforms that forbid the namespace.
    """
    if os.name == "nt":
        return ()
    unshare = shutil.which("unshare")
    if not unshare:
        return ()
    for variant in (("--net",), ("--user", "--map-root-user", "--net")):
        try:
            probe = subprocess.run(
                [unshare, *variant, "true"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5,
            )
            if probe.returncode == 0:
                return (unshare, *variant)
        except Exception:
            continue
    return ()


def _build_child_command(python_cmd: str, script_path: str) -> list:
    """The exact argv for the sandbox child: network-isolation prefix (if any),
    then the interpreter in isolated mode running the user script."""
    return list(_net_isolation_prefix()) + [python_cmd, "-I", "-B", script_path]


def _firewall_isolated() -> bool:
    """True when the container entrypoint (start.sh) installed an iptables OUTPUT rule rejecting all
    traffic from the sandbox uid AND verified that the sandbox user cannot reach the metadata server.
    This is the control on the GCE VM, where Docker's seccomp profile forbids `unshare` (2026-11-02:
    sandboxed code reached 169.254.169.254 and the VM service account before this existed)."""
    return os.environ.get("SANDBOX_NET_FIREWALL") == "1"


def sandbox_network_isolated() -> bool:
    return bool(_net_isolation_prefix()) or _firewall_isolated()


def egress_self_test(timeout: int = 4) -> str:
    """Boot diagnostic: run the SANDBOX child and check whether it can actually
    reach the cloud metadata server (169.254.169.254). This turns the "is egress
    really isolated on Cloud Run?" question into a fact visible in the boot logs.

    Returns 'blocked' (child could not connect — good), 'REACHABLE' (child reached
    the metadata endpoint — network isolation is NOT effective; the runtime SA
    token is exposed to user code — logs a loud WARNING), or 'unknown' on error.
    Runs the same argv real user code runs, so it measures the true control.
    """
    prefix = _net_isolation_prefix()
    probe_src = (
        "import socket\n"
        "try:\n"
        "    s = socket.create_connection(('169.254.169.254', 80), 1); s.close(); print('REACHABLE')\n"
        "except Exception:\n"
        "    print('blocked')\n"
    )
    tmp = None
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
            f.write(probe_src)
            tmp = f.name
        proc = subprocess.run(
            list(prefix) + [sys.executable, "-I", "-B", tmp],
            capture_output=True, text=True, timeout=timeout,
        )
        out = (proc.stdout or "").strip().splitlines()
        result = out[-1] if out else "unknown"
    except Exception:
        result = "unknown"
    finally:
        if tmp:
            try:
                os.remove(tmp)
            except OSError:
                pass
    isolated = bool(prefix)
    if result == "REACHABLE":
        print("[sandbox][SECURITY] WARNING: user-code sandbox CAN reach the cloud "
              "metadata server (169.254.169.254) — network egress isolation is NOT "
              f"effective (unshare prefix={'set' if isolated else 'ABSENT'}). Ensure "
              "the runtime service account is minimal and/or block metadata egress.")
    else:
        print(f"[sandbox] egress self-test: {result} "
              f"(network-isolation prefix {'active' if isolated else 'absent'})")
    return result

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


# Classroom grading gate (2026-11-03). Lessons TEACH asyncio, threading, files, sqlite3, os/sys and descriptors,
# so the strict check_code_safety refused correct answers in ~58 lessons. The security boundary is the sandbox
# (own uid, verified network isolation, rlimits, secret-free env); this gate blocks only the escape surface.
_LESSON_BLOCKED_MODULES = {
    "subprocess", "socket", "ctypes", "multiprocessing", "importlib", "builtins", "gc", "resource", "signal",
    "mmap", "fcntl", "pty", "termios", "select", "ssl", "marshal", "pickle", "shelve", "dbm",
    "ftplib", "smtplib", "webbrowser",
}
_LESSON_BLOCKED_NAMES = {"eval", "exec", "compile", "__import__", "breakpoint", "memoryview"}


def _used_names(tree) -> set:
    """Module roots, bare names and attributes a piece of code uses."""
    used = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            used |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            used.add(node.module.split(".")[0])
        elif isinstance(node, ast.Name):
            used.add(node.id)
        elif isinstance(node, ast.Attribute):
            used.add(node.attr)
    return used


def check_lesson_safety(code: str, lesson_code: str = "", allowed_open_files=None) -> str | None:
    """Gate for graded lesson code. ``lesson_code`` is the lesson's own server-authored starter + test code:
    anything it uses (e.g. importlib in a lesson about imports, __dict__ in one about descriptors) is allowed
    for that lesson only. ``allowed_open_files`` is kept for callers; open() is allowed (sandbox cwd only)."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return None  # the same interpreter raises the real SyntaxError downstream
    try:
        granted = _used_names(ast.parse(lesson_code or ""))
    except SyntaxError:
        granted = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            roots = ([a.name.split(".")[0] for a in node.names] if isinstance(node, ast.Import)
                     else [(node.module or "").split(".")[0]])
            for root in roots:
                if root in _LESSON_BLOCKED_MODULES and root not in granted:
                    return f"import of module '{root}' is not allowed here"
        elif isinstance(node, ast.Name):
            if node.id in _LESSON_BLOCKED_NAMES and node.id not in granted:
                return f"use of '{node.id}' is not allowed here"
        elif isinstance(node, ast.Attribute):
            if node.attr in _BLOCKED_DUNDERS and node.attr not in granted:
                return f"access to '{node.attr}' is not allowed here"
    return None


def _minimal_env(python_cmd: str, work_dir: str | None = None) -> dict:
    """Build a secret-free environment sufficient to start the interpreter."""
    env = {
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUNBUFFERED": "1",
        # One thread per numeric library: fewer address-space reservations and no thread fan-out.
        "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1", "MKL_NUM_THREADS": "1",
        # Polars (Rust): one worker and no jemalloc background thread, or it hits RLIMIT_NPROC (16) on multi-CPU hosts.
        "POLARS_MAX_THREADS": "1", "RAYON_NUM_THREADS": "1", "_RJEM_MALLOC_CONF": "background_thread:false",
        # matplotlib (requirements-sandbox.txt) must never look for a display.
        "MPLBACKEND": "Agg",
    }
    if work_dir:
        # The sandbox user has no home: matplotlib's config/font cache lives in the run's throwaway dir,
        # pre-seeded from the image's cache (_seed_mpl_cache) so it neither warns nor rebuilds fonts.
        env["MPLCONFIGDIR"] = os.path.join(work_dir, ".mpl")
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


MPL_CACHE_DIR = os.getenv("SANDBOX_MPL_CACHE", "/opt/sandbox-mpl")   # built at image time (Dockerfile)
# Importing pandas / scikit-learn / matplotlib alone takes seconds on a throttled e2-micro.
HEAVY_IMPORT_TIMEOUT = 25
_HEAVY_IMPORT = re.compile(r"^\s*(?:import|from)\s+(?:pandas|sklearn|matplotlib|scipy|polars|django|seaborn)\b",
                           re.MULTILINE)


def _effective_timeout(code: str, timeout: int) -> int:
    return max(timeout, HEAVY_IMPORT_TIMEOUT) if _HEAVY_IMPORT.search(code or "") else timeout


def _seed_mpl_cache(work_dir: str) -> str:
    """Create work_dir/.mpl with the image's prebuilt matplotlib font cache (if any)."""
    mpl_dir = os.path.join(work_dir, ".mpl")
    os.makedirs(mpl_dir, exist_ok=True)
    if os.path.isdir(MPL_CACHE_DIR):
        for name in os.listdir(MPL_CACHE_DIR):
            if name.endswith(".json"):
                shutil.copyfile(os.path.join(MPL_CACHE_DIR, name), os.path.join(mpl_dir, name))
    return mpl_dir


SANDBOX_USER = os.getenv("SANDBOX_USER", "sandbox")


def _sandbox_ids():
    """(uid, gid) of the unprivileged sandbox account, or None when we are not
    root / the account does not exist (local dev, Windows, tests)."""
    if os.name == "nt" or not hasattr(os, "geteuid") or os.geteuid() != 0:
        return None
    try:
        import pwd
        pw = pwd.getpwnam(SANDBOX_USER)
        return pw.pw_uid, pw.pw_gid
    except (ImportError, KeyError):
        return None


def _posix_limits(timeout: int, ids=None):
    """preexec_fn factory: cap CPU, memory, output size, processes; new session;
    and, when the server runs as root (Cloud Run image), drop to the
    unprivileged `sandbox` uid so learner code cannot read the app DB, env of
    PID 1, or anything else root-only (audit 2026-10-23 P0)."""
    def _apply():
        import resource
        os.setsid()  # own process group → timeout can kill the whole tree
        if ids is not None:
            uid, gid = ids
            os.setgroups([])
            os.setgid(gid)
            os.setuid(uid)
        cpu = max(1, timeout) + 1
        resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu))
        mem = 512 * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (mem, mem))
        resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        try:
            resource.setrlimit(resource.RLIMIT_NPROC, (16, 16))
        except (ValueError, OSError):
            pass
    return _apply


# One sandbox run at a time on the 1 GB VM; queued callers wait up to RUN_QUEUE_WAIT_S.
_RUN_LOCK = threading.BoundedSemaphore(1)
RUN_QUEUE_WAIT_S = 25
# ...and across processes: every run ends by killing all sandbox-uid processes, so a second process using the
# sandbox in the same container (e.g. ops/e2e verify.py beside the API) must queue, not run in parallel.
# The file lives next to this module (not in /tmp), out of the sandbox uid's reach.
SANDBOX_LOCK_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".sandbox_run.lock")


def _acquire_run_slot(deadline: float):
    """Hold the cross-process sandbox lock; returns the open lock file, or None when the deadline passes."""
    if os.name == "nt":
        return open(os.devnull, "a")
    import fcntl
    try:
        fh = open(SANDBOX_LOCK_PATH, "a")
    except OSError:
        return open(os.devnull, "a")      # read-only install: fall back to the in-process lock alone
    while True:
        try:
            fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return fh
        except OSError:
            if time.monotonic() >= deadline:
                fh.close()
                return None
            time.sleep(0.05)
MAX_OUTPUT_BYTES = 64 * 1024     # returned to the caller per stream; the files are capped at 10 MB by RLIMIT_FSIZE


def _read_capped(path: str, limit: int = MAX_OUTPUT_BYTES) -> str:
    try:
        with open(path, "rb") as fh:
            data = fh.read(limit + 1)
    except OSError:
        return ""
    text = data[:limit].decode("utf-8", errors="replace")
    if len(data) > limit:
        text += f"\n... [output truncated at {limit // 1024} KB]"
    return text


def _kill_uid_processes(uid: int) -> None:
    """Kill every process owned by the sandbox uid: catches children that escaped the process group
    with setsid()/double-fork and would otherwise outlive the timeout."""
    for _ in range(3):
        found = False
        for pid in os.listdir("/proc"):
            if not pid.isdigit():
                continue
            try:
                if os.stat(f"/proc/{pid}").st_uid == uid:
                    found = True
                    os.kill(int(pid), 9)
            except (OSError, ProcessLookupError):
                pass
        if not found:
            return
        time.sleep(0.05)


def _clean_uid_files(uid: int) -> None:
    """Remove files the sandbox uid left in shared temp dirs (disk-fill guard)."""
    for base in ("/tmp", "/var/tmp", "/dev/shm"):
        try:
            entries = os.listdir(base)
        except OSError:
            continue
        for name in entries:
            path = os.path.join(base, name)
            try:
                if os.lstat(path).st_uid != uid:
                    continue
                if os.path.isdir(path) and not os.path.islink(path):
                    shutil.rmtree(path, ignore_errors=True)
                else:
                    os.remove(path)
            except OSError:
                pass


def run_code_subprocess(code: str, timeout: int = 10, seed_files: dict | None = None,
                        max_output: int = MAX_OUTPUT_BYTES) -> dict:
    """
    Execute Python code in a hardened, isolated subprocess.

    ``seed_files`` (2026-07-02, optional — default preserves the exact previous
    behaviour): mapping of plain filename → text content written into the
    throwaway working directory before the run, so file-I/O lessons can grade
    real ``open()`` code against a known fixture. Names containing path
    separators, or clashing with the script itself, are silently refused.

    Returns: { "output": str, "error": str, "exit_code": int }
    """
    ids = _sandbox_ids() if os.name != "nt" else None
    if ids is not None and not sandbox_network_isolated():
        # Production-like (root + sandbox uid) but no verified network isolation: refuse rather than
        # hand learner code a route to the metadata server and the VM service account.
        print("[sandbox][SECURITY] refusing to run code: network isolation not verified")
        return {"output": "", "exit_code": 1,
                "error": "Code execution is temporarily unavailable while the sandbox is being secured. Please try again shortly."}
    busy = {"output": "", "exit_code": 1,
            "error": "The code runner is busy right now. Please try again in a few seconds."}
    deadline = time.monotonic() + RUN_QUEUE_WAIT_S
    if not _RUN_LOCK.acquire(timeout=RUN_QUEUE_WAIT_S):
        return busy
    slot = _acquire_run_slot(deadline)
    if slot is None:
        _RUN_LOCK.release()
        return busy
    try:
        return _run_locked(code, timeout, seed_files, max_output, ids)
    finally:
        slot.close()                       # closing the file releases the flock
        _RUN_LOCK.release()


def _run_locked(code: str, timeout: int, seed_files: dict | None, max_output: int, ids) -> dict:
    python_cmd = sys.executable or ("python" if os.name == "nt" else "python3")
    timeout = _effective_timeout(code, timeout)
    work_dir = tempfile.mkdtemp(prefix="pm_sandbox_")
    script_path = os.path.join(work_dir, "main.py")
    out_path = os.path.join(work_dir, ".stdout")
    err_path = os.path.join(work_dir, ".stderr")

    try:
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(code)

        if seed_files:
            for _name, _content in seed_files.items():
                if (not isinstance(_name, str) or not isinstance(_content, str)
                        or os.path.basename(_name) != _name or _name in ("main.py", ".stdout", ".stderr")):
                    continue  # refuse path tricks / clobbering the script
                with open(os.path.join(work_dir, _name), "w", encoding="utf-8") as sf:
                    sf.write(_content)
        mpl_dir = _seed_mpl_cache(work_dir)

        # Output goes to files (bounded by RLIMIT_FSIZE in the child) instead of pipes, so a print
        # loop can no longer buffer gigabytes in the API process.
        out_fh = open(out_path, "wb")
        err_fh = open(err_path, "wb")
        popen_kwargs = dict(
            cwd=work_dir,
            env=_minimal_env(python_cmd, work_dir),
            stdin=subprocess.DEVNULL,
            stdout=out_fh,
            stderr=err_fh,
        )
        if os.name != "nt":
            if ids is not None:
                # The throwaway dir (mkdtemp → 0700 root) must be readable by
                # the sandbox uid; hand it over wholesale (script + seed files).
                os.chown(work_dir, ids[0], ids[1])
                for _fn in os.listdir(work_dir):
                    if _fn not in (".stdout", ".stderr"):
                        os.chown(os.path.join(work_dir, _fn), ids[0], ids[1])
                for _fn in os.listdir(mpl_dir):
                    os.chown(os.path.join(mpl_dir, _fn), ids[0], ids[1])
            popen_kwargs["preexec_fn"] = _posix_limits(timeout, ids)

        try:
            proc = subprocess.Popen(_build_child_command(python_cmd, script_path), **popen_kwargs)
        finally:
            out_fh.close()
            err_fh.close()
        try:
            proc.wait(timeout=timeout)
            err = _read_capped(err_path)
            if proc.returncode < 0 and not err.strip():
                # Killed by a signal (OOM killer under memory pressure, or a hard resource limit): the program
                # wrote nothing, so without this the learner saw a failed run with no explanation.
                err = ("Your program was stopped before it finished (it ran out of memory or hit a resource "
                       "limit). Try smaller data or fewer loops, then run it again.")
            return {"output": _read_capped(out_path, max_output), "error": err, "exit_code": proc.returncode}
        except subprocess.TimeoutExpired:
            _kill_process_tree(proc)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
            return {
                "output": "",
                "error": f"Execution timed out after {timeout} seconds.",
                "exit_code": 1,
            }
    except Exception as exc:  # noqa: BLE001 — surface any spawn failure to the user
        return {"output": "", "error": f"Execution failed: {exc}", "exit_code": 1}
    finally:
        if ids is not None:
            _kill_uid_processes(ids[0])
            _clean_uid_files(ids[0])
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
