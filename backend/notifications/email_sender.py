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
