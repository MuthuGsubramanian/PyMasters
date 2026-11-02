"""Owner rule (2026-11-02): an account whose closure-warning email hard-bounces is blocked."""
import sqlite3

import pytest

from notifications import bounces

GMAIL_DSN = b"""From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
To: vaathiyaar@pymasters.net
Subject: Delivery Status Notification (Failure)
Message-ID: <dsn-1@mx.google.com>
X-Failed-Recipients: ghost@nowhere.example
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status; boundary="b1"

--b1
Content-Type: text/plain; charset=UTF-8

Address not found. Your message wasn't delivered to ghost@nowhere.example because the address couldn't be found.

--b1
Content-Type: message/delivery-status

Reporting-MTA: dns; googlemail.com

Final-Recipient: rfc822; ghost@nowhere.example
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 The email account that you tried to reach does not exist.

--b1
Content-Type: text/rfc822-headers

From: Vaathiyaar - PyMasters <vaathiyaar@pymasters.net>
To: ghost@nowhere.example
Subject: Your PyMasters account is scheduled for removal

--b1--
"""

SOFT_DSN = GMAIL_DSN.replace(b"Status: 5.1.1", b"Status: 4.2.2").replace(b"Action: failed", b"Action: delayed") \
    .replace(b"X-Failed-Recipients: ghost@nowhere.example\n", b"").replace(b"<dsn-1@", b"<dsn-2@")


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "t.db")
    c = sqlite3.connect(path)
    c.execute("CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, email TEXT, is_super_admin INTEGER DEFAULT 0, "
              "is_blocked INTEGER DEFAULT 0, token_version INTEGER DEFAULT 0)")
    c.executemany("INSERT INTO users (id, username, email, is_super_admin) VALUES (?,?,?,?)", [
        ("u1", "ghost", "Ghost@Nowhere.example", 0),
        ("u2", "keeper", "keeper@ok.example", 0),
        ("u3", "founder", "founder@pymasters.net", 1),
    ])
    c.commit(); c.close()
    return path


def _user(db, uid):
    c = sqlite3.connect(db)
    row = c.execute("SELECT is_blocked, token_version FROM users WHERE id = ?", [uid]).fetchone()
    c.close()
    return row


def test_parse_gmail_dsn():
    [b] = bounces.parse_bounce(GMAIL_DSN)
    assert b["email"] == "ghost@nowhere.example"
    assert b["status"] == "5.1.1" and b["action"] == "failed"
    assert b["original_subject"] == bounces.NOTICE_SUBJECT


def test_hard_bounce_of_closure_warning_blocks_user(db):
    s = bounces.process_bounces(db, fetch=lambda: [("dsn-1", GMAIL_DSN)])
    assert s["blocked"] == ["ghost"]
    assert _user(db, "u1") == (1, 1)              # blocked and signed out
    assert _user(db, "u2") == (0, 0)
    again = bounces.process_bounces(db, fetch=lambda: [("dsn-1", GMAIL_DSN)])
    assert again["checked"] == 0                    # never processed twice


def test_soft_bounce_does_not_block(db):
    s = bounces.process_bounces(db, fetch=lambda: [("dsn-2", SOFT_DSN)])
    assert s["blocked"] == [] and _user(db, "u1") == (0, 0)


def test_founder_is_never_blocked(db):
    raw = GMAIL_DSN.replace(b"ghost@nowhere.example", b"founder@pymasters.net")
    s = bounces.process_bounces(db, fetch=lambda: [("dsn-3", raw)])
    assert s["blocked"] == [] and _user(db, "u3") == (0, 0)


def test_hard_bounce_of_other_mail_without_notice_is_ignored(db):
    raw = GMAIL_DSN.replace(b"Subject: Your PyMasters account is scheduled for removal", b"Subject: Weekly digest")
    s = bounces.process_bounces(db, fetch=lambda: [("dsn-4", raw)])
    assert s["blocked"] == [] and _user(db, "u1") == (0, 0)


def test_final_failure_after_retries_blocks(db):
    raw = GMAIL_DSN.replace(b"Status: 5.1.1", b"Status: 4.4.7")   # Action: failed stays
    s = bounces.process_bounces(db, fetch=lambda: [("dsn-5", raw)])
    assert s["blocked"] == ["ghost"]
