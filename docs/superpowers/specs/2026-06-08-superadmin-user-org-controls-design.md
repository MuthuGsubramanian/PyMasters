# Super Admin — User & Org Controls + Admin Management + Audit (Slice B)

**Date:** 2026-06-08
**Status:** Design — approved (Part 1 + Part 2), proceeding autonomously to plan
**Surface:** `frontend/src/pages/SuperAdmin.jsx` (+ new drawer components) · `backend/routes/admin.py` · `backend/auth.py` · `backend/main.py` (schema)

---

## 1. Goal & Context

The platform Super Admin console today (3 tabs) only shows counts + a usage chart and offers two user actions (block/unblock, set plan). This slice gives the super-admin real **controls and visibility over accounts**: per-user and per-org drill-down with a full action set, DB-backed admin-role management (so adding admins no longer needs an env edit + redeploy), and an **audit log** of every admin action.

This is **Slice B** of a four-part roadmap (B → A visibility/analytics → C product/AI ops → D governance/safety). The audit log built here is the foundation D later expands.

### Decisions locked during brainstorming
- **Admin model:** DB `users.is_super_admin` flag, managed in-console, **plus** the env `SUPER_ADMIN_EMAILS` allowlist kept permanently as **break-glass** (those identities are always super-admin and can never be demoted/locked out).
- **User actions in v1:** delete + edit profile; reset password + revoke sessions; grant/revoke super-admin + change org role; **read-only view-as**.
- **Impersonation depth:** **read-only view-as** only — the console renders the user's data read-only via admin endpoints; **no token is ever issued as the user** and no write paths change.
- **Approach A:** reuse the slide-over **drawer** pattern (as shipped for the institutional console); session revocation via a `token_version` claim; audit table + tab.
- **Verification:** **live user testing** against the running app with a throwaway test user/org (no unit suites), consistent with project practice.

### Out of scope (→ later cycles)
- Slice A (analytics/engagement/AI-cost/system-health dashboards), Slice C (content/AI ops, broadcasts), Slice D (moderation/abuse beyond the audit log).
- Full (write-capable) impersonation.

---

## 2. Architecture Overview

```
SuperAdmin.jsx
  ├── Users tab ── row → UserAdminDrawer ──┐
  │                                        ├─ GET    /api/admin/users/{id}            (detail)
  │                                        ├─ GET    /api/admin/users/{id}/view-as    (read-only learner data)
  │                                        ├─ PATCH  /api/admin/users/{id}            (edit)
  │                                        ├─ DELETE /api/admin/users/{id}
  │                                        ├─ POST   /api/admin/users/{id}/super-admin|role|reset-password|revoke-sessions
  │                                        └─ (existing) block, plan  + audit
  ├── Admins tab ── list super-admins, promote-by-search
  ├── Orgs tab  ── row → OrgAdminDrawer ── GET /api/admin/orgs/{id} + plan|type|DELETE
  └── Audit tab ── GET /api/admin/audit (paged)

auth.py:  JWT gains `tv` claim; verification checks tv == users.token_version (revocation)
admin.py: require_super_admin = env break-glass OR users.is_super_admin; _audit() helper
Schema:   users.is_super_admin, users.token_version, admin_audit table
```

No new infra. SQLite + Litestream single-writer unchanged.

---

## 3. Data Model (`backend/main.py` init)

Follow the existing `PRAGMA table_info(users)` → `ALTER TABLE … ADD COLUMN` migration pattern:
- `is_super_admin INTEGER DEFAULT 0`
- `token_version INTEGER DEFAULT 0`

New table:
```sql
CREATE TABLE IF NOT EXISTS admin_audit (
    id          TEXT PRIMARY KEY,
    actor_id    TEXT NOT NULL,
    actor_name  TEXT,
    action      TEXT NOT NULL,      -- user.block | user.plan | user.edit | user.delete |
                                    -- user.super_admin | user.role | user.reset | user.revoke |
                                    -- user.view_as | org.plan | org.type | org.delete
    target_type TEXT,               -- 'user' | 'org'
    target_id   TEXT,
    detail      TEXT,               -- JSON string
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target  ON admin_audit(target_type, target_id);
```

---

## 4. Auth Model (`backend/auth.py`, `backend/routes/admin.py`)

### 4.1 DB-backed super-admin + break-glass
`require_super_admin(user_id)` (admin.py) returns true when **either**:
- the account's `username` or `email` (lowercased) is in the env `SUPER_ADMINS` set (**break-glass, always wins**), **or**
- `users.is_super_admin = 1`.

