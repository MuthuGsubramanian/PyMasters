"""Security fix 2026-11-02 (C2): when running as root with a sandbox uid (production) but network
isolation is not verified, learner code must be refused rather than run with network access."""
import vaathiyaar.execution as ex


def test_refuses_without_verified_isolation(monkeypatch):
    monkeypatch.setattr(ex, "_sandbox_ids", lambda: (65534, 65534))
    monkeypatch.setattr(ex, "_net_isolation_prefix", lambda: ())
    monkeypatch.delenv("SANDBOX_NET_FIREWALL", raising=False)
    r = ex.run_code_subprocess("print('hi')")
    assert r["exit_code"] == 1 and "temporarily unavailable" in r["error"]


def test_firewall_flag_counts_as_isolated(monkeypatch):
    monkeypatch.setattr(ex, "_net_isolation_prefix", lambda: ())
    monkeypatch.setenv("SANDBOX_NET_FIREWALL", "1")
    assert ex.sandbox_network_isolated()


def test_output_is_capped(monkeypatch):
    r = ex.run_code_subprocess("print('x' * 200000)")
    assert r["exit_code"] == 0
    assert len(r["output"]) < 70000 and "truncated" in r["output"]
