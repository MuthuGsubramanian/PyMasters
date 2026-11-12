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
import urllib.parse
from datetime import datetime, timezone

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

# Google Play Billing configuration (Android app in-app digital subscriptions).
PLAY_PACKAGE_NAME = os.getenv("GOOGLE_PLAY_PACKAGE_NAME", "net.pymasters.app").strip() or "net.pymasters.app"
PLAY_PRODUCTS = {
    "pymasters_beginner_monthly": {"plan": "beginner", "kind": "subscription"},
    "pymasters_pro_monthly": {"plan": "pro", "kind": "subscription"},
    "pymasters_beginner_30d": {"plan": "beginner", "kind": "inapp"},
    "pymasters_pro_30d": {"plan": "pro", "kind": "inapp"},
}
ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher"
ANDROID_PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3"


def _cfg():
    return {
        "key_id": os.getenv("RAZORPAY_KEY_ID", "").strip(),
        "key_secret": os.getenv("RAZORPAY_KEY_SECRET", "").strip(),
    }


def is_enabled() -> bool:
    c = _cfg()
    return bool(c["key_id"] and c["key_secret"])


def _play_package_name() -> str:
    return os.getenv("GOOGLE_PLAY_PACKAGE_NAME", PLAY_PACKAGE_NAME).strip() or "net.pymasters.app"


def _play_raw_creds() -> str:
    return (
        os.getenv("PLAY_SERVICE_ACCOUNT_JSON", "").strip()
        or os.getenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "").strip()
        or os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    )


def is_play_enabled() -> bool:
    flag = os.getenv("GOOGLE_PLAY_BILLING_ENABLED", "").strip().lower()
    if flag in ("0", "false", "no", "off"):
        return False
    if flag in ("1", "true", "yes", "on"):
        return True
    return bool(_play_raw_creds())


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


class GooglePlayVerifyRequest(BaseModel):
    product_id: str
    purchase_token: str
    package_name: str | None = None
    order_id: str | None = None


def _play_session():
    """Build an AuthorizedSession for Android Publisher REST API v3 (lazy import, zero new pip deps)."""
    if not is_play_enabled():
        raise HTTPException(status_code=503, detail="Google Play billing is not configured.")
    try:
        import google.auth
        from google.oauth2 import service_account
        from google.auth.transport.requests import AuthorizedSession
    except Exception:
        raise HTTPException(status_code=500, detail="Google Auth SDK unavailable.")

    raw = _play_raw_creds()
    try:
        if raw.startswith("{"):
            info = json.loads(raw)
            creds = service_account.Credentials.from_service_account_info(
                info, scopes=[ANDROID_PUBLISHER_SCOPE]
            )
        elif raw and os.path.isfile(raw):
            creds = service_account.Credentials.from_service_account_file(
                raw, scopes=[ANDROID_PUBLISHER_SCOPE]
            )
        elif raw:
            raise HTTPException(status_code=503, detail="Google Play credentials could not be loaded.")
        else:
            creds, _ = google.auth.default(scopes=[ANDROID_PUBLISHER_SCOPE])
    except HTTPException:
        raise
    except Exception as e:
        print(f"[payments] failed to load Google Play credentials: {e!r}")
        raise HTTPException(status_code=503, detail="Google Play credentials could not be loaded.")

    return AuthorizedSession(creds)


def _parse_play_expiry(raw_value) -> datetime | None:
    """Parse RFC3339 expiryTime (subscriptionsv2) or epoch-ms expiryTimeMillis (v1) to naive UTC datetime."""
    if raw_value is None or raw_value == "":
        return None
    if isinstance(raw_value, (int, float)) or (isinstance(raw_value, str) and raw_value.isdigit()):
        try:
            return datetime.fromtimestamp(int(raw_value) / 1000.0, tz=timezone.utc).replace(tzinfo=None)
        except Exception:
            return None
    s = str(raw_value).strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        return None