A helper `is_break_glass(username, email)` is used to protect env admins from demotion/deletion.

### 4.2 Session revocation via `token_version`
- `create_access_token(user_id, username, token_version)` adds `"tv": token_version` to the JWT payload. Login reads the user's current `token_version` and embeds it.
- `_extract(authorization)` (after decoding + `sub`): reads `SELECT token_version FROM users WHERE id = sub`; if the row is missing or `token_version != payload["tv"]` → `401 "Session ended. Please sign in again."` `optional_user_id` maps that to `None`.
- **Effect:** bumping a user's `token_version` invalidates all their outstanding JWTs → forced re-login. Also permanently fixes the silent stale-token problem.
- **Cost:** one indexed `users` read per authenticated request — acceptable on the single-instance SQLite deployment.
- Backward-compat: tokens issued before this change have no `tv`; treat missing `tv` as `0` so current sessions keep working until natural expiry (or are revoked).

### 4.3 Audit helper
`_audit(conn, actor_id, actor_name, action, target_type, target_id, detail: dict)` inserts an `admin_audit` row (uuid id, `json.dumps(detail)`). Every mutating admin endpoint calls it; the **actor is always derived from the JWT**, never the client.

---

## 5. Backend API (`backend/routes/admin.py`)

All require `require_super_admin`. Mutations are audited.

| Method | Route | Purpose / notes |
|---|---|---|
| `GET` | `/admin/users/{id}` | Detail: profile, plan, is_blocked, is_super_admin, account_type, created_at, points, last_active, lessons_completed, weak topics, recent activity, **org memberships** (org id/name/role), recent audit rows for this user, `is_break_glass`, `has_email` |
| `GET` | `/admin/users/{id}/view-as` | Read-only learner snapshot (overview stats, path/progress summary, recent lessons) for the view-as panel |
| `PATCH` | `/admin/users/{id}` | Edit `name`, `email`, `account_type` (only provided fields) |
| `DELETE` | `/admin/users/{id}` | Delete user + cascade (`org_members`, `lesson_completions`, `learning_signals`, `user_mastery`, `generated_lessons`, `module_generation_jobs`, `notifications`, `playground_*`). **`admin_audit` rows are intentionally preserved** (the trail must survive the deletion, incl. the delete itself). **Guards:** 400 if target `is_break_glass`; 400 if `id == caller` (no self-delete) |
| `POST` | `/admin/users/{id}/super-admin` | Body `{value: bool}` → set `is_super_admin`. **Guards:** 400 if target `is_break_glass` (it's env-defined, toggling is meaningless); 400 if demoting self |
| `POST` | `/admin/users/{id}/role` | Body `{org_id, role}` → set the user's role in that org (validates role ∈ super_admin/admin/manager/member; the org's last-super-admin guard from org routes applies) |
| `POST` | `/admin/users/{id}/reset-password` | Reuses the forgot-password email flow. 400 if the account has no email on file |
| `POST` | `/admin/users/{id}/revoke-sessions` | `UPDATE users SET token_version = token_version + 1` |
| `GET` | `/admin/orgs/{id}` | Org detail: name, type, plan, member_count, members (id/name/role), created_at |
| `POST` | `/admin/orgs/{id}/plan` · `…/type` | Set org plan / type |
| `DELETE` | `/admin/orgs/{id}` | Reuse the org cascade delete (incl. `org_member_groups`) |
| `GET` | `/admin/audit` | Paged (`limit`,`offset`), optional `target_type`/`target_id` filter; newest first |

Existing `POST /admin/users/{id}/block` and `/plan` gain `_audit` calls.

---

## 6. Frontend (`frontend/src/pages/SuperAdmin.jsx`, new components, `api.js`)

### 6.1 New API client fns (`api.js`)
`getAdminUserDetail`, `getAdminUserViewAs`, `adminUpdateUser`, `adminDeleteUser`, `adminSetSuperAdmin`, `adminSetUserRole`, `adminResetPassword`, `adminRevokeSessions`, `getAdminOrgDetail`, `adminSetOrgPlan`, `adminSetOrgType`, `adminDeleteOrg`, `getAdminAudit`.

