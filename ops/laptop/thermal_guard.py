#!/usr/bin/env python3
"""Thermal guard for the PyMasters laptop.

The laptop hit `acpitz: critical temperature reached` (trip 100 C) and the kernel did a hardware-protection
power-off on 2026-11-02 while the social bot rendered video. This guard keeps our own heavy work below that:

  temp >= PAUSE_AT   -> freeze the heavy cgroups (cgroup.freeze: nothing is lost, they just stop)
  temp <= RESUME_AT  -> thaw them again (hysteresis)
  temp >= ALERT_AT   -> desktop notification + log line with the top CPU users (something else is heating it)

v2 (2026-11-03, after a second hardware power-off at 100 C): the guard used to signal only the social bot
service, while builds, test containers, headless browsers and generators ran outside it ("0 processes"
paused). All heavy ops work now runs in pymasters-heavy.slice (CPUQuota 300% of 8 threads; start jobs with
~/pymasters-ops/heavy <cmd>; test containers via podman --cgroup-parent), and the guard freezes that whole
slice plus the social bot, earlier (80 C instead of 84 C).

Logs: ~/pymasters-ops/thermal.log (events) and ~/pymasters-ops/thermal.csv (one sample per minute)."""
import glob
import os
import signal
import subprocess
import time
from datetime import datetime

PAUSE_AT, RESUME_AT, ALERT_AT = 80.0, 68.0, 90.0
MIN_PAUSE_S = 90    # this laptop heats/cools in seconds; short pauses just oscillate
# The status email is light; never freeze it. The slice holds every heavy job started via ~/pymasters-ops/heavy.
LOG = os.path.expanduser("~/pymasters-ops/thermal.log")
CSV = os.path.expanduser("~/pymasters-ops/thermal.csv")
UID = os.getuid()
# Fixed cgroupfs paths, never resolved through systemctl: on 2026-11-04 a freeze caught systemd spawning a unit
# into the slice, systemd blocked, `systemctl --user show` timed out and the guard could not thaw (deadlock).
_USER_CG = f"/sys/fs/cgroup/user.slice/user-{UID}.slice/user@{UID}.service"
HEAVY_CGROUPS = [f"{_USER_CG}/pymasters.slice/pymasters-heavy.slice",        # every heavy job incl. the social bot
                 f"{_USER_CG}/app.slice/pymasters-social.service"]          # legacy placement, if still there


def temps():
    out = {}
    for z in glob.glob("/sys/class/thermal/thermal_zone*"):
        try:
            out[open(f"{z}/type").read().strip()] = int(open(f"{z}/temp").read()) / 1000
        except OSError:
            pass
    for h in glob.glob("/sys/class/hwmon/hwmon*"):
        try:
            name = open(f"{h}/name").read().strip()
            if name in ("k10temp", "coretemp", "amdgpu", "nvme"):
                out.setdefault(name, int(open(f"{h}/temp1_input").read()) / 1000)
        except OSError:
            pass
    return out


def count_procs(cg):
    n = 0
    for root, _dirs, files in os.walk(cg):
        if "cgroup.procs" in files:
            try:
                n += len(open(os.path.join(root, "cgroup.procs")).read().split())
            except OSError:
                pass
    return n


def continue_stopped(cg):
    """SIGCONT every SIGSTOPped process in the subtree. Thawing a cgroup does not undo a SIGSTOP: on 2026-11-03 the
    v1 guard (which signalled processes) was replaced mid-pause and left a social-bot tick stopped for 6 hours."""
    n = 0
    for root, _dirs, files in os.walk(cg):
        if "cgroup.procs" not in files:
            continue
        try:
            pids = [int(p) for p in open(os.path.join(root, "cgroup.procs")).read().split()]
        except (OSError, ValueError):
            continue
        for pid in pids:
            try:
                if open(f"/proc/{pid}/stat").read().rsplit(")", 1)[1].split()[0] == "T":
                    os.kill(pid, signal.SIGCONT)
                    n += 1
            except (OSError, IndexError):
                pass
    return n


def _pids(cg):
    pids = []
    for root, _dirs, files in os.walk(cg):
        if "cgroup.procs" in files:
            try:
                pids += [int(x) for x in open(os.path.join(root, "cgroup.procs")).read().split()]
            except (OSError, ValueError):
                pass
    return pids


