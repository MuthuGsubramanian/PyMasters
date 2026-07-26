# Support & Live Tutor Sessions — Design

Date: 2026-07-26 · Author: Claude (autonomous, per MSG's standing authority)

## Goal

Two user-facing capabilities, integrated with the existing FastAPI + SQLite backend and React frontend:

1. **Support** — a button on the public homepage where anyone can (a) request free
   student access for 3 months by uploading a student ID, or (b) report an issue/bug.
2. **Live tutor sessions** — an authenticated learner can request a scheduled 1-on-1
   session. Each request notifies the platform owners by email.

Notification recipients default to `muthu@pymasters.net` and
`muthu.g.subramanian@gmail.com` and are editable by super admins (stored setting).

## Architecture decisions

- **Storage**: SQLite (Litestream-replicated). Student-ID uploads are stored as
  BLOBs in a `support_attachments` table (cap 5 MB, magic-byte checked
  jpg/png/webp/pdf) — the app has no other persistent file store, and Cloud Run
  disk is ephemeral. Served only to super admins via an authenticated endpoint.
- **Email**: reuse `notifications/email_sender.send_email` on daemon threads
  (same fire-and-forget pattern as forgot-password). Template builders added in
  `email_sender.py`.
- **Free 3 months**: a new `student` plan value added to `access.PAID_PLANS`.
  It rides the existing `plan` + `plan_expires_at` columns (expiry = grant time
  + 90 days). It is NOT purchasable (payments validates against its own
  `PLAN_PRICING`). Approving a request grants immediately when a user with that
  email exists; otherwise the approval is stored and auto-granted when the
  requester registers with the same email (hook in `register()`).
- **Settings**: new `platform_settings(key, value)` table + super-admin
  GET/PUT endpoints for `notification_emails` (JSON list). Default falls back to
  env `NOTIFY_EMAILS` then the two owner addresses.
- **Rate limiting**: public support endpoints reuse `SlidingWindowRateLimiter`
  keyed by client IP (support: 5/hr; tutor requests: 5/day per user).

## Backend

- `routes/support.py` — `POST /api/support/access-request` (multipart, public),
  `POST /api/support/issue` (public, optional auth), super-admin:
  `GET /api/support/admin/requests`, `GET /api/support/admin/attachments/{id}`,
  `POST /api/support/admin/requests/{id}/approve|reject|resolve` (audited).
  Tables: `support_requests`, `support_attachments`.
  `apply_approved_access_grant(user_id, email)` consumed by `register()`.
- `routes/tutor_sessions.py` — `POST /api/tutor-sessions` (auth),
  `GET /api/tutor-sessions/mine`, `POST /api/tutor-sessions/{id}/cancel`,
  super-admin: `GET /api/tutor-sessions/admin/list`,
  `POST /api/tutor-sessions/admin/{id}/status` (confirm/cancel/complete →
  emails the requester). Table: `tutor_sessions`.
- `routes/platform_settings.py` — table + `get_notification_emails()` helper +
  `GET/PUT /api/admin/settings/notification-emails` (super-admin, audited).
- `main.py` — include routers, run `ensure_*` in init_db, register() grant hook.
- `access.py` — `PAID_PLANS` gains `student`.

## Frontend

- `components/SupportModal.jsx` — two-tab modal (Student Access / Report Issue),
  file input with client-side size/type validation, success states.
- `pages/Home.jsx` — "Support" nav link + floating bottom-right launcher
  (homepage only; no other fixed corner elements there), live-tutor banner CTA.
- `pages/LiveTutor.jsx` (`/dashboard/live-tutor`) — booking form (topic, date,
  time, duration, notes; timezone auto-detected) + "my sessions" list + cancel.
- `components/Layout.jsx` — "Live Tutor" nav item.
- `pages/SuperAdmin.jsx` — new **Support** tab (sub-views: Access Requests /
  Issues / Tutor Sessions, with attachment preview + approve/reject/confirm) and
  **Settings** tab (notification-email list editor). `student` added to PLANS.
- `api.js` — corresponding client functions.

## Error handling & security

- Public endpoints never leak whether an email has an account.
- Attachment endpoint is super-admin only; blobs never get public URLs.
- Uploads: 5 MB cap enforced server-side after read; content sniffed by magic
  bytes; filename stored but never used as a path.
- Email sending is best-effort (thread, never blocks/raises the request).
- All admin mutations audited via `_audit`.

## Testing

- `tests/test_support.py` — submit access request w/ upload (happy, oversize,
  bad type), issue report, rate limit, admin list/approve→plan grant,
  register-after-approve auto-grant, attachment authz (403 for non-admin).
- `tests/test_tutor_sessions.py` — create/list/cancel, admin status flow, authz.
- `tests/test_platform_settings.py` — default recipients, PUT validation, authz.
- Live verification via uvicorn + scripted HTTP flows; frontend `npm run build`
  + vitest; UI overlay-collision sweep on homepage corners.
