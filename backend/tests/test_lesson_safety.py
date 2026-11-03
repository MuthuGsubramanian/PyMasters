"""Classroom grading gate (check_lesson_safety).

The old strict gate (check_code_safety) refused asyncio, threading, io, os, sys, sqlite3, open, input and
__dict__, so ~58 lessons that TEACH those things rejected correct code — no learner could pass them. The real
boundary is the sandbox (own uid, verified network isolation, rlimits, secret-free env); the gate now blocks
only the escape surface, and a lesson may use whatever its own server-authored starter/test code uses.
"""
import pytest

from vaathiyaar.execution import check_lesson_safety


@pytest.mark.parametrize("code", [
    "import asyncio\nasync def f():\n    return 1\nprint(asyncio.run(f()))",
    "import threading\nt = threading.Thread(target=print, args=('x',))\nt.start(); t.join()",
    "import io\nbuf = io.StringIO('a,b')\nprint(buf.read())",
    "import os, sys\nprint(os.getcwd() is not None, sys.version_info.major)",
    "import sqlite3\nc = sqlite3.connect(':memory:')\nprint(c.execute('select 1').fetchone())",
    "with open('notes.txt', 'w') as f:\n    f.write('hi')",
    "from pathlib import Path\nprint(Path('.').exists())",
    "try:\n    name = input()\nexcept EOFError:\n    name = 'world'\nprint(name)",
])
def test_teaching_stdlib_is_allowed(code):
    assert check_lesson_safety(code) is None


@pytest.mark.parametrize("code,needle", [
    ("import subprocess\nsubprocess.run(['ls'])", "subprocess"),
    ("import socket", "socket"),
    ("import ctypes", "ctypes"),
    ("from multiprocessing import Pool", "multiprocessing"),
    ("eval('1+1')", "eval"),
    ("exec('print(1)')", "exec"),
    ("__import__('os')", "__import__"),
    ("print(().__class__.__bases__[0].__subclasses__())", "access to '__"),
    ("import importlib\nimportlib.import_module('subprocess')", "importlib"),
])
def test_escape_surface_stays_blocked(code, needle):
    reason = check_lesson_safety(code)
    assert reason and needle in reason, reason


def test_lesson_may_use_what_its_own_code_uses():
    descriptor_lesson = "class Field:\n    def __set__(self, obj, v):\n        obj.__dict__['x'] = v\n"
    learner = "class P:\n    def __init__(self):\n        self.__dict__['x'] = 1\nprint(P().__dict__)"
    assert check_lesson_safety(learner) is not None
    assert check_lesson_safety(learner, lesson_code=descriptor_lesson) is None
    importlib_lesson = "import importlib\nm = importlib.import_module('json')\n"
    assert check_lesson_safety("import importlib\nprint(importlib.import_module('math').pi)",
                               lesson_code=importlib_lesson) is None
    # ...but only what the lesson uses: a lesson using __dict__ does not unlock __subclasses__.
    assert check_lesson_safety("print(object.__subclasses__())", lesson_code=descriptor_lesson) is not None
