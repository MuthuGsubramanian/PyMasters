"""The nightly suites parametrise from the live container at collection time; if that fetch failed they would
collect nothing and the night would look green. These guards make an empty collection a failure."""
import pytest

from test_every_boss_battle import TRACKS
from test_every_lesson import LESSONS
from test_every_path import _paths


@pytest.mark.nightly
def test_every_lesson_collected_the_catalogue():
    assert len(LESSONS) >= 400, f"only {len(LESSONS)} lessons collected"


@pytest.mark.nightly
def test_boss_battles_and_paths_collected():
    assert len(TRACKS) >= 10, f"only {len(TRACKS)} tracks collected"
    assert len(_paths()) >= 5
