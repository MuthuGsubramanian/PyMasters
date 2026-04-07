# Org/School Onboarding & Nav Visibility Overhaul — Design Spec

## Problem

The current system has three issues:

1. **Same onboarding for everyone** — org admins answer personal learning questions (motivation, goals, time commitment) that are irrelevant to their role. They should answer org-focused questions about their learners.

2. **No account type persistence** — whether a user signed up as individual or organization is inferred from org membership, which is fragile. There's no explicit `account_type` field.

3. **Nav visibility too loose** — the Organization nav item shows for anyone with `activeOrg`, including invited members who have no admin capabilities. Only org admins should see it. Individual users should never see it.

## Solution

### 1. Account Type Persistence

Add `account_type TEXT DEFAULT 'individual'` column to the `users` table. Values: `'individual'` or `'organization'`. Set at registration time based on the signup path in Login.jsx. Returned in all login/register API responses.

### 2. Org Admin Onboarding (6 questions)

When `account_type === 'organization'`, Onboarding.jsx shows these questions instead of the individual flow:

| # | Key | Type | Question | Options |
|---|-----|------|----------|---------|
| 1 | `preferred_language` | language | "Which language should the platform use?" | Language selector (reuse existing) |
| 2 | `org_size` | choice | "How many learners will use PyMasters?" | `1-10`, `11-50`, `51-200`, `200+` |
| 3 | `learner_profile` | choice | "Who are your learners?" | `k12` (K-12 students), `university` (University students), `professional` (Working professionals), `mixed` (Mixed) |
| 4 | `skill_level` | choice | "What's their current Python level?" | `beginner` (Complete beginners), `some` (Some experience), `mixed` (Mixed levels) |
| 5 | `learning_focus` | choice | "What should they learn?" | `fundamentals` (Python fundamentals), `ai_ml` (AI & Machine Learning), `web` (Web development), `data_science` (Data science), `mixed` (Mixed/All topics) |
| 6 | `structure_preference` | choice | "How do you want to manage learning?" | `assigned` (Assign specific paths), `free_choice` (Let learners choose), `mix` (Mix of both) |

Individual onboarding (10 questions) remains unchanged.

### 3. Org Profiles Storage

New `org_profiles` table:

