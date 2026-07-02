"""
payments.py -- Razorpay Standard Checkout (order creation + signature verify).

Turns the Upgrade page's "email us" placeholders into real online payments.
Fully config-gated like the OAuth routes: the flow is only advertised/enabled
when RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are present, so a stock
`git clone && run` (and CI) is unaffected.

No secrets live in code; everything reads from the environment / Secret Manager:

    RAZORPAY_KEY_ID
    RAZORPAY_KEY_SECRET

The public KEY_ID is served to the browser via GET /api/payments/config and is
echoed back from create-order (that is how Razorpay Checkout itself works). The
KEY_SECRET never leaves the backend — it is used only to authenticate the order
API call and to recompute the HMAC-SHA256 signature on verify.

Amounts are decided SERVER-SIDE from the plan (never trusted from the client),
so a tampered request can't buy Pro for ₹1. On a verified payment we activate
the user's plan for one month using the same columns the super-admin plan
endpoints write (plan / plan_assigned_at / plan_expires_at), so the existing
access.py trial/plan resolver picks it up with no other changes.

Prefix: /api/payments
"""

import os
import time
import hmac
import json
import uuid
import hashlib
import sqlite3

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth import get_current_user_id

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))

router = APIRouter(prefix="/api/payments", tags=["payments"])

# Server-side price list (INR paise). The client picks a plan, never an amount,
# so pricing is authoritative here. Keep in sync with frontend Upgrade.jsx.
# 30-day access is granted on success (plans are billed "per month").
PLAN_PRICING = {
    "beginner": {"amount": 29900, "label": "Beginner", "grants": "beginner"},
    "pro": {"amount": 99900, "label": "Pro", "grants": "pro"},
}
PLAN_DURATION_DAYS = 30
CURRENCY = "INR"
MIN_AMOUNT_PAISE = 100  # Razorpay's minimum charge


def _cfg():
    return {
        "key_id": os.getenv("RAZORPAY_KEY_ID", "").strip(),
        "key_secret": os.getenv("RAZORPAY_KEY_SECRET", "").strip(),
    }


def is_enabled() -> bool:
    c = _cfg()
    return bool(c["key_id"] and c["key_secret"])


def ensure_payments_table(db_path: str = None) -> None:
    """Idempotent schema bootstrap for the payments ledger. Mirrors the
    ensure_*_tables pattern used by the social/oauth routes."""
    conn = sqlite3.connect(db_path or DB_PATH)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS payments (
                id            TEXT PRIMARY KEY,
                user_id       TEXT NOT NULL,
                plan          TEXT NOT NULL,
                amount        INTEGER NOT NULL,
                currency      TEXT NOT NULL DEFAULT 'INR',
                receipt       TEXT,
                order_id      TEXT UNIQUE,
                payment_id    TEXT,
                status        TEXT NOT NULL DEFAULT 'created',
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                paid_at       TIMESTAMP
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id)")
        conn.commit()
    finally:
        conn.close()


def _client():
    """Build an authenticated Razorpay client, or raise a clean error."""
    c = _cfg()
    if not (c["key_id"] and c["key_secret"]):
        raise HTTPException(status_code=503, detail="Online payments are not configured.")
    try:
        import razorpay
    except Exception:
        raise HTTPException(status_code=500, detail="Payment SDK unavailable.")
    return razorpay.Client(auth=(c["key_id"], c["key_secret"]))


# ── Models ──────────────────────────────────────────────────────────────────
class CreateOrderRequest(BaseModel):
    plan: str  # "beginner" | "pro"


class VerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


# ── Routes ──────────────────────────────────────────────────────────────────
@router.get("/config")
def payment_config():
    """Public config for the checkout UI. Returns the publishable key id only —
    never the secret. Frontend uses `enabled` to show/hide the pay buttons."""
    c = _cfg()
    return {
        "enabled": is_enabled(),
        "key_id": c["key_id"] if is_enabled() else "",
        "currency": CURRENCY,
        "plans": {k: {"amount": v["amount"], "label": v["label"]} for k, v in PLAN_PRICING.items()},
    }


