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


def send_email(to_email: str, subject: str, body_text: str, body_html: str = None) -> bool:
    """Send an email notification. Returns True on success."""
    if not SMTP_USER or not SMTP_PASS:
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{FROM_NAME} <{FROM_EMAIL}>"
    msg["To"] = to_email

    msg.attach(MIMEText(body_text, "plain"))
    if body_html:
        msg.attach(MIMEText(body_html, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"Email send failed: {e}")
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
