"""Email helper utilities."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class EmailMessage:
    subject: str
    body: str
    recipient: str


def send_email(message: EmailMessage) -> None:
    """Pretend to send an email (placeholder for integration)."""

    # Replace with SendGrid, Postmark, or AWS SES integration.
    print(f"Dispatching email to {message.recipient}: {message.subject}")