def _verify_with_google_play(
    session,
    package_name: str,
    product_id: str,
    purchase_token: str,
    caller: str,
) -> tuple[str | None, str | None]:
    """Validate purchase_token against Android Publisher API v3.

    Returns (verified_order_id, expiry_sql_utc_or_none).
    Raises HTTPException on invalid/expired/mismatched/cross-user tokens.
    """
    product_meta = PLAY_PRODUCTS[product_id]
    pkg_q = urllib.parse.quote(package_name, safe="")
    prod_q = urllib.parse.quote(product_id, safe="")
    tok_q = urllib.parse.quote(purchase_token, safe="")

    if product_meta["kind"] == "subscription":
        url = f"{ANDROID_PUBLISHER_BASE}/applications/{pkg_q}/purchases/subscriptionsv2/tokens/{tok_q}"
    else:
        url = f"{ANDROID_PUBLISHER_BASE}/applications/{pkg_q}/purchases/products/{prod_q}/tokens/{tok_q}"

    try:
        resp = session.get(url, timeout=15)
    except Exception as e:
        print(f"[payments] Google Play API network failure: {e!r}")
        raise HTTPException(status_code=502, detail="Could not reach Google Play verification service.")

    status_code = getattr(resp, "status_code", 500)
    if status_code in (400, 404, 410):
        raise HTTPException(status_code=400, detail="Invalid or expired Google Play purchase token.")
    if status_code in (401, 403):
        print(f"[payments] Google Play API auth failure ({status_code})")
        raise HTTPException(status_code=503, detail="Google Play verification service is unavailable.")
    if status_code >= 400:
        print(f"[payments] Google Play API upstream error ({status_code})")
        raise HTTPException(status_code=502, detail="Could not verify purchase with Google Play.")

    try:
        data = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Malformed response from Google Play.")
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="Malformed response from Google Play.")

    # Cross-user guard if the Android client bound obfuscatedExternalAccountId on launchBillingFlow
    ext_ids = data.get("externalAccountIdentifiers")
    obfuscated_account = (
        (ext_ids.get("obfuscatedExternalAccountId") if isinstance(ext_ids, dict) else None)
        or data.get("obfuscatedExternalAccountId")
        or ""
    ).strip()
    if obfuscated_account and str(obfuscated_account) != str(caller):
        raise HTTPException(status_code=403, detail="This purchase token belongs to another account.")

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    if product_meta["kind"] == "subscription":
        sub_state = (data.get("subscriptionState") or "").strip()
        line_items = data.get("lineItems") if isinstance(data.get("lineItems"), list) else []

        matched_item = None
        if line_items:
            for item in line_items:
                if isinstance(item, dict) and item.get("productId") == product_id:
                    matched_item = item
                    break
            if matched_item is None:
                # If lineItems specify productIds and none match requested product_id, reject tampering!
                has_explicit_ids = any(isinstance(i, dict) and i.get("productId") for i in line_items)
                if has_explicit_ids:
                    raise HTTPException(
                        status_code=400,
                        detail="Purchase token does not match the requested subscription product.",
                    )
                matched_item = line_items[0] if isinstance(line_items[0], dict) else {}

        raw_expiry = (
            (matched_item or {}).get("expiryTime")
            or data.get("expiryTime")
            or data.get("expiryTimeMillis")
        )
        expiry_dt = _parse_play_expiry(raw_expiry)

        if sub_state:
            if sub_state in ("SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"):
                if expiry_dt is not None and expiry_dt <= now_utc:
                    raise HTTPException(status_code=400, detail="Google Play subscription has expired.")
            elif sub_state == "SUBSCRIPTION_STATE_CANCELED":
                # Auto-renew canceled: valid only while current paid period has not yet elapsed
                if expiry_dt is None or expiry_dt <= now_utc:
                    raise HTTPException(status_code=400, detail="Google Play subscription has expired.")
            else:
                raise HTTPException(status_code=400, detail="Google Play subscription is not active.")
        else:
            # Fallback for v1 subscription payload shape
            payment_state = data.get("paymentState")
            if payment_state not in (1, 2) and (expiry_dt is None or expiry_dt <= now_utc):
                raise HTTPException(status_code=400, detail="Google Play subscription is not active.")

        ack_state = data.get("acknowledgementState")
        if ack_state in ("ACKNOWLEDGEMENT_STATE_PENDING", 0):
            ack_url = (
                f"{ANDROID_PUBLISHER_BASE}/applications/{pkg_q}/purchases/"
                f"subscriptions/{prod_q}/tokens/{tok_q}:acknowledge"
            )
            try:
                session.post(ack_url, json={}, timeout=10)
            except Exception as e:
                print(f"[payments] non-fatal Play subscription acknowledge error: {e!r}")

        verified_order_id = (data.get("latestOrderId") or data.get("orderId") or "").strip() or None
        expiry_sql = expiry_dt.strftime("%Y-%m-%d %H:%M:%S") if expiry_dt else None
        return verified_order_id, expiry_sql

    # One-time (inapp) 30-day pass verification
    resp_product = (data.get("productId") or "").strip()
    if resp_product and resp_product != product_id:
        raise HTTPException(status_code=400, detail="Purchase token does not match the requested product.")

    if data.get("purchaseState") != 0:
        raise HTTPException(status_code=400, detail="Google Play purchase is not completed.")

    if data.get("acknowledgementState") == 0:
        ack_url = (
            f"{ANDROID_PUBLISHER_BASE}/applications/{pkg_q}/purchases/"
            f"products/{prod_q}/tokens/{tok_q}:acknowledge"
        )
        try:
            session.post(ack_url, json={}, timeout=10)
        except Exception as e:
            print(f"[payments] non-fatal Play product acknowledge error: {e!r}")

    verified_order_id = (data.get("orderId") or "").strip() or None
    return verified_order_id, None


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
        "google_play": {
            "enabled": is_play_enabled(),
            "package_name": _play_package_name(),
            "products": {
                "beginner": "pymasters_beginner_monthly",
                "pro": "pymasters_pro_monthly",
            },
        },
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