def signal_units(sig):
    """Freeze (SIGSTOP) / thaw (SIGCONT) each heavy cgroup subtree via cgroup.freeze, which also catches children
    spawned later (podman containers placed in the slice, browser renderers, ...)."""
    n = 0
    for cg in HEAVY_CGROUPS:
        if not os.path.isdir(cg):
            continue
        try:
            with open(os.path.join(cg, "cgroup.freeze"), "w") as f:
                f.write("1" if sig == signal.SIGSTOP else "0")
            if sig == signal.SIGCONT:
                continue_stopped(cg)
            n += count_procs(cg)
        except OSError:   # no freezer here: fall back to signalling the processes directly
            for pid in _pids(cg):
                try:
                    os.kill(pid, sig)
                    n += 1
                except ProcessLookupError:
                    pass
    return n


def top_cpu(n=5):
    """The processes using the most CPU right now, for the alert log (what is heating the machine)."""
    try:
        out = subprocess.run(["ps", "-eo", "pcpu,comm", "--sort=-pcpu", "--no-headers"],
                             capture_output=True, text=True, timeout=5).stdout.splitlines()[:n]
        return ", ".join(" ".join(line.split()[::-1]) + "%" for line in out)
    except subprocess.SubprocessError:
        return "?"


def log(msg):
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    with open(LOG, "a") as f:
        f.write(line + "\n")
    print(line, flush=True)


def notify(msg):
    subprocess.run(["notify-send", "-u", "critical", "-a", "PyMasters thermal guard", "Laptop is very hot", msg],
                   capture_output=True, timeout=5)


def on_term(_signum, _frame):
    """A stopped guard must not leave work frozen with nobody watching to thaw it."""
    signal_units(signal.SIGCONT)
    log("guard stopping: heavy work thawed")
    raise SystemExit(0)


def start_state():
    """Thaw work a previous guard instance left frozen, but only if the laptop is already cool; a guard (re)started
    while hot freezes first. Returns True when starting paused."""
    t = temps()
    hot = t.get("acpitz") or t.get("k10temp") or 0
    if hot > RESUME_AT:
        signal_units(signal.SIGSTOP)
        log(f"guard starting hot at {hot:.0f}C: heavy work stays paused")
        return True
    signal_units(signal.SIGCONT)
    return False


def main():
    last_csv, last_alert = 0, 0
    window = []   # acpitz samples (the zone whose 100 C trip powers the laptop off); k10temp spikes instantly
    signal.signal(signal.SIGTERM, on_term)
    paused = start_state()
    paused_at = time.time() if paused else 0
    log(f"guard started (pause >= {PAUSE_AT}C, resume <= {RESUME_AT}C, alert >= {ALERT_AT}C)")
    while True:
        t = temps()
        window = (window + [t.get("acpitz") or t.get("k10temp") or 0])[-3:]   # ~15 s moving average
        hot = sum(window) / len(window)
        if not paused and hot >= PAUSE_AT:
            n = signal_units(signal.SIGSTOP)
            paused, paused_at = True, time.time()
            log(f"PAUSE heavy work at {hot:.0f}C ({n} processes) temps={t}")
        elif paused:
            signal_units(signal.SIGSTOP)  # also freeze anything the paused units spawned meanwhile
            if hot <= RESUME_AT and time.time() - paused_at >= MIN_PAUSE_S:
                n = signal_units(signal.SIGCONT)
                paused = False
                log(f"RESUME heavy work at {hot:.0f}C ({n} processes)")
        if hot >= ALERT_AT and time.time() - last_alert > 120:
            last_alert = time.time()
            log(f"ALERT {hot:.0f}C (critical trip is 100C) temps={t} top={top_cpu()}")
            notify(f"{hot:.0f}°C — the hardware cuts power at 100°C. Bot work is paused; check vents/airflow.")
        if time.time() - last_csv >= 60:
            last_csv = time.time()
            new = not os.path.exists(CSV)
            with open(CSV, "a") as f:
                if new:
                    f.write("time,acpitz,k10temp,amdgpu,nvme,paused\n")
                f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S},{t.get('acpitz','')},{t.get('k10temp','')},"
                        f"{t.get('amdgpu','')},{t.get('nvme','')},{int(paused)}\n")
        time.sleep(5)


if __name__ == "__main__":
    main()
