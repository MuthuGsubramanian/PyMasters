# Institutional Console — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tag-style Groups, a per-student drill-down drawer, and targeted polish to the PyMasters institutional console (`OrgDashboard`), so it reads and works like a serious learning institution's tool.

**Architecture:** A new `org_member_groups` tag table (many-to-many) backs lightweight group labels used to filter the Students roster. A new drill-down endpoint assembles per-student detail (topic mastery, activity, lessons) from existing tables, rendered in a slide-over drawer extracted into its own component. Role-gated (read = manager+, mutate = admin+), JWT-derived caller.

**Tech Stack:** FastAPI + SQLite (Litestream-replicated) backend; React 19 + Vite + Tailwind 4 + Framer Motion + lucide-react + axios frontend.

**Spec:** `docs/superpowers/specs/2026-06-08-institutional-console-foundation-design.md`

**Verification philosophy:** Live user testing against the running app — no unit/pytest suites. Backend tasks are verified with live API calls (a real JWT) against a locally running server; frontend tasks via real UI flows signed in as the relevant roles.

---

## Local run & live-test setup (read once)

**Backend** (port 8001):
```bash
cd backend && python main.py
# serves http://127.0.0.1:8001 ; endpoints under /api/org/...
```

**Frontend** (Vite dev, talks to 127.0.0.1:8001/api by default):
```bash
cd frontend && npm run dev
```

**Get a JWT for live API checks** (PowerShell — replace creds with a real admin account such as `muthu@pymasters.net`):
```powershell
$r = Invoke-RestMethod -Uri http://127.0.0.1:8001/api/auth/login -Method Post -ContentType 'application/json' -Body (@{username='muthu@pymasters.net';password='<password>'} | ConvertTo-Json)
$TOKEN = $r.token
$r.token   # sanity print
```
Then call protected routes with `-Headers @{ Authorization = "Bearer $TOKEN" }`. You also need a target **org id** (`$ORG`) and a member **user id** (`$UID`) — grab them from `GET /api/org/my` and `GET /api/org/$ORG/members`.

---

## File Structure

