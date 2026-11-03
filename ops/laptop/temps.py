#!/usr/bin/env python3
"""Print the laptop's temperatures (thermal zones + CPU/GPU/NVMe sensors), the load, and the top CPU users."""
import glob
import os
import subprocess

vals = []
for z in sorted(glob.glob("/sys/class/thermal/thermal_zone*")):
    try:
        vals.append(f"{open(z + '/type').read().strip()}={int(open(z + '/temp').read()) / 1000:.0f}C")
    except OSError:
        pass
for h in sorted(glob.glob("/sys/class/hwmon/hwmon*")):
    try:
        name = open(h + "/name").read().strip()
        if name in ("k10temp", "coretemp", "amdgpu", "nvme"):
            vals.append(f"{name}={int(open(h + '/temp1_input').read()) / 1000:.0f}C")
    except OSError:
        pass
print(" ".join(vals))
print("load", " ".join(f"{x:.2f}" for x in os.getloadavg()))
top = subprocess.run(["ps", "-eo", "pcpu,comm", "--sort=-pcpu", "--no-headers"], capture_output=True, text=True)
print("top:", "; ".join(" ".join(line.split()) for line in top.stdout.splitlines()[:4]))
