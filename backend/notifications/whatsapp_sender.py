"""WhatsApp notification sender using Twilio."""

import os

TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.environ.get("TWILIO_WHATSAPP_FROM", "")


def send_whatsapp(to_number: str, message: str) -> bool:
    """Send a WhatsApp message via Twilio. Returns True on success."""
    if not TWILIO_SID or not TWILIO_TOKEN or not TWILIO_FROM:
        return False

    try:
        from twilio.rest import Client
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        client.messages.create(
            body=message,
            from_=TWILIO_FROM,
            to=f"whatsapp:{to_number}" if not to_number.startswith("whatsapp:") else to_number,
        )
        return True
    except Exception as e:
        print(f"WhatsApp send failed: {e}")
        return False


TEMPLATES = {
    "en": "Hey {name}! Your lesson on \"{title}\" is ready. Come learn!\n\n{reason}\n\nhttps://pymasters.net{link}",
    "ta": "வணக்கம் {name}! \"{title}\" பாடம் தயார். வந்து படிங்க!\n\n{reason}\n\nhttps://pymasters.net{link}",
}


def build_whatsapp_message(name: str, title: str, reason: str, link: str, language: str = "en") -> str:
    """Build a WhatsApp message in the user's preferred language."""
    template = TEMPLATES.get(language, TEMPLATES["en"])
    return template.format(name=name, title=title, reason=reason, link=link or "/dashboard/classroom")
