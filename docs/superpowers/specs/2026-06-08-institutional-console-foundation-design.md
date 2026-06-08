# Institutional Console — Foundation (Groups + Per-Student Drill-down + Polish)

**Date:** 2026-06-08
**Status:** Design — approved sections, pending final spec review
**Scope owner:** Muthu
**Surface:** `frontend/src/pages/OrgDashboard.jsx` + `backend/routes/organizations.py` + `backend/main.py` (schema)

---

## 1. Goal & Context

PyMasters' individual-learner UX is strong; the **institutional** surface (the teacher/admin `OrgDashboard`) is thin. To make PyMasters look and feel like a serious learning institution — and to win institutional pilots — the org console needs to (A) *feel* credible and (B) *do* more.

This spec is the **foundation** sub-project. Later cycles (their own specs) will cover teacher workflows, reporting/export, and an app-wide design-system + a11y pass.

**This spec delivers three things on the Students surface of the console:**

1. **Groups** — lightweight, tag-style grouping of members (a class, section, batch, or team), used to filter the roster.
2. **Per-student drill-down** — click a student to open a rich detail view (topic-level mastery, recent activity, recent lessons). This is the centerpiece that carries the institutional feel.
3. **Targeted polish** — turn the Students tab + drill-down into the console's command center (filter chips, refined roster, skeletons, empty states, a11y, theme parity).

### Decisions locked during brainstorming
- **Primary user:** generic — one flexible "group" abstraction serving school (class/section), university (batch), and enterprise (team).
- **Group model:** **tag-style groups** — members carry one or more group labels; no dedicated group pages or assigned group leads in v1. (Acknowledged trade-off: this is the leanest, least inherently "institutional" option; the institutional feel is therefore carried by the drill-down + polish.)
- **Build approach (A):** new `org_member_groups` tag table (multi-group) + filter chips + a **slide-over drawer** drill-down kept in-context on the Students tab.
- **Testing:** **live user testing** against the running app via real UI flows — no unit/pytest suites. Consistent with how this project is validated (live E2E).

### Out of scope (explicitly, → later cycles)
- Dedicated group pages, assigned teachers/group leads.
- Teacher workflows (assign a learning path to a group, nudge at-risk).
- Reporting / CSV / PDF export.
- App-wide design-system + a11y overhaul (only the Students surfaces are polished here).

---

## 2. Architecture Overview

```
Students tab (OrgDashboard.jsx)
   ├── Group filter bar  ──GET /api/org/{id}/groups
   ├── Roster table      ──GET /api/org/{id}/progress?group=<name>
   │      (row click) ──────────────────────────────────┐
   └── Slide-over Drawer <───────────────────────────────┘
          ├── GET /api/org/{id}/students/{user_id}      (detail)
          └── PUT /api/org/{id}/members/{user_id}/groups (tag edit, admin+)

Data:  org_member_groups (new)  +  organizations.settings.group_label (new key)
Reads from existing: users, org_members, user_mastery, learning_signals, lesson_completions
```

No new services or infrastructure. SQLite + Litestream single-writer model is unchanged. New table is created via the existing `CREATE TABLE IF NOT EXISTS` init block in `main.py`.

---

## 3. Data Model

### 3.1 New table: `org_member_groups`
Added to the schema-init block in `backend/main.py`:

```sql
CREATE TABLE IF NOT EXISTS org_member_groups (
    org_id     TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    group_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (org_id, user_id, group_name)
);
CREATE INDEX IF NOT EXISTS idx_omg_org_group ON org_member_groups(org_id, group_name);
```

- Many-to-many: a member may carry multiple group tags.
- `PRIMARY KEY (org_id, user_id, group_name)` makes tagging idempotent.

### 3.2 One-time backfill from `department`
After the table is created, run an **idempotent** backfill so existing grouping isn't lost:

```sql
INSERT OR IGNORE INTO org_member_groups (org_id, user_id, group_name)
SELECT org_id, user_id, department
FROM org_members
WHERE department IS NOT NULL AND TRIM(department) != '';
```

- Runs at startup; `INSERT OR IGNORE` makes it safe to run every boot.
- The `department` column **stays** (other code/UI may reference it) but the console's grouping moves to Groups. Overview's "Department Distribution" card is replaced by a "Groups" distribution.

### 3.3 Org label setting: `group_label`
`organizations.settings` is already a JSON `TEXT` column. We add an optional key:

```json
{ "group_label": "Class" }
```

- Default when absent: `"Group"`.
- Lets a school relabel to "Class", a university to "Batch", an enterprise to "Team".
- Editable via the existing `PUT /api/org/{org_id}` (settings merge — see §4.5). v1 may ship with default only and the setter; a settings UI control is a nice-to-have within polish.

