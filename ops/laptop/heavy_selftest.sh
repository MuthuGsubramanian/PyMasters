#!/bin/bash
# Self-test for pymasters-heavy.slice: an 8-process CPU burn inside the slice must be capped at ~3 CPUs, and
# freezing the slice's cgroup must stop it. Run: ~/pymasters-ops/heavy_selftest.sh
~/pymasters-ops/heavy python3 -c "
import multiprocessing as m, time
def burn(_):
    t = time.time()
    while time.time() - t < 12: pass
with m.Pool(8) as p: p.map(burn, range(8))" &
sleep 5
CG=/sys/fs/cgroup$(systemctl --user show pymasters-heavy.slice -p ControlGroup --value)
echo "slice cgroup: $CG"
echo "cpu.max: $(cat "$CG/cpu.max")"
U1=$(awk '/usage_usec/{print $2}' "$CG/cpu.stat"); sleep 2; U2=$(awk '/usage_usec/{print $2}' "$CG/cpu.stat")
echo "CPUs used while burning 8 processes: $(( (U2 - U1) / 2000000 ))"
echo 1 > "$CG/cgroup.freeze"; sleep 1
echo "after freeze: $(grep frozen "$CG/cgroup.events")"
F1=$(awk '/usage_usec/{print $2}' "$CG/cpu.stat"); sleep 2; F2=$(awk '/usage_usec/{print $2}' "$CG/cpu.stat")
echo "CPU used while frozen (usec over 2 s): $(( F2 - F1 ))"
echo 0 > "$CG/cgroup.freeze"
wait
echo "done"