- **Modify** `backend/main.py` — add `org_member_groups` table + index + idempotent backfill in the schema-init block (near the `org_invites` table, ~line 538).
- **Modify** `backend/routes/organizations.py` — `import json`; new `GET /groups`, `PUT /members/{id}/groups`, `GET /students/{id}`; extend `org_progress` with `group` filter + `groups[]`; `group_label` merge in `update_org`; cascade in `delete_organization`.
- **Modify** `frontend/src/api.js` — `getOrgGroups`, `setMemberGroups`, `getStudentDetail`; extend `getOrgProgress(orgId, userId, group)`.
- **Create** `frontend/src/components/StudentDrawer.jsx` — slide-over drill-down (keeps `OrgDashboard.jsx` from growing further; it's already ~1190 lines).
- **Modify** `frontend/src/pages/OrgDashboard.jsx` — Students tab: group filter bar, Groups column, row-click → drawer; Overview "Groups" card; group_label admin input; skeletons/empty states.

---

## Task 1: Schema — `org_member_groups` table + backfill

**Files:**
- Modify: `backend/main.py` (schema-init block, immediately after the `org_invites` `CREATE TABLE` ends, ~line 538)

- [ ] **Step 1: Add the table, index, and idempotent backfill**

In `backend/main.py`, right after the `org_invites` `cursor.execute("""CREATE TABLE IF NOT EXISTS org_invites (...)""")` block, insert:

```python
        # ── Institutional console: group tags ─────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS org_member_groups (
                org_id     TEXT NOT NULL,
                user_id    TEXT NOT NULL,
                group_name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (org_id, user_id, group_name)
            )
        """)
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_omg_org_group ON org_member_groups(org_id, group_name)"
        )
        # One-time, idempotent backfill: seed group tags from existing department values
        cursor.execute("""
            INSERT OR IGNORE INTO org_member_groups (org_id, user_id, group_name)
            SELECT org_id, user_id, TRIM(department)
            FROM org_members
            WHERE department IS NOT NULL AND TRIM(department) != ''
        """)
```

- [ ] **Step 2: Start the backend and verify the table exists + backfill ran**

Run:
```bash
cd backend && python main.py
```
Then in a second shell (PowerShell):
```powershell
python -c "import sqlite3,os; c=sqlite3.connect(os.path.join('backend','pymasters.db')); print('table:', c.execute(\"SELECT name FROM sqlite_master WHERE name='org_member_groups'\").fetchone()); print('rows:', c.execute('SELECT COUNT(*) FROM org_member_groups').fetchone()[0])"
```
Expected: `table: ('org_member_groups',)` and a row count ≥ 0 (equal to the number of members that had a non-empty `department`).

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat(org): add org_member_groups table + department backfill"
```

---

## Task 2: Backend — `GET /groups` and extend `/progress`

**Files:**
- Modify: `backend/routes/organizations.py`

- [ ] **Step 1: Add the json import**

At the top of `backend/routes/organizations.py`, add `import json` with the other stdlib imports (after `import os`):

```python
import os
import json
import sqlite3
```

- [ ] **Step 2: Add the `GET /{org_id}/groups` endpoint**

Add near the other GET endpoints (e.g. just before `org_analytics`):

```python
@router.get("/{org_id}/groups")
def list_groups(org_id: str, caller: str = Depends(get_current_user_id)):
    """Distinct group names + member counts for the org. Requires manager+."""
    require_org_role(DB_PATH, org_id, caller, "manager")
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(
            "SELECT group_name, COUNT(*) FROM org_member_groups WHERE org_id = ? "
            "GROUP BY group_name ORDER BY group_name",
            [org_id],
        ).fetchall()
        total = conn.execute(
            "SELECT COUNT(*) FROM org_members WHERE org_id = ?", [org_id]
        ).fetchone()[0]
        tagged = conn.execute(
            "SELECT COUNT(DISTINCT user_id) FROM org_member_groups WHERE org_id = ?", [org_id]
        ).fetchone()[0]
        settings_row = conn.execute(
            "SELECT settings FROM organizations WHERE id = ?", [org_id]
        ).fetchone()
    finally:
        conn.close()
    label = "Group"
    if settings_row and settings_row[0]:
        try:
            label = (json.loads(settings_row[0]) or {}).get("group_label") or "Group"
        except Exception:
            label = "Group"
    return {
        "groups": [{"name": r[0], "count": r[1]} for r in rows],
        "ungrouped": max(0, total - tagged),
        "group_label": label,
    }
```

- [ ] **Step 3: Replace `org_progress` with a group-aware version**

Replace the entire existing `org_progress` function with:

```python
@router.get("/{org_id}/progress")
def org_progress(org_id: str, group: Optional[str] = None, caller: str = Depends(get_current_user_id)):
    """Per-student progress for teachers/admins. Requires manager+.
    Optional `group` filters by tag; `__ungrouped__` returns untagged members.
    Each student includes a `groups` list."""
    require_org_role(DB_PATH, org_id, caller, "manager")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        query = """
            SELECT u.id, u.username, u.name, u.email, om.role, om.department,
                   COALESCE(u.points, 0) AS xp,
                   (SELECT COUNT(*) FROM lesson_completions lc WHERE lc.user_id = u.id) AS lessons_completed,
                   (SELECT MAX(created_at) FROM learning_signals ls WHERE ls.user_id = u.id) AS last_active,
                   (SELECT COALESCE(SUM(struggle_count), 0) FROM user_mastery um WHERE um.user_id = u.id) AS struggle_count,
                   (SELECT COUNT(*) FROM learning_signals ls WHERE ls.user_id = u.id AND ls.created_at > datetime('now','-7 days')) AS signals_7d
            FROM org_members om JOIN users u ON u.id = om.user_id
            WHERE om.org_id = ?
        """
        params = [org_id]
        if group == "__ungrouped__":
            query += " AND u.id NOT IN (SELECT user_id FROM org_member_groups WHERE org_id = ?)"
            params.append(org_id)
        elif group:
            query += " AND u.id IN (SELECT user_id FROM org_member_groups WHERE org_id = ? AND group_name = ?)"
            params.extend([org_id, group])
        query += " ORDER BY xp DESC"
        rows = conn.execute(query, params).fetchall()

        gmap = {}
        for uid, gname in conn.execute(
            "SELECT user_id, group_name FROM org_member_groups WHERE org_id = ?", [org_id]
        ).fetchall():
            gmap.setdefault(uid, []).append(gname)
    finally:
        conn.close()
    students = []
    for r in rows:
        d = dict(r)
        d["groups"] = sorted(gmap.get(d["id"], []))
        students.append(d)
    return {"students": students, "count": len(students)}
```

- [ ] **Step 4: Live-verify both endpoints (restart backend first)**

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8001/api/org/$ORG/groups" -Headers @{Authorization="Bearer $TOKEN"}
Invoke-RestMethod -Uri "http://127.0.0.1:8001/api/org/$ORG/progress" -Headers @{Authorization="Bearer $TOKEN"} | Select-Object -ExpandProperty students | Select-Object -First 1
```
Expected: `/groups` returns `groups`, `ungrouped`, `group_label:"Group"`. `/progress` first student now has a `groups` array. Also confirm filtering: `.../progress?group=__ungrouped__` returns only untagged members.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/organizations.py
git commit -m "feat(org): groups list endpoint + group filter & groups[] on progress"
```

---

## Task 3: Backend — `PUT /members/{id}/groups` (set tags, admin+)

**Files:**
- Modify: `backend/routes/organizations.py`

- [ ] **Step 1: Add the request model**

Next to the other Pydantic models (after `JoinOrgRequest`):

```python
class SetGroupsRequest(BaseModel):
    groups: List[str] = []
    user_id: Optional[str] = None  # ignored; caller derived from token
```

- [ ] **Step 2: Add the endpoint**

Add after `change_role` / `remove_member` (member-mutation neighborhood):

```python
@router.put("/{org_id}/members/{member_id}/groups")
def set_member_groups(org_id: str, member_id: str, data: SetGroupsRequest,
                      caller: str = Depends(get_current_user_id)):
    """Replace a member's full group-tag list. Requires admin+."""
    require_org_role(DB_PATH, org_id, caller, "admin")
    conn = sqlite3.connect(DB_PATH)
    try:
        is_member = conn.execute(
            "SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?", [org_id, member_id]
        ).fetchone()
        if not is_member:
            raise HTTPException(status_code=404, detail="Member not found in this organization")

        # Normalize: trim, cap length 50, drop blanks, dedupe (preserve order), cap 20 tags
        cleaned = []
        for g in (data.groups or []):
            name = (g or "").strip()[:50]
            if name and name not in cleaned:
                cleaned.append(name)
        cleaned = cleaned[:20]

        now = datetime.utcnow().isoformat()
        conn.execute("DELETE FROM org_member_groups WHERE org_id = ? AND user_id = ?", [org_id, member_id])
        for name in cleaned:
            conn.execute(
                "INSERT OR IGNORE INTO org_member_groups (org_id, user_id, group_name, created_at) "
                "VALUES (?, ?, ?, ?)",
                [org_id, member_id, name, now],
            )
        conn.commit()
    finally:
        conn.close()
    return {"updated": True, "groups": cleaned}
```

- [ ] **Step 3: Live-verify (restart backend)**

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8001/api/org/$ORG/members/$UID/groups" -Method Put -ContentType 'application/json' -Headers @{Authorization="Bearer $TOKEN"} -Body (@{groups=@('Class-9A','Robotics')} | ConvertTo-Json)
Invoke-RestMethod -Uri "http://127.0.0.1:8001/api/org/$ORG/groups" -Headers @{Authorization="Bearer $TOKEN"}
```
Expected: PUT returns `{updated:true, groups:["Class-9A","Robotics"]}`; `/groups` now lists both with count 1. Re-PUT with `groups=@()` clears them.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/organizations.py
git commit -m "feat(org): set member group tags endpoint (admin+)"
```

---

## Task 4: Backend — `GET /students/{id}` drill-down

**Files:**
- Modify: `backend/routes/organizations.py`

- [ ] **Step 1: Add the endpoint**

Add after `org_progress`:

```python
@router.get("/{org_id}/students/{member_id}")
def student_detail(org_id: str, member_id: str, caller: str = Depends(get_current_user_id)):
    """Drill-down detail for one student. Requires manager+. Target must be an org member."""
    require_org_role(DB_PATH, org_id, caller, "manager")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        prof = conn.execute(
            """SELECT u.id, u.username, u.name, u.email, om.role, om.department, om.joined_at,
                      COALESCE(u.points, 0) AS xp
               FROM org_members om JOIN users u ON u.id = om.user_id
               WHERE om.org_id = ? AND om.user_id = ?""",
            [org_id, member_id],
        ).fetchone()
        if not prof:
            raise HTTPException(status_code=404, detail="Member not found in this organization")

        groups = [r[0] for r in conn.execute(
            "SELECT group_name FROM org_member_groups WHERE org_id = ? AND user_id = ? ORDER BY group_name",
            [org_id, member_id]).fetchall()]
        lessons_completed = conn.execute(
            "SELECT COUNT(*) FROM lesson_completions WHERE user_id = ?", [member_id]).fetchone()[0]
        struggle_total = conn.execute(
            "SELECT COALESCE(SUM(struggle_count), 0) FROM user_mastery WHERE user_id = ?", [member_id]).fetchone()[0]
        last_active = conn.execute(
            "SELECT MAX(created_at) FROM learning_signals WHERE user_id = ?", [member_id]).fetchone()[0]
        signals_7d = conn.execute(
            "SELECT COUNT(*) FROM learning_signals WHERE user_id = ? AND created_at > datetime('now','-7 days')",
            [member_id]).fetchone()[0]
        mastery = [dict(r) for r in conn.execute(
            """SELECT topic, mastery_level, attempts, struggle_count, last_practiced
               FROM user_mastery WHERE user_id = ?
               ORDER BY mastery_level ASC, struggle_count DESC""", [member_id]).fetchall()]
        activity = [dict(r) for r in conn.execute(
            """SELECT signal_type, topic, created_at FROM learning_signals
               WHERE user_id = ? ORDER BY created_at DESC LIMIT 30""", [member_id]).fetchall()]
        lessons = [dict(r) for r in conn.execute(
            """SELECT lesson_id, xp_awarded, completed_at FROM lesson_completions
               WHERE user_id = ? ORDER BY completed_at DESC LIMIT 20""", [member_id]).fetchall()]
    finally:
        conn.close()

    # Status derivation mirrors the frontend studentStatus() ordering.
    if struggle_total and struggle_total >= 3:
        status = "at_risk"
    elif signals_7d and signals_7d > 0:
        status = "active"
    elif last_active:
        status = "idle"
    else:
        status = "inactive"

    return {
        "profile": {**dict(prof), "groups": groups},
        "summary": {
            "xp": prof["xp"], "lessons_completed": lessons_completed,
            "struggle_total": struggle_total, "last_active": last_active, "status": status,
        },
        "mastery": mastery, "activity": activity, "lessons": lessons,
    }
```

- [ ] **Step 2: Live-verify (restart backend)**

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8001/api/org/$ORG/students/$UID" -Headers @{Authorization="Bearer $TOKEN"} | ConvertTo-Json -Depth 4
```
Expected: an object with `profile` (incl. `groups`), `summary` (incl. `status`), `mastery` (weakest-first), `activity`, `lessons`. Also confirm a non-member id returns 404.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/organizations.py
git commit -m "feat(org): per-student drill-down detail endpoint (manager+)"
```

---

## Task 5: Backend — `group_label` setter + delete cascade

**Files:**
- Modify: `backend/routes/organizations.py`

- [ ] **Step 1: Add `group_label` to `UpdateOrgRequest`**

In `UpdateOrgRequest`, add the field (before `user_id`):

```python
    group_label: Optional[str] = None
```

- [ ] **Step 2: Merge `group_label` into settings inside `update_org`**

In `update_org`, after the existing `if updates:` block (and before `conn.close()`), add:

```python
    if data.group_label is not None:
        row = conn.execute("SELECT settings FROM organizations WHERE id = ?", [org_id]).fetchone()
        try:
            settings = json.loads(row[0]) if row and row[0] else {}
        except Exception:
            settings = {}
        settings["group_label"] = data.group_label.strip()[:30]
        conn.execute(
            "UPDATE organizations SET settings = ?, updated_at = ? WHERE id = ?",
            [json.dumps(settings), datetime.utcnow().isoformat(), org_id],
        )
        conn.commit()
```

- [ ] **Step 3: Add the cascade delete**

In `delete_organization`, with the other `DELETE` statements (after `org_invites`):

```python
        cursor.execute("DELETE FROM org_member_groups WHERE org_id = ?", [org_id])
```

- [ ] **Step 4: Live-verify (restart backend)**

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8001/api/org/$ORG" -Method Put -ContentType 'application/json' -Headers @{Authorization="Bearer $TOKEN"} -Body (@{group_label='Class'} | ConvertTo-Json)
Invoke-RestMethod -Uri "http://127.0.0.1:8001/api/org/$ORG/groups" -Headers @{Authorization="Bearer $TOKEN"}
```
Expected: `/groups` now returns `group_label: "Class"`.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/organizations.py
git commit -m "feat(org): configurable group_label + cascade group tags on org delete"
```

---

## Task 6: Frontend API client

**Files:**
- Modify: `frontend/src/api.js` (Organizations section, ~line 154)

- [ ] **Step 1: Replace `getOrgProgress` and add the three new functions**

Replace the existing `getOrgProgress` line with the group-aware version, and add the new functions directly below it:

```javascript
export const getOrgProgress = (orgId, userId, group) =>
  api.get(`/org/${orgId}/progress`, { params: { user_id: userId, ...(group ? { group } : {}) } });
export const getOrgGroups = (orgId, userId) =>
  api.get(`/org/${orgId}/groups`, { params: { user_id: userId } });
export const setMemberGroups = (orgId, memberId, groups) =>
  api.put(`/org/${orgId}/members/${memberId}/groups`, { groups });
export const getStudentDetail = (orgId, memberId, userId) =>
  api.get(`/org/${orgId}/students/${memberId}`, { params: { user_id: userId } });
```

- [ ] **Step 2: Verify the app still builds/loads**

Run `cd frontend && npm run dev`, open the app, confirm no console import errors. (Functions are exercised in later tasks.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(api): org groups + student detail client functions"
```

---

## Task 7: Frontend — Students tab: filter bar, Groups column, row → drawer

**Files:**
- Modify: `frontend/src/pages/OrgDashboard.jsx`

- [ ] **Step 1: Add imports**

Update the `../api` import to include the new functions, and import the drawer (created in Task 8):

```javascript
import {
  getOrg, getOrgMembers, inviteToOrg, bulkInviteToOrg,
  updateMemberRole, removeMember, getOrgAnalytics, getOrgProgress, getMyOrgs, deleteOrg,
  getOrgGroups, getStudentDetail, setMemberGroups, updateOrg
} from '../api';
import StudentDrawer from '../components/StudentDrawer';
```

- [ ] **Step 2: Add state for groups, filter, label, and the open student**

Inside `OrgDashboard`, with the other `useState` hooks:

```javascript
  const [groups, setGroups] = useState([]);          // [{name, count}]
  const [ungrouped, setUngrouped] = useState(0);
  const [groupLabel, setGroupLabel] = useState('Group');
  const [groupFilter, setGroupFilter] = useState(null); // null = all; '__ungrouped__' = untagged
  const [openStudentId, setOpenStudentId] = useState(null);
```

- [ ] **Step 3: Load groups, and refetch progress when the filter changes**

After the existing `useEffect(() => { loadOrg(); }, [loadOrg]);`, add a groups loader and a filtered-progress effect:

```javascript
  const loadGroups = useCallback(async () => {
    const orgId = getOrgId(activeOrg);
    const uid = user?.id;
    if (!orgId || !uid) return;
    try {
      const res = await getOrgGroups(orgId, uid);
      setGroups(res?.data?.groups || []);
      setUngrouped(res?.data?.ungrouped || 0);
      setGroupLabel(res?.data?.group_label || 'Group');
    } catch { /* groups non-critical */ }
  }, [activeOrg, user]);

  useEffect(() => { if (canViewProgress) loadGroups(); }, [canViewProgress, loadGroups]);

  useEffect(() => {
    const orgId = getOrgId(activeOrg);
    const uid = user?.id;
    if (!orgId || !uid || !canViewProgress) return;
    getOrgProgress(orgId, uid, groupFilter)
      .then((res) => setProgress(res?.data?.students || []))
      .catch(() => { /* keep prior */ });
  }, [groupFilter, activeOrg, user, canViewProgress]);
```

- [ ] **Step 4: Render the group filter bar at the top of the Students tab**

Inside `{tab === 'students' && canViewProgress && (` … just inside the wrapper `<div className="space-y-4">`, before the stat cards, add:

```jsx
              {(groups.length > 0 || ungrouped > 0) && (
                <div className="flex flex-wrap gap-2" role="group" aria-label={`Filter by ${groupLabel}`}>
                  <button
                    onClick={() => setGroupFilter(null)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                      groupFilter === null
                        ? 'bg-cyan-500 text-white border-cyan-500'
                        : 'bg-bg-surface text-text-secondary border-border-default hover:bg-bg-elevated'
                    }`}
                  >
                    All
                  </button>
                  {groups.map((g) => (
                    <button
                      key={g.name}
                      onClick={() => setGroupFilter(g.name)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                        groupFilter === g.name
                          ? 'bg-cyan-500 text-white border-cyan-500'
                          : 'bg-bg-surface text-text-secondary border-border-default hover:bg-bg-elevated'
                      }`}
                    >
                      {g.name} <span className="opacity-70">({g.count})</span>
                    </button>
                  ))}
                  {ungrouped > 0 && (
                    <button
                      onClick={() => setGroupFilter('__ungrouped__')}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                        groupFilter === '__ungrouped__'
                          ? 'bg-cyan-500 text-white border-cyan-500'
                          : 'bg-bg-surface text-text-secondary border-border-default hover:bg-bg-elevated'
                      }`}
                    >
                      Ungrouped <span className="opacity-70">({ungrouped})</span>
                    </button>
                  )}
                </div>
              )}