### 3.4 Constraints / guardrails
- `group_name`: trimmed; reject empty; max length **50**.
- Max **20** group tags per member.
- `delete_organization` must also `DELETE FROM org_member_groups WHERE org_id = ?`.

---

## 4. Backend API (`backend/routes/organizations.py`)

All routes derive the caller from the JWT (`Depends(get_current_user_id)`), consistent with the rest of this router. **Read = manager+**, **mutate = admin+**. Every route that targets a specific `user_id` verifies that user is a member of the org (else 404).

### 4.1 `GET /api/org/{org_id}/groups`  (manager+)
Returns distinct group names with member counts for the org.
```json
{ "groups": [ { "name": "Class-9A", "count": 12 }, { "name": "Robotics", "count": 5 } ],
  "ungrouped": 3,
  "group_label": "Class" }
```
- `ungrouped` = members with zero tags.
- `group_label` echoed so the UI labels chips correctly.

### 4.2 `PUT /api/org/{org_id}/members/{user_id}/groups`  (admin+)
Sets a member's **full** tag list (clean for a tag editor — replaces rather than patches).
```json
// request
{ "groups": ["Class-9A", "Robotics"] }
// response
{ "updated": true, "groups": ["Class-9A", "Robotics"] }
```
- Validate target is a member of the org (404 if not).
- Normalize each name (trim, ≤50 chars, drop blanks, dedupe), enforce ≤20.
- Implementation: `DELETE` existing rows for (org, user) then `INSERT OR IGNORE` the new set, in one transaction.

### 4.3 `GET /api/org/{org_id}/progress?group=<name>`  (manager+) — **extended**
The existing endpoint gains:
- optional `group` query param → filter to members carrying that tag (special value to filter "ungrouped" is acceptable, e.g. `?group=__ungrouped__`).
- each returned student includes `"groups": ["Class-9A", ...]`.
- existing fields (xp, lessons_completed, last_active, struggle_count, signals_7d) unchanged.

### 4.4 `GET /api/org/{org_id}/students/{user_id}`  (manager+) — **new drill-down**
Returns everything the drawer needs, assembled from existing tables. Verify caller is manager+ AND target is a member of the org.
```json
{
  "profile": {
    "id": "...", "name": "Priya Kumar", "username": "priyak",
    "email": "priya@school.edu", "role": "member",
    "department": "", "groups": ["Class-9A", "Robotics"],
    "joined_at": "2026-05-01T..."
  },
  "summary": {
    "xp": 1240, "lessons_completed": 18,
    "struggle_total": 3, "last_active": "2026-06-06T...",
    "status": "at_risk"          // derived: at_risk | active | idle | inactive
  },
  "mastery": [                    // from user_mastery, ORDER BY mastery_level ASC (weakest first)
    { "topic": "Recursion", "mastery_level": 0.31, "attempts": 6,
      "struggle_count": 3, "last_practiced": "2026-06-04T..." }
  ],
  "activity": [                   // recent learning_signals, newest first, cap ~30
    { "signal_type": "lesson_complete", "topic": "Closures", "created_at": "..." }
  ],
  "lessons": [                    // recent lesson_completions, newest first, cap ~20
    { "lesson_id": "closures", "xp_awarded": 50, "completed_at": "..." }
  ]
}
```
- `status` derivation mirrors the existing `studentStatus()` logic so list and drawer agree.

### 4.5 `delete_organization` + `update_org`
- `delete_organization`: add `DELETE FROM org_member_groups WHERE org_id = ?` to the cascade.
- `update_org`: support merging `group_label` into `settings` JSON (read existing settings, set key, write back) when provided.

---

## 5. Frontend (`frontend/src/pages/OrgDashboard.jsx`, `frontend/src/api.js`)

### 5.1 API client additions (`api.js`)
- `getOrgGroups(orgId)` → `GET …/groups`
- `setMemberGroups(orgId, userId, groups)` → `PUT …/members/{userId}/groups`
- `getStudentDetail(orgId, userId)` → `GET …/students/{userId}`
- extend `getOrgProgress(orgId, userId, group)` with optional `group` param.

### 5.2 Students tab → command center
- **Group filter bar** above the roster: chips `All · <Label> A (12) · <Label> B (8) · Ungrouped (3)`, labelled with `group_label`. Selecting a chip refetches `progress?group=`; combines with the existing client-side search.
- **Refined roster table:** keep the semantic table (existing `<caption>`/`scope`), add a **Groups** column rendering tag chips, tighten spacing/typography, add a status legend (Active / Idle / At-risk / Inactive). Each row is clickable and keyboard-focusable (`role`/`tabIndex`, Enter opens the drawer, `cursor-pointer` + hover).
- Keep the four summary stat cards (Students / Active 7d / Lessons / At-risk), restyled for density.