@router.post("/create-order")
def create_order(req: CreateOrderRequest, caller: str = Depends(get_current_user_id)):
    """Create a Razorpay order for the given plan. Amount is derived server-side."""
    plan = (req.plan or "").strip().lower()
    if plan not in PLAN_PRICING:
        raise HTTPException(status_code=400, detail="Unknown plan.")

    amount = PLAN_PRICING[plan]["amount"]
    if amount < MIN_AMOUNT_PAISE:
        raise HTTPException(status_code=400, detail="Amount below the minimum allowed.")

    client = _client()

    # Keep receipts <= 40 chars (Razorpay constraint): short user prefix + time.
    receipt = f"pm_{caller[:8]}_{int(time.time())}"
    try:
        order = client.order.create({
            "amount": amount,
            "currency": CURRENCY,
            "receipt": receipt,
            "payment_capture": 1,
            "notes": {"user_id": caller, "plan": plan},
        })
    except Exception as e:
        # razorpay.errors.BadRequestError carries auth/validation failures.
        msg = str(e)
        status = 401 if ("authentication" in msg.lower() or "unauthorized" in msg.lower()) else 500
        print(f"[payments] order create failed: {e!r}")
        raise HTTPException(status_code=status, detail="Could not start checkout. Please try again.")

    # Record the pending order so verify can reconcile amount/plan without
    # trusting the client, and to make repeat verifies idempotent.
    try:
        ensure_payments_table(DB_PATH)
        conn = sqlite3.connect(DB_PATH)
        try:
            conn.execute(
                "INSERT INTO payments (id, user_id, plan, amount, currency, receipt, order_id, status) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 'created')",
                [str(uuid.uuid4()), caller, plan, amount, CURRENCY, receipt, order["id"]],
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        print(f"[payments] ledger write failed (non-fatal): {e!r}")

    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "key_id": _cfg()["key_id"],
        "plan": plan,
    }


@router.post("/verify")
def verify_payment(req: VerifyRequest, caller: str = Depends(get_current_user_id)):
    """Verify the Razorpay signature and, only on a match, activate the plan.

    Signature = HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET).
    """
    order_id = (req.razorpay_order_id or "").strip()
    payment_id = (req.razorpay_payment_id or "").strip()
    signature = (req.razorpay_signature or "").strip()
    if not (order_id and payment_id and signature):
        raise HTTPException(status_code=400, detail="Missing payment fields.")

    secret = _cfg()["key_secret"]
    if not secret:
        raise HTTPException(status_code=503, detail="Online payments are not configured.")

    expected = hmac.new(
        secret.encode("utf-8"),
        f"{order_id}|{payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, signature):
        # Signature mismatch — do NOT mark as paid.
        print(f"[payments] signature mismatch for order {order_id}")
        raise HTTPException(status_code=400, detail="Payment verification failed.")

    # Signature is valid. Reconcile against the order we created (authoritative
    # plan/owner), then activate. Falls back gracefully if the ledger row is
    # missing (e.g. the non-fatal write above failed) by trusting the verified
    # order id but refusing to guess a plan.
    ensure_payments_table(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            "SELECT user_id, plan, status FROM payments WHERE order_id = ?", [order_id]
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=400, detail="Unknown order.")
        order_user, plan, status = row[0], row[1], row[2]
        if order_user != caller:
            # A verified signature for someone else's order must not upgrade you.
            raise HTTPException(status_code=403, detail="This order belongs to another account.")
        if status == "paid":
            # Idempotent: replaying a valid verify is a no-op success.
            return {"success": True, "plan": plan, "already_processed": True}

        grants = PLAN_PRICING.get(plan, {}).get("grants", plan)
        conn.execute(
            "UPDATE users SET plan = ?, plan_assigned_at = datetime('now'), "
            "plan_expires_at = datetime('now', ?) WHERE id = ?",
            [grants, f"+{PLAN_DURATION_DAYS} days", caller],
        )
        conn.execute(
            "UPDATE payments SET status = 'paid', payment_id = ?, paid_at = datetime('now') "
            "WHERE order_id = ?",
            [payment_id, order_id],
        )
        conn.commit()
    finally:
        conn.close()

    return {"success": True, "plan": plan}
