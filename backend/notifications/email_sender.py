"""Email notification sender using SMTP."""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "vaathiyaar@pymasters.net")
FROM_NAME = os.environ.get("FROM_NAME", "Vaathiyaar - PyMasters")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "https://pymasters.net")

# Optional backup SMTP provider (e.g. Brevo) — used if the primary send fails.
SMTP_BACKUP_HOST = os.environ.get("SMTP_BACKUP_HOST", "")
SMTP_BACKUP_PORT = int(os.environ.get("SMTP_BACKUP_PORT", "587"))
SMTP_BACKUP_USER = os.environ.get("SMTP_BACKUP_USER", "")
SMTP_BACKUP_PASS = os.environ.get("SMTP_BACKUP_PASS", "")


def _build_msg(to_email: str, subject: str, body_text: str, body_html: str, from_addr: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{FROM_NAME} <{from_addr}>"
    msg["To"] = to_email
    msg.attach(MIMEText(body_text, "plain"))
    if body_html:
        msg.attach(MIMEText(body_html, "html"))
    return msg


def _smtp_send(host: str, port: int, user: str, pwd: str, msg) -> None:
    with smtplib.SMTP(host, port, timeout=30) as server:
        server.starttls()
        server.login(user, pwd)
        server.send_message(msg)


def send_email(to_email: str, subject: str, body_text: str, body_html: str = None) -> bool:
    """Send an email, trying the primary SMTP then a backup provider. Returns True on success."""
    providers = []
    if SMTP_USER and SMTP_PASS:
        providers.append(("primary", SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS))
    if SMTP_BACKUP_USER and SMTP_BACKUP_PASS:
        providers.append(("backup", SMTP_BACKUP_HOST, SMTP_BACKUP_PORT, SMTP_BACKUP_USER, SMTP_BACKUP_PASS))
    if not providers:
        return False

    for label, host, port, user, pwd in providers:
        try:
            msg = _build_msg(to_email, subject, body_text, body_html, FROM_EMAIL)
            _smtp_send(host, port, user, pwd, msg)
            print(f"[email] sent to {to_email} via {label} ({host})")
            return True
        except Exception as e:
            print(f"[email] {label} ({host}) failed for {to_email}: {e}")
    return False


def build_lesson_ready_email(title: str, topic: str, reason: str, link: str) -> tuple:
    """Build email content for lesson-ready notification. Returns (text, html)."""
    text = f"Vanakkam!\n\nYour custom lesson \"{title}\" is ready on PyMasters.\n\n{reason}\n\nStart learning: {link}\n\n— Vaathiyaar"

    html = f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; padding: 20px; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0;">Vaathiyaar</h2>
            <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">PyMasters</p>
        </div>
        <div style="background: white; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #334155; font-size: 16px;">Vanakkam!</p>
            <p style="color: #475569;">Your custom lesson <strong>"{title}"</strong> is ready.</p>
            <p style="color: #64748b; font-size: 14px;">{reason}</p>
            <a href="{link}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">Start Learning</a>
        </div>
    </div>
    """
    return text, html


def build_reset_email(name: str, reset_link: str) -> tuple:
    """Build a password-reset email. Returns (text, html)."""
    greeting = f"Vanakkam{(' ' + name) if name else ''}!"
    text = (
        f"{greeting}\n\nWe received a request to reset your PyMasters password.\n"
        f"Reset it using the link below (it expires in 1 hour):\n{reset_link}\n\n"
        f"If you didn't request this, you can safely ignore this email.\n\n— PyMasters"
    )
    html = f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #06b6d4, #3b82f6); color: white; padding: 22px; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0;">PyMasters</h2>
            <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">Password reset</p>
        </div>
        <div style="background: white; padding: 26px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #334155; font-size: 16px;">{greeting}</p>
            <p style="color: #475569;">We received a request to reset your PyMasters password.</p>
            <a href="{reset_link}" style="display: inline-block; background: linear-gradient(135deg, #06b6d4, #3b82f6); color: white; padding: 13px 26px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 12px;">Reset Password</a>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 18px;">This link expires in 1 hour. If you didn't request it, ignore this email.<br><span style="color:#475569;">{reset_link}</span></p>
        </div>
    </div>
    """
    return text, html


def _admin_card(header_sub: str, title: str, rows: list, footer: str = "") -> str:
    """Shared inline-styled HTML card for owner/admin notification emails."""
    row_html = "".join(
        f'<tr><td style="padding:4px 10px 4px 0; color:#64748b; font-size:13px; vertical-align:top; white-space:nowrap;">{k}</td>'
        f'<td style="padding:4px 0; color:#334155; font-size:13px;">{v}</td></tr>'
        for k, v in rows if v
    )
    return f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; padding: 22px; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0;">PyMasters</h2>
            <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">{header_sub}</p>
        </div>
        <div style="background: white; padding: 26px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #334155; font-size: 16px; margin-top: 0;"><strong>{title}</strong></p>
            <table style="border-collapse: collapse;">{row_html}</table>
            {f'<p style="color: #94a3b8; font-size: 12px; margin-top: 18px;">{footer}</p>' if footer else ''}
        </div>
    </div>
    """


def build_support_notification_email(kind: str, name: str, email: str, message: str,
                                     extra: str = "") -> tuple:
    """Owner notification for a new support submission. Returns (text, html)."""
    label = "Student access request" if kind == "access" else "Issue report"
    admin_link = f"{APP_BASE_URL}/dashboard/admin"
    text = (
        f"New {label.lower()} on PyMasters.\n\n"
        f"From: {name or '-'} <{email}>\n"
        f"{('Details: ' + extra + chr(10)) if extra else ''}"
        f"Message:\n{message or '-'}\n\n"
        f"Review in the Super Admin console: {admin_link}\n\n— PyMasters"
    )
    html = _admin_card(
        "Support", label,
        [("From", f"{name or '-'} &lt;{email}&gt;"), ("Details", extra), ("Message", message or "-")],
        f'Review and act in the <a href="{admin_link}" style="color:#7c3aed;">Super Admin console</a>.',
    )
    return text, html


def build_tutor_session_email(name: str, email: str, topic: str, preferred_at: str,
                              timezone_name: str, duration: int, notes: str) -> tuple:
    """Owner notification for a new live-tutor session request. Returns (text, html)."""
    admin_link = f"{APP_BASE_URL}/dashboard/admin"
    when = f"{preferred_at} ({timezone_name})" if timezone_name else preferred_at
    text = (
        f"New live tutor session request on PyMasters.\n\n"
        f"From: {name or '-'} <{email}>\nTopic: {topic}\nWhen: {when}\n"
        f"Duration: {duration} min\nNotes: {notes or '-'}\n\n"
        f"Confirm or decline in the Super Admin console: {admin_link}\n\n— PyMasters"
    )
    html = _admin_card(
        "Live tutor sessions", "New session request",
        [("From", f"{name or '-'} &lt;{email}&gt;"), ("Topic", topic), ("When", when),
         ("Duration", f"{duration} min"), ("Notes", notes or "-")],
        f'Confirm or decline in the <a href="{admin_link}" style="color:#7c3aed;">Super Admin console</a>.',
    )
    return text, html


def build_access_decision_email(name: str, approved: bool, note: str = "",
                                needs_signup: bool = False) -> tuple:
    """Requester-facing outcome of a student-access request. Returns (text, html)."""
    greeting = f"Vanakkam{(' ' + name) if name else ''}!"
    if approved:
        body = ("Your student access request has been approved — you now have free "
                "full access to PyMasters for 3 months.")
        action = (f"Create your account with this email address to activate it: {APP_BASE_URL}/login"
                  if needs_signup else f"Log in and start learning: {APP_BASE_URL}/login")
    else:
        body = "We couldn't approve your student access request this time."
        action = f"You can reply to this email or submit a new request with a clearer student ID at {APP_BASE_URL}."
    text = f"{greeting}\n\n{body}\n{('Note from the team: ' + note + chr(10)) if note else ''}{action}\n\n— PyMasters"
    html = _admin_card(
        "Student access",
        "Request approved 🎉" if approved else "Request update",
        [("", body), ("Note", note), ("Next step", action)],
    )
    return text, html


def build_tutor_status_email(name: str, topic: str, preferred_at: str, status: str,
                             note: str = "") -> tuple:
    """Requester-facing tutor-session status update. Returns (text, html)."""
    greeting = f"Vanakkam{(' ' + name) if name else ''}!"
    lines = {
        "confirmed": f'Your live tutor session on "{topic}" is confirmed for {preferred_at}.',
        "cancelled": f'Your live tutor session request on "{topic}" ({preferred_at}) has been cancelled.',
        "completed": f'Your live tutor session on "{topic}" is marked completed. Keep practicing!',
    }
    body = lines.get(status, f'Your live tutor session on "{topic}" is now: {status}.')
    text = f"{greeting}\n\n{body}\n{('Note: ' + note + chr(10)) if note else ''}\n— PyMasters"
    html = _admin_card("Live tutor sessions", f"Session {status}",
                       [("", body), ("Note", note)])
    return text, html


def build_org_request_email(org_name: str, summary: str, message: str) -> tuple:
    """Owner notification for a new org capability request. Returns (text, html)."""
    admin_link = f"{APP_BASE_URL}/dashboard/admin"
    text = (
        f"New organization request on PyMasters.\n\n"
        f"Org: {org_name}\nRequest: {summary}\n"
        f"{('Message: ' + message + chr(10)) if message else ''}\n"
        f"Review in the Super Admin console: {admin_link}\n\n— PyMasters"
    )
    html = _admin_card(
        "Organization requests", "New request",
        [("Org", org_name), ("Request", summary), ("Message", message or "-")],
        f'Review and act in the <a href="{admin_link}" style="color:#7c3aed;">Super Admin console</a>.',
    )
    return text, html


def build_org_request_decision_email(approved: bool, note: str, granted: dict) -> tuple:
    """Requester-facing outcome of an org capability request. Returns (text, html)."""
    if approved:
        detail = ""
        if granted.get("plan"):
            detail = f"Your organization is now on the {granted['plan']} plan"
            if granted.get("expires_at"):
                detail += f" until {str(granted['expires_at'])[:10]}"
            detail += "."
        body = "Your organization request has been approved. " + detail
    else:
        body = "We couldn't approve your organization request this time."
    text = f"Vanakkam!\n\n{body}\n{('Note from the team: ' + note + chr(10)) if note else ''}\n— PyMasters"
    html = _admin_card(
        "Organization requests",
        "Request approved 🎉" if approved else "Request update",
        [("", body), ("Note", note)],
    )
    return text, html


def build_invite_email(org_name: str, role: str, invite_link: str, inviter: str = None) -> tuple:
    """Build email content for an organization invite. Returns (text, html)."""
    who = f"{inviter} has invited you" if inviter else "You've been invited"
    text = (
        f"Vanakkam!\n\n{who} to join {org_name} on PyMasters as a {role}.\n\n"
        f"PyMasters is an AI-powered platform to master Python and AI, guided by your "
        f"personal tutor Vaathiyaar.\n\n"
        f"Accept your invite and set up your account here:\n{invite_link}\n\n"
        f"This link expires in 7 days.\n\n— Vaathiyaar, PyMasters"
    )
    html = f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #06b6d4, #3b82f6); color: white; padding: 22px; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0;">PyMasters</h2>
            <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">Learn Python & AI with Vaathiyaar</p>
        </div>
        <div style="background: white; padding: 26px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #334155; font-size: 16px;">Vanakkam!</p>
            <p style="color: #475569;">{who} to join <strong>{org_name}</strong> on PyMasters as a <strong>{role}</strong>.</p>
            <p style="color: #64748b; font-size: 14px;">PyMasters is an AI-powered platform to master Python and AI, guided by your personal tutor Vaathiyaar.</p>
            <a href="{invite_link}" style="display: inline-block; background: linear-gradient(135deg, #06b6d4, #3b82f6); color: white; padding: 13px 26px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">Accept Invite &amp; Join</a>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 18px;">This invitation link expires in 7 days. If the button doesn't work, paste this into your browser:<br><span style="color:#475569;">{invite_link}</span></p>
        </div>
    </div>
    """
    return text, html