### 5.3 Slide-over drill-down drawer
Right-side slide-over panel (Approach A). Contents:
- **Header:** avatar, name, email, role badge, group tag chips, status pill.
- **Summary row:** XP · lessons · struggle count · last active.
- **Topic mastery** (weakest-first): per-topic bar colored by level, ⚠ + count on weak/struggled topics — a teacher sees gaps instantly.
- **Recent activity:** compact vertical timeline from `activity[]`.
- **Recent lessons:** list from `lessons[]` with XP + relative time.
- **Tag editor (admin+ only):** add chip (type + Enter) / remove chip (✕) → calls `setMemberGroups`, optimistic update, refresh group counts. Managers/members do not see edit controls.

**Accessibility:** `role="dialog"` + `aria-modal="true"`, focus trap, ESC closes, focus returns to the originating row on close, backdrop click closes, respects `useReducedMotion` for the slide animation.

### 5.4 Polish / feel (scoped to these surfaces)
- Overview tab: replace "Department Distribution" card with **"Groups"** distribution (same bar style, sourced from `getOrgGroups`).
- **Skeleton loaders** for the roster and the drawer (replace bare spinners).
- **Empty states:** "No students in this {label} yet," "No mastery data yet — {name} hasn't practiced," "Ungrouped" handling.
- Theme-token parity (dark-mode correct), consistent focus rings, institutional microcopy using `group_label`.

---

## 6. Error Handling & Edge Cases
- Student with zero mastery/activity → friendly empty sections, not blank space.
- Removing all tags → student appears under **Ungrouped**.
- Group filter + search compose (filter server-side by group, search client-side).
- Drawer fetch failure → inline error + Retry inside the drawer (does not blow away the roster).
- Mutations guarded to admin+ server-side; UI hides edit affordances below admin.
- Group-name normalization rejects blanks/over-length on both client and server.
- Deleting an org cleans up `org_member_groups`.
- Backfill is idempotent (`INSERT OR IGNORE`), safe across reboots/Litestream restores.

---

## 7. Verification — Live User Testing

All verification is performed against the **running application** (local dev server and/or the live Cloud Run deploy) through real UI flows, signed in as real roles. No unit/pytest suites.

**Setup:** a test org with ≥3 member learners who have some lesson/activity/mastery data; accounts for an **admin** and a **manager** (and optionally a plain **member**) to exercise role gating.

**Flows to verify:**
1. **Groups CRUD (admin):** open Students → open a student drawer → add two group tags → close → confirm chips show in the roster Groups column and in the filter bar with correct counts. Remove a tag → counts update.
2. **Backfill:** a member who had a `department` value before the change shows that value as a group tag after deploy.
3. **Filter:** click a group chip → roster narrows to tagged students; "Ungrouped" chip shows untagged members; search still narrows within the filtered set.
4. **Drill-down content:** open a student with real history → mastery list is weakest-first with struggle flags; activity timeline and recent lessons populate; summary numbers match the roster row.
5. **Empty states:** open a brand-new student → friendly empty sections, no crash.
6. **Role gating (manager):** sign in as manager → can view roster + drawer, **cannot** see/use tag edit controls; confirm server rejects a manager PUT (e.g., via direct call) with 403.
7. **Role gating (non-member / member):** Students tab hidden/again gated as today; drill-down endpoint refuses non-members.
8. **A11y:** open the drawer by keyboard (focus a row, Enter), Tab cycles within the drawer, ESC closes, focus returns to the row.
9. **Theme:** toggle dark mode → roster, chips, and drawer render correctly.
10. **Label:** set `group_label` to "Class" → chips, headings, and empty-state copy use "Class".

**Regression:** the existing weekly live E2E smoke routine is extended with flow #1 + #3 + #4 (tag → filter → open drawer → see mastery).

**Done when:** all flows above pass live, signed in as the relevant roles, on the deployed build.

---

## 8. Implementation Order (for the plan)
1. Schema: add `org_member_groups` + index + idempotent department backfill in `main.py`.
2. Backend: `GET /groups`, `PUT …/groups`, extend `/progress`, new `/students/{id}`; cascade in delete; `group_label` in `update_org`.
3. API client additions in `api.js`.
4. Students tab: group filter bar + roster Groups column + row-click wiring.
5. Drill-down drawer (read-only first), then tag editor.
6. Polish: skeletons, empty states, Overview "Groups" card, a11y, theme parity.
7. Live user-testing pass across all roles; extend weekly E2E smoke.