```sql
CREATE TABLE org_profiles (
    org_id TEXT PRIMARY KEY,
    org_size TEXT DEFAULT '',
    learner_profile TEXT DEFAULT '',
    skill_level TEXT DEFAULT '',
    learning_focus TEXT DEFAULT '',
    structure_preference TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

The onboarding endpoint (`POST /api/profile/onboarding`) checks the user's `account_type`:
- `'individual'` → saves to `user_profiles` (existing behavior)
- `'organization'` → saves to `org_profiles` (keyed by the user's org_id from `org_members`), sets `preferred_language` on `users` table, marks `onboarding_completed=1` on both `users` and `user_profiles`

### 4. Nav Visibility Rules

Layout.jsx changes the Organization nav item condition from:

```javascript
if (activeOrg) { ... }
```

to:

```javascript
if (activeOrg && (activeOrg.role === 'super_admin' || activeOrg.role === 'admin')) { ... }
```

Result:
- Individual users — never see Organization nav (no `activeOrg`)
- Org members/managers — don't see it (role check fails)
- Org admins/super_admins — see it

### 5. Post-Onboarding Landing

After org admin completes onboarding → navigate to `/dashboard/org` instead of `/dashboard`.

On OrgDashboard Overview tab, if the org has only 1 member (the admin), show a prominent invite card:

```
┌──────────────────────────────────────────────┐
│  🚀 Get your team started                   │
│                                              │
│  Invite learners to start their Python       │
│  journey with your organization.             │
│                                              │
│  [email input] [role ▾] [Send Invite]        │
│                                              │
│  📎 Upload file (.csv, .xlsx, .txt)          │
│                                              │
│  [Dismiss]                                   │
└──────────────────────────────────────────────┘
```

Dismissible — collapses once an invite is sent or user dismisses. State stored in localStorage (`pm_invite_prompt_dismissed_{org_id}`).

### 6. Bulk Import from Files

Add file upload capability to the invite section (both the invite prompt card and the Invites tab):

- Accept `.csv`, `.xlsx`, `.txt` files via `<input type="file">`
- **CSV/TXT**: one email per line, or comma-separated. Trim whitespace, skip empty lines.
- **XLSX**: read first column of first sheet. If first cell looks like a header (contains "email", "mail", "name", case-insensitive), skip it. Otherwise treat all rows as emails.
- Frontend parses client-side using `xlsx` npm package (for Excel) and native `FileReader` (for CSV/TXT)
- After parsing, show preview list: email addresses with checkboxes (all checked by default), a shared role selector (default: `member`)
- User confirms → calls existing `POST /api/org/{org_id}/invite/bulk` endpoint
- Show success count / error details after submission

### 7. Delete Organization

New endpoint: `DELETE /api/org/{org_id}?user_id=X`

- Requires `super_admin` role
- Deletes: `organizations` row, all `org_members` rows, all `org_invites` rows, `org_profiles` row
- Does NOT delete member user accounts — they continue as individual users
- Returns `204 No Content` on success

Frontend: Add "Delete Organization" button in OrgDashboard Overview tab (visible to super_admins only). Opens a confirmation modal requiring the user to type the org name to confirm. After deletion:
- Clear `activeOrg` in AuthContext
- Navigate to `/dashboard`

### 8. Delete Account — Org Admin Guard

The existing `DELETE /api/profile/{user_id}` endpoint needs an additional check:

- Query `org_members` for any orgs where the user is the **only** `super_admin`
- If found → reject with 409 Conflict: `"You are the only super admin of [org_name]. Transfer ownership or delete the organization first."`
- If not found → proceed with existing deletion (delete `users`, `user_profiles`, `org_members` rows, `org_invites` where `invited_by = user_id`)

Frontend: The profile page delete account flow should show the error message and link to the org dashboard if this guard triggers.

## Registration Flow Changes

### Backend: `POST /api/auth/register`

Accept new field `account_type` in request body. Store in `users.account_type`. Return in response.

### Backend: `POST /api/auth/login`

Return `account_type` from `users` table in login response.

### Frontend: Login.jsx

When submitting registration:
- Individual path: send `account_type: 'individual'`
- Organization path: send `account_type: 'organization'`

### Frontend: AuthContext

Store `account_type` on the `user` object (persisted in localStorage via existing mechanism).

## Files Changed

### Backend
- `backend/main.py` — add `account_type` column to users table, add `org_profiles` table, update register/login to include `account_type`
- `backend/routes/profile.py` — branch onboarding save by account_type, add org admin deletion guard, add org_invites cleanup
- `backend/routes/organizations.py` — add `DELETE /api/org/{org_id}` endpoint

### Frontend
- `frontend/src/pages/Login.jsx` — pass `account_type` to register API call
- `frontend/src/context/AuthContext.jsx` — ensure `account_type` persisted on user object
- `frontend/src/pages/Onboarding.jsx` — add org onboarding question set, branch on `account_type`, navigate to `/dashboard/org` for org admins
- `frontend/src/components/Layout.jsx` — add role check for Organization nav visibility
- `frontend/src/pages/OrgDashboard.jsx` — add invite prompt card with file upload, add delete org button + confirmation modal
- `frontend/src/api.js` — add `deleteOrg` API function
- `frontend/package.json` — add `xlsx` dependency

## Success Criteria

1. Org admin signup → 6 org-focused onboarding questions → lands on OrgDashboard with invite prompt
2. Individual signup → 10 personal onboarding questions → lands on Classroom (unchanged)
3. Invited org members → personal onboarding → no Organization nav item
4. Only `super_admin` and `admin` roles see Organization nav item
5. File upload (.csv/.xlsx/.txt) parses emails and bulk-invites successfully
6. Delete org removes org + members + invites + org_profiles, members keep their accounts
7. Delete account blocked if user is sole super_admin of any org
8. `account_type` persisted in DB and returned in all auth responses
