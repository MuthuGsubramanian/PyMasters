"""report.py turns junit XML into the nightly JSON summary (no container needed)."""
from report import summarise

JUNIT = """<?xml version="1.0" encoding="utf-8"?>
<testsuites><testsuite name="pytest" tests="4">
  <testcase classname="nightly.test_every_lesson" name="test_every_lesson[variables_intro]"/>
  <testcase classname="nightly.test_every_lesson" name="test_every_lesson[broken]">
    <failure message="AssertionError: no verified solution">trace</failure></testcase>
  <testcase classname="nightly.test_every_path" name="test_every_path[p1]">
    <rerunFailure message="timeout">first try</rerunFailure></testcase>
  <testcase classname="nightly.test_every_org_type" name="test_every_org_type[other]"><skipped/></testcase>
</testsuite></testsuites>"""


def test_summarise_counts_and_failures(tmp_path):
    f = tmp_path / "junit.xml"
    f.write_text(JUNIT)
    rep = summarise(str(f), image="pymasters:abc")
    assert rep["image"] == "pymasters:abc"
    assert rep["totals"] == {"passed": 1, "failed": 1, "flaky": 1, "skipped": 1}
    assert rep["failures"] == [{"test": "nightly.test_every_lesson::test_every_lesson[broken]",
                                "message": "AssertionError: no verified solution"}]
