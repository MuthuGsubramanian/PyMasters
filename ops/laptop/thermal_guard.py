#!/usr/bin/env python3
"""Thermal guard for the PyMasters laptop.

The laptop hit `acpitz: critical temperature reached` (trip 100 C) and the kernel did a hardware-protection
power-off on 2026-11-02 while the social bot rendered video. This guard keeps our own heavy work below that:

  temp >= PAUSE_AT   -> SIGSTOP every process in the heavy systemd units (they freeze, nothing is lost)
  temp <= RESUME_AT  -> SIGCONT them again (hysteresis)
  temp >= ALERT_AT   -> desktop notification + log line (something else is heating the machine too)

Logs: ~/pymasters-ops/thermal.log (events) and ~/pymasters-ops/thermal.csv (one sample per minute)."""
import glob
import os
import signal
import subprocess
import time
from datetime import datetime

PAUSE_AT, RESUME_AT, ALERT_AT = 84.0, 70.0, 92.0
MIN_PAUSE_S = 90    # this laptop heats/cools in seconds; short pauses just oscillate
HEAVY_UNITS = ["pymasters-social.service"]   # the status email is light; never freeze it
LOG = os.path.expanduser("~/pymasters-ops/thermal.log")
CSV = os.path.expanduser("~/pymasters-ops/thermal.csv")
UID = os.getuid()


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


def unit_pids(unit):
    try:
        cg = subprocess.run(["systemctl", "--user", "show", unit, "-p", "ControlGroup", "--value"],
                            capture_output=True, text=True, timeout=5).stdout.strip()
        if not cg:
            return []
        with open(f"/sys/fs/cgroup{cg}/cgroup.procs") as f:
            return [int(p) for p in f.read().split()]
    except (OSError, subprocess.SubprocessError, ValueError):
        return []


def signal_units(sig):
    n = 0
    for u in HEAVY_UNITS:
        for pid in unit_pids(u):
            try:
                os.kill(pid, sig)
                n += 1
            except ProcessLookupError:
                pass
    return n


def log(msg):
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    with open(LOG, "a") as f:
        f.write(line + "\n")
    print(line, flush=True)


def notify(msg):
    subprocess.run(["notify-send", "-u", "critical", "-a", "PyMasters thermal guard", "Laptop is very hot", msg],
                   capture_output=True, timeout=5)


def main():
    paused, last_csv, last_alert, paused_at = False, 0, 0, 0
    window = []   # acpitz samples (the zone whose 100 C trip powers the laptop off); k10temp spikes instantly
    signal_units(signal.SIGCONT)   # never leave work frozen by a previous guard instance
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
            log(f"ALERT {hot:.0f}C (critical trip is 100C) temps={t}")
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