```

- [ ] **Step 5: Add a Groups column header and cell; make rows open the drawer**

In the Students table `<thead>` row, add a header before `Status`:

```jsx
                            <th scope="col" className="px-4 py-3 font-semibold">{groupLabel}s</th>
```

In the `<tbody>` `progress.map(...)`, make the `<tr>` open the drawer and add the groups cell before the Status cell:

```jsx
                              <tr
                                key={s.id}
                                onClick={() => setOpenStudentId(s.id)}
                                onKeyDown={(e) => { if (e.key === 'Enter') setOpenStudentId(s.id); }}
                                tabIndex={0}
                                role="button"
                                aria-label={`Open ${name} detail`}
                                className="hover:bg-bg-elevated/50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                              >
```
And before the Status `<td>`:

```jsx
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap gap-1">
                                    {(s.groups || []).slice(0, 3).map((g) => (
                                      <span key={g} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 border border-cyan-200">{g}</span>
                                    ))}
                                    {(s.groups || []).length > 3 && (
                                      <span className="text-[10px] text-text-muted">+{s.groups.length - 3}</span>
                                    )}
                                  </div>
                                </td>
```

- [ ] **Step 6: Render the drawer at the end of the Students tab block**

Just before the closing of the `{tab === 'students' …}` block (after the table container), add:

```jsx
              {openStudentId && (
                <StudentDrawer
                  orgId={getOrgId(activeOrg)}
                  userId={user?.id}
                  studentId={openStudentId}
                  canEdit={isAdmin}
                  groupLabel={groupLabel}
                  onClose={() => setOpenStudentId(null)}
                  onGroupsChanged={() => { loadGroups(); setGroupFilter((f) => f); }}
                />
              )}