@router.post("/google-play/verify")
def verify_google_play_payment(
    req: GooglePlayVerifyRequest,
    caller: str = Depends(get_current_user_id),
):
    """Verify a Google Play purchase token via Android Publisher REST API v3 and activate the user's plan."""
    product_id = (req.product_id or "").strip()
    purchase_token = (req.purchase_token or "").strip()
    if not (product_id and purchase_token):
        raise HTTPException(status_code=400, detail="Missing Google Play purchase fields.")

    if product_id not in PLAY_PRODUCTS:
        raise HTTPException(status_code=400, detail="Unknown Google Play product.")

    expected_pkg = _play_package_name()
    supplied_pkg = (req.package_name or "").strip()
    if supplied_pkg and supplied_pkg != expected_pkg:
        raise HTTPException(status_code=400, detail="Package name mismatch.")

    plan = PLAY_PRODUCTS[product_id]["plan"]
    grants = PLAN_PRICING.get(plan, {}).get("grants", plan)
    amount = PLAN_PRICING.get(plan, {}).get("amount", 0)
    ledger_order_id = "gplay_" + hashlib.sha256(purchase_token.encode("utf-8")).hexdigest()[:32]

    # Fast pre-check before hitting Google Play API: block cross-user token replay
    # and handle idempotent retries cleanly.
    ensure_payments_table(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    try:
        existing = conn.execute(
            "SELECT user_id, plan, status FROM payments WHERE order_id = ?",
            [ledger_order_id],
        ).fetchone()
    finally:
        conn.close()

    if existing is not None:
        existing_user, existing_plan, existing_status = existing[0], existing[1], existing[2]
        if str(existing_user) != str(caller):
            raise HTTPException(status_code=403, detail="This purchase token belongs to another account.")
        if existing_status == "paid":
            return {"success": True, "plan": existing_plan, "already_processed": True}

    session = _play_session()
    verified_order_id, expiry_sql = _verify_with_google_play(
        session=session,
        package_name=expected_pkg,
        product_id=product_id,
        purchase_token=purchase_token,
        caller=str(caller),
    )

    payment_ref = verified_order_id or (req.order_id or "").strip() or ledger_order_id
    receipt = f"gplay:{product_id}"[:40]

    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            "SELECT user_id, plan, status FROM payments WHERE order_id = ?",
            [ledger_order_id],
        ).fetchone()
        if row is not None:
            row_user, row_plan, row_status = row[0], row[1], row[2]
            if str(row_user) != str(caller):
                raise HTTPException(status_code=403, detail="This purchase token belongs to another account.")
            if row_status == "paid":
                return {"success": True, "plan": row_plan, "already_processed": True}
            conn.execute(
                "UPDATE payments SET status = 'paid', payment_id = ?, paid_at = datetime('now') "
                "WHERE order_id = ?",
                [payment_ref, ledger_order_id],
            )
        else:
            conn.execute(
                "INSERT INTO payments (id, user_id, plan, amount, currency, receipt, order_id, payment_id, status, paid_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', datetime('now'))",
                [str(uuid.uuid4()), str(caller), plan, amount, CURRENCY, receipt, ledger_order_id, payment_ref],
            )

        if expiry_sql:
            conn.execute(
                "UPDATE users SET plan = ?, plan_assigned_at = datetime('now'), plan_expires_at = ? WHERE id = ?",
                [grants, expiry_sql, caller],
            )
        else:
            conn.execute(
                "UPDATE users SET plan = ?, plan_assigned_at = datetime('now'), "
                "plan_expires_at = datetime('now', ?) WHERE id = ?",
                [grants, f"+{PLAN_DURATION_DAYS} days", caller],
            )
        conn.commit()
    finally:
        conn.close()

    return {"success": True, "plan": plan}
