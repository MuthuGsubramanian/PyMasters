"""Turn a scenario run's junit XML into a small JSON report for the daily email and triage.

  python ops/e2e/scenarios/report.py ops/e2e/out/junit-nightly.xml --image <ref> > ops/e2e/out/nightly-report.json

Shape: {date, image, totals: {passed, failed, flaky, skipped}, failures: [{test, message}]}. A test that failed
and then passed on rerun (pytest-rerunfailures writes <rerunFailure>) counts as flaky, not failed.
"""
import argparse
import json
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone


def summarise(junit_path: str, image: str = "") -> dict:
    root = ET.parse(junit_path).getroot()
    totals = {"passed": 0, "failed": 0, "flaky": 0, "skipped": 0}
    failures = []
    for case in root.iter("testcase"):
        name = f"{case.get('classname', '')}::{case.get('name', '')}".lstrip(":")
        bad = case.find("failure") if case.find("failure") is not None else case.find("error")
        if bad is not None:
            totals["failed"] += 1
            failures.append({"test": name, "message": (bad.get("message") or bad.text or "")[:500]})
        elif case.find("skipped") is not None:
            totals["skipped"] += 1
        elif case.find("rerunFailure") is not None or case.find("rerunError") is not None:
            totals["flaky"] += 1
        else:
            totals["passed"] += 1
    return {"date": datetime.now(timezone.utc).date().isoformat(), "image": image, "totals": totals,
            "failures": failures}


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("junit")
    p.add_argument("--image", default="")
    a = p.parse_args()
    json.dump(summarise(a.junit, a.image), sys.stdout, indent=2)
    print()
