"""Sandbox environment for the learner libraries (pandas, scikit-learn, matplotlib, ...).

_minimal_env builds the child's environment from scratch, so image-level ENV never reaches learner code:
matplotlib must be told to stay headless and where it may write its config/font cache (the sandbox user has
no home), or every run prints a cache warning into the learner's error box and rebuilds the font cache.
Heavy imports also take seconds on a throttled e2-micro, so such programs get a longer budget.
"""
import importlib.util
import sys

import pytest

from vaathiyaar.execution import HEAVY_IMPORT_TIMEOUT, _effective_timeout, _minimal_env, run_code_subprocess


def test_minimal_env_keeps_matplotlib_headless_and_inside_the_run_dir():
    env = _minimal_env(sys.executable, "/tmp/pm_sandbox_x")
    assert env["MPLBACKEND"] == "Agg"
    assert env["MPLCONFIGDIR"] == "/tmp/pm_sandbox_x/.mpl"


@pytest.mark.parametrize("code,expected", [
    ("print(1)", 10),
    ("import pandas as pd\nprint(pd.__version__)", HEAVY_IMPORT_TIMEOUT),
    ("from sklearn.linear_model import LinearRegression", HEAVY_IMPORT_TIMEOUT),
    ("import matplotlib.pyplot as plt", HEAVY_IMPORT_TIMEOUT),
    ("# import pandas  (just a comment)\nprint(2)", 10),
])
def test_heavy_imports_get_a_longer_budget(code, expected):
    assert _effective_timeout(code, 10) == expected


@pytest.mark.skipif(importlib.util.find_spec("matplotlib") is None, reason="sandbox libraries not installed")
def test_matplotlib_runs_without_warnings():
    r = run_code_subprocess("import matplotlib.pyplot as plt\nplt.plot([1, 2])\nprint('ok')")
    assert r["exit_code"] == 0 and r["output"].strip() == "ok", r
    assert r["error"].strip() == "", r["error"]