### 6.2 `UserAdminDrawer` (new component)
Slide-over (same a11y as `StudentDrawer`: `role="dialog"`, ESC, focus-return, reduced-motion). Contents:
- **Header:** avatar, name, `@username`, email (or a `no email on file` chip), status badges: plan · `blocked` · `super-admin` (`env · locked` if break-glass) · account_type.
- **Summary:** XP · lessons · last-active · signup date.
- **Org memberships:** list of `{org, role}` with an inline role selector → `adminSetUserRole`.
- **Actions** (gated/guarded): Block/Unblock · Set Plan · Edit (inline form for name/email/account_type) · Reset Password (disabled + tooltip when no email) · Revoke Sessions · Grant/Revoke Super Admin (hidden/locked for break-glass; disabled for self-demote) · Delete (typed-confirm modal; hidden for break-glass/self) · **View as**.
- **Recent admin actions on this user:** mini list from the detail payload.
- All actions optimistic where safe; refetch detail + the Users list/counts after.

### 6.3 View-as
A read-only panel (within the console) showing the user's learner snapshot from `…/view-as`, under a persistent banner `Viewing <name> · read-only · Exit`. Exit returns to the drawer. No app navigation as the user; no writes possible.

### 6.4 Admins tab
Lists current super-admins: break-glass (env) rows marked `env · locked` (no actions); DB rows with **Demote**. A **Promote** control: search users → Grant super-admin (`adminSetSuperAdmin value:true`).

### 6.5 Orgs tab → `OrgAdminDrawer`
Rows clickable → drawer with org detail + actions: Set Plan, Set Type, Delete (typed-confirm). Reuses styles from `UserAdminDrawer`.

### 6.6 Audit tab
Paged table: actor · action · target (type+id, linked) · time (relative) · detail (expandable JSON). Filter by target when opened from a drawer's mini-audit "see all".

### 6.7 Polish
Theme-token parity (dark mode), skeletons on drawer load, empty/error states, institutional microcopy. Destructive actions always behind a typed confirmation.

---

## 7. Security & Edge Cases
- **Break-glass protection:** env admins cannot be demoted or deleted (server returns 400; UI shows `env · locked`).
- **Self-protection:** cannot delete yourself; cannot demote yourself from super-admin.
- **Destructive confirmations:** delete user / delete org require typing the username/org-name to confirm.
- **Audit integrity:** actor is taken from the verified JWT, never from the request body.
- **Reset password:** only when the account has an email; otherwise the UI directs you to Edit → add email first (your own account currently has no email).
- **Revocation scope:** bumping a target's `token_version` invalidates only that user's tokens; the acting admin is unaffected.
- **token_version backward-compat:** missing `tv` claim treated as `0`.
- **Org delete** reuses the existing cascade (now incl. `org_member_groups`).

---

## 8. Verification — Live User Testing

Against the running/deployed app with a **throwaway test user and test org** (never on real accounts), signed in as a super-admin:
1. **Promote/demote:** promote test-user → they gain the Super Admin nav after re-login; demote → it disappears.
2. **Break-glass:** attempt to demote/delete `muthu@pymasters.net` (env) → blocked with a clear message; shows `env · locked`.
3. **Edit + reset:** add an email to a user via Edit; Reset Password sends the link; verify Reset is disabled for a user with no email.
4. **Revoke sessions:** revoke a test-user's sessions → their next authenticated action returns 401 / forces re-login.
5. **Delete user:** delete the test-user (typed confirm) → gone + cascade; confirm self-delete is blocked.
6. **Org:** change a test-org's plan and type; delete it (typed confirm).
7. **View-as:** open view-as for a user → read-only snapshot renders under the banner; Exit returns; confirm no write controls are reachable.
8. **Audit:** the Audit tab records every action above with correct actor / action / target / timestamp; drawer mini-audit matches.
9. **a11y/theme:** drawers keyboard-operable (ESC, focus-return) and correct in dark mode.

**Done when** all flows pass live as a super-admin, with no real-account data touched.

---

## 9. Implementation Order (for the plan)
1. Schema: `is_super_admin`, `token_version`, `admin_audit` (+ indexes) in `main.py`.
2. Auth: `tv` claim in `create_access_token`; `token_version` check in `_extract`; backward-compat for missing `tv`.
3. admin.py: `require_super_admin` (DB flag + break-glass), `is_break_glass`, `_audit` helper; add audit to existing block/plan.
4. Backend user endpoints: detail, view-as, PATCH, DELETE, super-admin, role, reset-password, revoke-sessions.
5. Backend org endpoints: detail, plan, type, delete; `GET /admin/audit`.
6. `api.js` client fns.
7. `UserAdminDrawer` (detail + actions + mini-audit) and wire Users-tab rows.
8. View-as panel + banner.
9. Admins tab (list + promote/demote).
10. `OrgAdminDrawer` + Orgs-tab wiring.
11. Audit tab.
12. Polish (skeletons/empty/error, dark mode, a11y, typed confirms).
13. Live user-testing pass (§8).