```

- [ ] **Step 7: Live-verify**

With backend + `npm run dev` running, sign in as an **admin**, go to the org → **Students** tab. Expected: filter chips appear (incl. any backfilled/Task-3 tags), a Groups column shows chips, clicking a chip narrows the roster, clicking a row opens the drawer (Task 8). No console errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/OrgDashboard.jsx
git commit -m "feat(org-ui): group filter bar, Groups column, row opens drill-down"
```

---

## Task 8: Frontend — `StudentDrawer` component (read-only)

**Files:**
- Create: `frontend/src/components/StudentDrawer.jsx`

- [ ] **Step 1: Create the drawer (header, summary, mastery, activity, lessons, a11y)**

```jsx
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Trophy, Zap, AlertTriangle, Activity, Loader2, BookOpen } from 'lucide-react';
import { getStudentDetail } from '../api';
import { safeErrorMsg } from '../utils/errorUtils';

const STATUS_PILL = {
  at_risk:  { label: 'At risk',  color: 'bg-red-100 text-red-600 border-red-200' },
  active:   { label: 'Active',   color: 'bg-green-100 text-green-600 border-green-200' },
  idle:     { label: 'Idle',     color: 'bg-amber-100 text-amber-600 border-amber-200' },
  inactive: { label: 'Inactive', color: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function relTime(ts) {
  if (!ts) return 'never';
  let iso = String(ts).replace(' ', 'T');
  if (!/[zZ]|[+\-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '—';
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function masteryColor(level) {
  const pct = (Number(level) || 0) * 100;
  if (pct < 40) return 'bg-red-400';
  if (pct < 70) return 'bg-amber-400';
  return 'bg-green-400';
}

export default function StudentDrawer({ orgId, userId, studentId, canEdit, groupLabel = 'Group', onClose, onGroupsChanged }) {
  const reduced = useReducedMotion();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const panelRef = useRef(null);

  const load = () => {
    setLoading(true); setError('');
    getStudentDetail(orgId, studentId, userId)
      .then((res) => setData(res?.data || null))
      .catch((err) => setError(safeErrorMsg(err, 'Failed to load student')))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orgId, studentId, userId]);

  // ESC to close + focus the panel on open
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const p = data?.profile;
  const s = data?.summary;
  const pill = STATUS_PILL[s?.status] || STATUS_PILL.inactive;
  const name = String(p?.name || p?.username || '—');

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.aside
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`${name} detail`}
          onClick={(e) => e.stopPropagation()}
          initial={reduced ? false : { x: '100%' }}
          animate={reduced ? false : { x: 0 }}
          exit={reduced ? undefined : { x: '100%' }}
          transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          className="w-full max-w-md h-full overflow-y-auto bg-bg-surface border-l border-border-default shadow-2xl focus:outline-none"
        >
          {loading ? (
            <div className="p-6 space-y-4">
              <div className="h-16 rounded-xl bg-bg-elevated animate-pulse" />
              <div className="h-20 rounded-xl bg-bg-elevated animate-pulse" />
              <div className="h-40 rounded-xl bg-bg-elevated animate-pulse" />
            </div>
          ) : error ? (
            <div className="p-6">
              <button onClick={onClose} className="mb-4 text-text-muted hover:text-text-secondary"><X size={18} /></button>
              <p className="text-sm text-red-500 mb-3">{String(error)}</p>
              <button onClick={load} className="px-4 py-2 rounded-xl bg-red-100 text-red-600 text-xs font-bold">Retry</button>
            </div>
          ) : (
            <div>
              {/* Header */}
              <div className="p-5 border-b border-border-default flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
                  {name.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-text-primary truncate">{name}</h2>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${pill.color}`}>{pill.label}</span>
                  </div>
                  {p?.email && <p className="text-xs text-text-muted truncate">{String(p.email)}</p>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(p?.groups || []).map((g) => (
                      <span key={g} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 border border-cyan-200">{g}</span>
                    ))}
                  </div>
                </div>
                <button onClick={onClose} className="text-text-muted hover:text-text-secondary p-1" aria-label="Close"><X size={18} /></button>
              </div>

              {/* Summary */}
              <div className="p-5 grid grid-cols-3 gap-3 border-b border-border-default text-center">
                <div><Zap size={14} className="mx-auto text-cyan-500 mb-1" /><div className="text-lg font-bold text-text-primary">{s?.xp ?? 0}</div><div className="text-[10px] text-text-muted uppercase tracking-wide">XP</div></div>
                <div><Trophy size={14} className="mx-auto text-amber-500 mb-1" /><div className="text-lg font-bold text-text-primary">{s?.lessons_completed ?? 0}</div><div className="text-[10px] text-text-muted uppercase tracking-wide">Lessons</div></div>
                <div><AlertTriangle size={14} className="mx-auto text-red-500 mb-1" /><div className="text-lg font-bold text-text-primary">{s?.struggle_total ?? 0}</div><div className="text-[10px] text-text-muted uppercase tracking-wide">Struggles</div></div>
              </div>
              <div className="px-5 py-2 text-xs text-text-muted border-b border-border-default">Last active: {relTime(s?.last_active)}</div>

              {/* Mastery */}
              <div className="p-5 border-b border-border-default">
                <h3 className="text-sm font-bold text-text-secondary mb-3">Topic mastery</h3>
                {(data?.mastery || []).length === 0 ? (
                  <p className="text-xs text-text-muted">No mastery data yet — {name} hasn't practiced.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.mastery.map((m) => (
                      <div key={m.topic} className="flex items-center gap-2">
                        <span className="text-xs text-text-secondary w-28 truncate">{m.topic}</span>
                        <div className="flex-1 h-2.5 bg-bg-elevated rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${masteryColor(m.mastery_level)}`} style={{ width: `${Math.round((Number(m.mastery_level) || 0) * 100)}%` }} />
                        </div>
                        <span className="text-[11px] text-text-muted w-9 text-right">{Math.round((Number(m.mastery_level) || 0) * 100)}%</span>
                        {(m.struggle_count || 0) > 0 && (
                          <span className="text-[10px] text-red-500 font-bold w-7 text-right">⚠{m.struggle_count}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity */}
              <div className="p-5 border-b border-border-default">
                <h3 className="text-sm font-bold text-text-secondary mb-3 flex items-center gap-1.5"><Activity size={14} /> Recent activity</h3>
                {(data?.activity || []).length === 0 ? (
                  <p className="text-xs text-text-muted">No recent activity.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.activity.slice(0, 12).map((a, i) => (
                      <li key={i} className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary truncate">{String(a.signal_type || 'signal').replace(/_/g, ' ')}{a.topic ? ` · ${a.topic}` : ''}</span>
                        <span className="text-text-muted shrink-0 ml-2">{relTime(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Lessons */}
              <div className="p-5">
                <h3 className="text-sm font-bold text-text-secondary mb-3 flex items-center gap-1.5"><BookOpen size={14} /> Recent lessons</h3>
                {(data?.lessons || []).length === 0 ? (
                  <p className="text-xs text-text-muted">No lessons completed yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.lessons.map((l, i) => (
                      <li key={i} className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary truncate">{String(l.lesson_id)}</span>
                        <span className="text-text-muted shrink-0 ml-2">+{l.xp_awarded || 0} XP · {relTime(l.completed_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Live-verify**

Reload the app, open a student row. Expected: drawer slides in from the right with header/summary/mastery (weakest-first, ⚠ on struggled topics)/activity/lessons; ESC and backdrop close it; a brand-new student shows the friendly empty-state lines (no crash).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StudentDrawer.jsx
git commit -m "feat(org-ui): student drill-down drawer (read-only)"
```

---

## Task 9: Frontend — tag editor in the drawer (admin+)

**Files:**
- Modify: `frontend/src/components/StudentDrawer.jsx`

- [ ] **Step 1: Extend imports and add tag-edit state**

Update the lucide import to add `Plus` and `Loader2` (already imported); add `setMemberGroups` to the api import:

```javascript
import { X, Trophy, Zap, AlertTriangle, Activity, Loader2, BookOpen, Plus } from 'lucide-react';
import { getStudentDetail, setMemberGroups } from '../api';
```
Add state (with the others):

```javascript
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [savingTags, setSavingTags] = useState(false);
```
Sync `tags` from loaded data — inside the `.then((res) => ...)` of `load`, after `setData`:

```javascript
      setTags(res?.data?.profile?.groups || []);
```

- [ ] **Step 2: Add save helpers**

Above the `return`:

```javascript
  const persistTags = async (next) => {
    setSavingTags(true);
    const prev = tags;
    setTags(next); // optimistic
    try {
      await setMemberGroups(orgId, studentId, next);
      onGroupsChanged?.();
    } catch {
      setTags(prev); // revert on failure
    } finally {
      setSavingTags(false);
    }
  };
  const addTag = () => {
    const t = newTag.trim().slice(0, 50);
    if (!t || tags.includes(t) || tags.length >= 20) { setNewTag(''); return; }
    setNewTag('');
    persistTags([...tags, t]);
  };
  const removeTag = (t) => persistTags(tags.filter((x) => x !== t));
```

- [ ] **Step 3: Replace the header group-chips block with an editable version (admin only)**

Replace the `<div className="flex flex-wrap gap-1 mt-2">…groups…</div>` in the header with:

```jsx
                  <div className="flex flex-wrap items-center gap-1 mt-2">
                    {(canEdit ? tags : (p?.groups || [])).map((g) => (
                      <span key={g} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 border border-cyan-200">
                        {g}
                        {canEdit && (
                          <button onClick={() => removeTag(g)} aria-label={`Remove ${g}`} className="hover:text-red-500"><X size={10} /></button>
                        )}
                      </span>
                    ))}
                    {canEdit && (
                      <span className="inline-flex items-center gap-1">
                        <input
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }}
                          placeholder={`Add ${groupLabel.toLowerCase()}`}
                          className="text-[11px] px-2 py-0.5 rounded-full border border-border-default bg-bg-surface w-28 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                        />
                        <button onClick={addTag} disabled={savingTags} aria-label="Add tag" className="text-cyan-600 hover:text-cyan-700">
                          {savingTags ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        </button>
                      </span>
                    )}
                  </div>
```

- [ ] **Step 4: Live-verify (admin then manager)**

As **admin**: open a student, add a tag (type + Enter) → chip appears; the roster filter bar count updates after close; remove a tag (✕) → it disappears. As **manager**: open a student → chips are read-only, no input/✕ shown. Confirm a manager attempting the PUT directly gets 403 (use the PowerShell call from Task 3 with a manager token).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StudentDrawer.jsx
git commit -m "feat(org-ui): inline group-tag editor in drawer (admin+)"
```

---

## Task 10: Frontend — polish (Groups overview card, group_label input, skeletons)

**Files:**
- Modify: `frontend/src/pages/OrgDashboard.jsx`

- [ ] **Step 1: Replace the Overview "Department Distribution" card with a "Groups" card**

In the Overview tab, replace the `Department Distribution` block (the `{Object.keys(deptDistribution).length > 0 && ( … )}` card) with a groups-driven card:

```jsx
              {groups.length > 0 && (
                <div className="bg-bg-surface backdrop-blur-xl rounded-2xl border border-border-default p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-text-secondary mb-4">{groupLabel} Distribution</h3>
                  <div className="space-y-3">
                    {groups.map((g) => {
                      const max = Math.max(1, ...groups.map((x) => x.count));
                      return (
                        <div key={g.name} className="flex items-center gap-3">
                          <span className="text-xs text-text-muted w-24 truncate">{g.name}</span>
                          <div className="flex-1 h-6 bg-bg-elevated rounded-lg overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-lg" style={{ width: `${(g.count / max) * 100}%` }} />
                          </div>
                          <span className="text-xs font-bold text-text-secondary w-8 text-right">{g.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
```
Ensure `loadGroups()` also runs for admins on the Overview tab — change the effect guard from `canViewProgress` to also cover overview by keeping `useEffect(() => { if (canViewProgress) loadGroups(); }, ...)` (managers+ see overview groups; members never see this card since the org tabs already gate them).

- [ ] **Step 2: Add an admin-only `group_label` input**

In the Overview tab (admin only), add a small settings row near the bottom (e.g. above the Delete Organization button):

```jsx
              {isAdmin && (
                <div className="bg-bg-surface backdrop-blur-xl rounded-2xl border border-border-default p-4 shadow-sm flex items-center gap-3 flex-wrap">
                  <label className="text-sm font-bold text-text-secondary">Group label</label>
                  <input
                    defaultValue={groupLabel}
                    onBlur={async (e) => {
                      const v = e.target.value.trim().slice(0, 30);
                      if (v && v !== groupLabel) {
                        try { await updateOrg(getOrgId(activeOrg), { group_label: v, user_id: user?.id }); setGroupLabel(v); loadGroups(); } catch {}
                      }
                    }}
                    className="input-neo py-1.5 px-3 text-sm w-40"
                    placeholder="Group"
                  />
                  <span className="text-xs text-text-muted">What a group is called for your org (e.g. Class, Batch, Team).</span>
                </div>
              )}
```

- [ ] **Step 3: Add a skeleton loader for the students roster**

In the Students tab, replace the bare `progress === null` spinner with skeleton rows:

```jsx
              {progress === null ? (
                <div className="space-y-2">
                  {[0,1,2,3].map((i) => <div key={i} className="h-14 rounded-xl bg-bg-elevated animate-pulse" />)}
                </div>
              ) : progress.length === 0 ? (
```

- [ ] **Step 4: Live-verify**

As admin: Overview shows a "{Label} Distribution" card and the Group-label input; change the label to "Class", blur → filter chips/headers re-render as "Class" (drawer placeholder too). Students tab shows skeleton rows briefly on load. Empty group filter shows the empty-state line.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/OrgDashboard.jsx
git commit -m "feat(org-ui): groups overview card, group_label setting, roster skeletons"
```

---

## Task 11: Full live user-testing pass + extend weekly E2E

**Files:** none (verification) / docs note

- [ ] **Step 1: Run the spec's 10 live flows on the running build**

Sign in across roles and verify each flow from spec §7:
1. Admin: add/remove group tags in drawer → roster + filter counts update.
2. Backfill: a member who had a `department` shows it as a tag.
3. Filter: group chip narrows roster; Ungrouped works; search composes.
4. Drill-down: mastery weakest-first w/ struggle flags; activity + lessons populate; numbers match the row.
5. Empty states: brand-new student → friendly empty sections, no crash.
6. Manager: can view roster + drawer; no tag-edit controls; server rejects manager PUT (403).
7. Non-member/member: Students tab gated; `/students/{id}` refuses non-members (404/403).
8. A11y: keyboard-open a row (Enter), Tab within drawer, ESC closes, focus returns.
9. Theme: toggle dark mode → roster, chips, drawer render correctly.
10. Label: set `group_label`="Class" → chips/headings/empty copy use "Class".

- [ ] **Step 2: Extend the weekly live E2E smoke routine**

Add flows #1 + #3 + #4 (tag a student → filter by group → open drawer → see mastery) to the existing weekly remote E2E routine's checklist (the Monday 08:00 IST smoke routine). Update its prompt/checklist accordingly.

- [ ] **Step 3: Commit any doc/routine updates**

```bash
git add -A
git commit -m "test(org): live E2E coverage for institutional console foundation"
```

---

## Self-Review (completed by author)

- **Spec coverage:** Groups table + backfill (T1), `group_label` (T5/T10), `/groups` (T2), set-tags PUT (T3), `/progress` filter + `groups[]` (T2), `/students/{id}` (T4), delete cascade (T5), API client (T6), filter bar + Groups column + row→drawer (T7), drawer read-only (T8), tag editor (T9), Overview Groups card + label input + skeletons/empty states (T10), live testing + E2E (T11). All §-requirements mapped.
- **Type/name consistency:** API fns (`getOrgGroups`, `setMemberGroups`, `getStudentDetail`, `getOrgProgress(…, group)`) match across T6–T10; drawer props (`orgId,userId,studentId,canEdit,groupLabel,onClose,onGroupsChanged`) match T7 usage; `__ungrouped__` sentinel matches T2 backend ⇄ T7 frontend; status keys (`at_risk/active/idle/inactive`) match T4 backend ⇄ T8 pill map.
- **Placeholders:** none — every code step contains full content.
