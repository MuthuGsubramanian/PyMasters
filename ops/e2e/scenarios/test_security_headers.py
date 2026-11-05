"""Security review 2026-11-03, M5: the Content-Security-Policy must not allow eval or scripts from any https host.

No chunk of the built app uses eval / new Function (checked 2026-11-05), and the only third-party script is
Razorpay checkout. 'unsafe-inline' stays for now: the two pre-paint boot scripts in index.html and Cloudflare's
injected bot-detection loader are inline. test_page_health fails on any console error, so a CSP violation on any
route fails the gate too."""
import urllib.request

import pytest

from conftest import BASE


def _csp(path):
    req = urllib.request.Request(f"{BASE}{path}", headers={"User-Agent": "Mozilla/5.0 (pymasters-e2e)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.headers.get("Content-Security-Policy", "")


def _directive(csp, name):
    for part in csp.split(";"):
        bits = part.strip().split()
        if bits and bits[0] == name:
            return bits[1:]
    return None


@pytest.mark.parametrize("path", ["/", "/login", "/dashboard/classroom"])
def test_script_src_has_no_eval_and_no_blanket_https(path):
    script_src = _directive(_csp(path), "script-src")
    assert script_src is not None, "no script-src directive"
    assert "'unsafe-eval'" not in script_src, script_src
    assert "https:" not in script_src, script_src          # only named hosts
    assert "'self'" in script_src and "https://checkout.razorpay.com" in script_src, script_src
