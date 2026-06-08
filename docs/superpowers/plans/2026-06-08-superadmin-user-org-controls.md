# Super Admin User & Org Controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the platform Super Admin DB-backed admin-role management (+env break-glass), per-user/per-org drill-down with a full action set (delete/edit, reset/revoke, super-admin/role, read-only view-as), and an audit log of every admin action.

**Architecture:** New `users.is_super_admin` + `users.token_version` columns and an `admin_audit` table. JWTs carry a `tv` claim verified against `token_version` (real session revocation). `require_super_admin` honors the env allowlist (break-glass) OR the DB flag. New admin endpoints power slide-over drawers (reusing the StudentDrawer pattern) plus Admins and Audit tabs. Read-only view-as renders the user's data via admin endpoints — no token is ever issued as the user.

**Tech Stack:** FastAPI + SQLite (Litestream) backend (`python-jose` JWT); React 19 + Vite + Tailwind 4 + framer-motion + lucide-react + axios frontend.

**Spec:** `docs/superpowers/specs/2026-06-08-superadmin-user-org-controls-design.md`

**Verification:** Live user testing against the running/deployed app with a throwaway test user/org — no unit/pytest suites. Per-task checks are code-level (`python -m py_compile`, `npx eslint`, `npm run build`); the full live pass is Task 14 after deploy.

---

## Git hygiene (every task)
The working tree has ~400 pre-existing unrelated dirty files. **Stage only the exact file(s) each task touches** — never `git add -A`/`.`/`-a`. Branch is `feat/superadmin-controls` (already checked out). End every commit body with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure
- **Modify** `backend/main.py` — add `is_super_admin`/`token_version` columns + `admin_audit` table (init block); pass `token_version` into `create_access_token` at register/login.
- **Modify** `backend/auth.py` — `tv` claim in `create_access_token`; `token_version` check in `_extract`.
- **Modify** `backend/routes/admin.py` — `require_super_admin` (DB+break-glass), `is_break_glass`, `_audit`; audit on block/plan; all new user/org/audit endpoints.
- **Modify** `frontend/src/api.js` — new admin client fns.
- **Create** `frontend/src/components/UserAdminDrawer.jsx`, `frontend/src/components/OrgAdminDrawer.jsx`.
- **Modify** `frontend/src/pages/SuperAdmin.jsx` — wire drawers, Admins tab, Audit tab, view-as.

---

## Task 1: Schema — admin columns + audit table

**Files:** Modify `backend/main.py` (init/migration block)

- [ ] **Step 1: Add the two user columns (migration pattern)**

Find the `users` migration block (the `if 'is_blocked' not in col_names:` / `if 'plan' not in col_names:` area, ~line 151-157). After the `plan` column block, add:

```python
        if 'is_super_admin' not in col_names:
            print("Migrating DB: Adding is_super_admin column")
            cursor.execute("ALTER TABLE users ADD COLUMN is_super_admin INTEGER DEFAULT 0")
        if 'token_version' not in col_names:
            print("Migrating DB: Adding token_version column")
            cursor.execute("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0")
```

- [ ] **Step 2: Add the admin_audit table**

Near the other `CREATE TABLE IF NOT EXISTS` calls in the init block (e.g. just after the `org_member_groups` block from the prior feature), add:

```python
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS admin_audit (
                id          TEXT PRIMARY KEY,
                actor_id    TEXT NOT NULL,
                actor_name  TEXT,
                action      TEXT NOT NULL,
                target_type TEXT,
                target_id   TEXT,
                detail      TEXT,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit(target_type, target_id)")
```

- [ ] **Step 3: Verify it parses**

Run: `python -m py_compile backend/main.py`
Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat(admin): is_super_admin + token_version columns + admin_audit table"
```

---

## Task 2: Auth — `tv` claim + session revocation

**Files:** Modify `backend/auth.py`, `backend/main.py` (token mint sites)

- [ ] **Step 1: Add DB access + token_version to auth.py**

At the top of `backend/auth.py`, after `import time`, add:

```python
import sqlite3

DB_PATH = os.getenv("DB_PATH", os.path.abspath("pymasters.db"))


def _current_token_version(user_id: str) -> int:
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute("SELECT COALESCE(token_version, 0) FROM users WHERE id = ?", [user_id]).fetchone()
        conn.close()
        return int(row[0]) if row else None
    except Exception:
        return 0
```

(Returning `None` when the user row is missing lets `_extract` reject deleted users.)

- [ ] **Step 2: Embed `tv` in the token**

Replace `create_access_token` with:

```python
def create_access_token(user_id: str, username: str = None, token_version: int = 0) -> str:
    now = int(time.time())
    payload = {"sub": str(user_id), "username": username, "tv": int(token_version or 0),
               "iat": now, "exp": now + JWT_TTL_SECONDS}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)
```

- [ ] **Step 3: Verify `tv` in `_extract`**

Replace `_extract` with:

```python
def _extract(authorization: str) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired session. Please sign in again.")
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token")
    # Session revocation: token's tv must match the user's current token_version.
    current = _current_token_version(sub)
    if current is None:
        raise HTTPException(status_code=401, detail="Account no longer exists.")
    if int(payload.get("tv") or 0) != current:
        raise HTTPException(status_code=401, detail="Session ended. Please sign in again.")
    return sub
```

- [ ] **Step 4: Pass token_version at the mint sites**

In `backend/main.py` at the **register** path (~line 732) change `create_access_token(user_id, user.username)` to `create_access_token(user_id, user.username, 0)` (new users start at version 0).

At the **login** path (~line 785), the user row is loaded as `record`. Just before building the response, read the version and pass it. Find `"token": create_access_token(record[0], user.username),` and change to:

```python
            "token": create_access_token(record[0], user.username, _login_token_version(record[0])),
```

And add a tiny helper near the top of `main.py` (after imports) — or inline the query. Add this helper:

```python
def _login_token_version(user_id):
    try:
        c = sqlite3.connect(DB_PATH)
        r = c.execute("SELECT COALESCE(token_version,0) FROM users WHERE id = ?", [user_id]).fetchone()
        c.close()
        return int(r[0]) if r else 0
    except Exception:
        return 0
```

(`sqlite3` and `DB_PATH` are already imported/defined in main.py — verify; if `DB_PATH` differs, use the existing name.)

- [ ] **Step 5: Verify**

Run: `python -m py_compile backend/auth.py backend/main.py`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/auth.py backend/main.py
git commit -m "feat(auth): tv claim + token_version session revocation"
```

---

## Task 3: admin.py foundation — roles, break-glass, audit helper

**Files:** Modify `backend/routes/admin.py`

- [ ] **Step 1: Add imports + helpers**

At the top of `backend/routes/admin.py` ensure `import json`, `import uuid` are present (add if missing). Then replace `require_super_admin` with a version honoring the DB flag, and add `is_break_glass` + `_audit`:

```python
def is_break_glass(username: str, email: str) -> bool:
    idents = {(username or "").lower(), (email or "").lower()}
    return bool(idents & SUPER_ADMINS)


def require_super_admin(user_id: str):
    conn = _conn()
    row = conn.execute("SELECT username, email, COALESCE(is_super_admin,0) FROM users WHERE id = ?",
                       [user_id]).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=403, detail="Super admin access required")
    if is_break_glass(row["username"], row["email"]) or int(row[2]) == 1:
        return True
    raise HTTPException(status_code=403, detail="Super admin access required")


def _actor_name(conn, user_id: str) -> str:
    r = conn.execute("SELECT COALESCE(NULLIF(name,''), username) FROM users WHERE id = ?", [user_id]).fetchone()
    return r[0] if r else user_id


def _audit(conn, actor_id, action, target_type=None, target_id=None, detail=None):
    conn.execute(
        "INSERT INTO admin_audit (id, actor_id, actor_name, action, target_type, target_id, detail) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        [str(uuid.uuid4()), actor_id, _actor_name(conn, actor_id), action, target_type, target_id,
         json.dumps(detail or {})],
    )
```

Note: `require_super_admin` now uses `row["username"]`/`row["email"]` (row_factory is set in `_conn()`), and `row[2]` for the flag — verify `_conn()` sets `sqlite3.Row`.

- [ ] **Step 2: Audit the existing block + plan endpoints**

In `block_user`, after the UPDATE and before `conn.commit()`:

```python
    _audit(conn, caller, "user.block", "user", target_id, {"blocked": bool(req.blocked)})
```

In `set_user_plan`, after the UPDATE and before `conn.commit()`:

```python
    _audit(conn, caller, "user.plan", "user", target_id, {"plan": req.plan})
```

- [ ] **Step 3: Verify**

Run: `python -m py_compile backend/routes/admin.py`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/admin.py
git commit -m "feat(admin): DB-backed super-admin + break-glass + audit helper"
```

---

## Task 4: Backend — user detail + view-as

**Files:** Modify `backend/routes/admin.py`

- [ ] **Step 1: Add the detail endpoint** (place after `list_users`)

```python
@router.get("/users/{target_id}")
def user_detail(target_id: str, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    u = conn.execute("""
        SELECT id, username, name, email,
               COALESCE(NULLIF(account_type,''),'individual') account_type,
               COALESCE(points,0) points, created_at,
               COALESCE(onboarding_completed,0) onboarding_completed,
               COALESCE(is_blocked,0) is_blocked, COALESCE(NULLIF(plan,''),'free') plan,
               COALESCE(is_super_admin,0) is_super_admin, COALESCE(token_version,0) token_version
        FROM users WHERE id = ?
    """, [target_id]).fetchone()
    if not u:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    lessons = conn.execute("SELECT COUNT(*) FROM lesson_completions WHERE user_id = ?", [target_id]).fetchone()[0]
    last_active = conn.execute("SELECT MAX(created_at) FROM learning_signals WHERE user_id = ?", [target_id]).fetchone()[0]
    weak = [dict(r) for r in conn.execute(
        "SELECT topic, mastery_level, struggle_count FROM user_mastery WHERE user_id = ? "
        "ORDER BY mastery_level ASC, struggle_count DESC LIMIT 5", [target_id]).fetchall()]
    activity = [dict(r) for r in conn.execute(
        "SELECT signal_type, topic, created_at FROM learning_signals WHERE user_id = ? "
        "ORDER BY created_at DESC LIMIT 10", [target_id]).fetchall()]
    orgs = [dict(r) for r in conn.execute(
        "SELECT o.id org_id, o.name org_name, om.role FROM org_members om "
        "JOIN organizations o ON o.id = om.org_id WHERE om.user_id = ?", [target_id]).fetchall()]
    audit = [dict(r) for r in conn.execute(
        "SELECT action, actor_name, detail, created_at FROM admin_audit "
        "WHERE target_type='user' AND target_id = ? ORDER BY created_at DESC LIMIT 10", [target_id]).fetchall()]
    conn.close()
    d = dict(u)
    d["break_glass"] = is_break_glass(d["username"], d["email"])
    d["has_email"] = bool((d["email"] or "").strip())
    d["lessons_completed"] = lessons
    d["last_active"] = last_active
    d["weak_topics"] = weak
    d["activity"] = activity
    d["orgs"] = orgs
    d["recent_audit"] = audit
    return d
```

- [ ] **Step 2: Add the view-as endpoint**

```python
@router.get("/users/{target_id}/view-as")
def user_view_as(target_id: str, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    u = conn.execute("SELECT id, username, name, COALESCE(points,0) points FROM users WHERE id = ?",
                     [target_id]).fetchone()
    if not u:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    lessons = [dict(r) for r in conn.execute(
        "SELECT lesson_id, xp_awarded, completed_at FROM lesson_completions WHERE user_id = ? "
        "ORDER BY completed_at DESC LIMIT 20", [target_id]).fetchall()]
    mastery = [dict(r) for r in conn.execute(
        "SELECT topic, mastery_level, attempts, struggle_count FROM user_mastery WHERE user_id = ? "
        "ORDER BY mastery_level DESC LIMIT 30", [target_id]).fetchall()]
    signals_7d = conn.execute(
        "SELECT COUNT(*) FROM learning_signals WHERE user_id = ? AND created_at > datetime('now','-7 days')",
        [target_id]).fetchone()[0]
    _audit(conn, caller, "user.view_as", "user", target_id, {})
    conn.commit()
    conn.close()
    return {"profile": dict(u), "summary": {"xp": u["points"], "lessons_completed": len(lessons),
            "signals_7d": signals_7d}, "lessons": lessons, "mastery": mastery}
```

- [ ] **Step 3: Verify**

Run: `python -m py_compile backend/routes/admin.py`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/admin.py
git commit -m "feat(admin): user detail + read-only view-as endpoints"
```

---

## Task 5: Backend — user mutation endpoints

**Files:** Modify `backend/routes/admin.py`

- [ ] **Step 1: Add request models** (next to `BlockRequest`/`PlanRequest`)

```python
class EditUserRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    account_type: Optional[str] = None

class SuperAdminRequest(BaseModel):
    value: bool

class UserRoleRequest(BaseModel):
    org_id: str
    role: str
```

Ensure `from typing import Optional` is imported at the top (add if missing).

- [ ] **Step 2: Add the endpoints**

```python
@router.patch("/users/{target_id}")
def edit_user(target_id: str, req: EditUserRequest, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    sets, vals, detail = [], [], {}
    for f in ["name", "email", "account_type"]:
        v = getattr(req, f, None)
        if v is not None:
            sets.append(f"{f} = ?"); vals.append(v.strip()); detail[f] = v.strip()
    if sets:
        vals.append(target_id)
        conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", vals)
        _audit(conn, caller, "user.edit", "user", target_id, detail)
        conn.commit()
    conn.close()
    return {"ok": True, "updated": detail}


@router.delete("/users/{target_id}")
def delete_user(target_id: str, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    if target_id == caller:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    conn = _conn()
    row = conn.execute("SELECT username, email FROM users WHERE id = ?", [target_id]).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    if is_break_glass(row["username"], row["email"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Cannot delete a break-glass (env) super admin")
    for tbl in ["org_members", "lesson_completions", "learning_signals", "user_mastery",
                "generated_lessons", "module_generation_jobs", "notifications"]:
        try:
            conn.execute(f"DELETE FROM {tbl} WHERE user_id = ?", [target_id])
        except Exception:
            pass
    try:
        conn.execute("DELETE FROM playground_conversations WHERE user_id = ?", [target_id])
    except Exception:
        pass
    conn.execute("DELETE FROM users WHERE id = ?", [target_id])
    # admin_audit rows are intentionally preserved (trail survives the deletion).
    _audit(conn, caller, "user.delete", "user", target_id, {"username": row["username"]})
    conn.commit()
    conn.close()
    return {"ok": True, "deleted": target_id}


@router.post("/users/{target_id}/super-admin")
def set_super_admin(target_id: str, req: SuperAdminRequest, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    row = conn.execute("SELECT username, email FROM users WHERE id = ?", [target_id]).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    if is_break_glass(row["username"], row["email"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Break-glass (env) admins are managed via env, not the console")
    if target_id == caller and not req.value:
        conn.close()
        raise HTTPException(status_code=400, detail="You cannot remove your own super-admin access")
    conn.execute("UPDATE users SET is_super_admin = ? WHERE id = ?", [1 if req.value else 0, target_id])
    _audit(conn, caller, "user.super_admin", "user", target_id, {"value": bool(req.value)})
    conn.commit()
    conn.close()
    return {"ok": True, "is_super_admin": bool(req.value)}


@router.post("/users/{target_id}/role")
def set_user_org_role(target_id: str, req: UserRoleRequest, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    if req.role not in ("super_admin", "admin", "manager", "member"):
        raise HTTPException(status_code=400, detail="Invalid role")
    conn = _conn()
    member = conn.execute("SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?",
                          [req.org_id, target_id]).fetchone()
    if not member:
        conn.close()
        raise HTTPException(status_code=404, detail="User is not a member of that org")
    conn.execute("UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?",
                 [req.role, req.org_id, target_id])
    _audit(conn, caller, "user.role", "user", target_id, {"org_id": req.org_id, "role": req.role})
    conn.commit()
    conn.close()
    return {"ok": True, "role": req.role}


@router.post("/users/{target_id}/reset-password")
def admin_reset_password(target_id: str, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    row = conn.execute("SELECT username, email FROM users WHERE id = ?", [target_id]).fetchone()
    if not row:
        conn.close(); raise HTTPException(status_code=404, detail="User not found")
    identifier = (row["email"] or "").strip() or (row["username"] or "").strip()
    if "@" not in identifier:
        conn.close(); raise HTTPException(status_code=400, detail="User has no email on file; add one via Edit first")
    _audit(conn, caller, "user.reset", "user", target_id, {"identifier": identifier})
    conn.commit(); conn.close()
    try:
        from routes.auth_routes import _send_password_reset   # reuse the existing flow
        _send_password_reset(identifier)
    except Exception as e:
        print(f"[admin reset] could not send: {e}")
    return {"ok": True}


@router.post("/users/{target_id}/revoke-sessions")
def revoke_sessions(target_id: str, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    conn.execute("UPDATE users SET token_version = COALESCE(token_version,0) + 1 WHERE id = ?", [target_id])
    _audit(conn, caller, "user.revoke", "user", target_id, {})
    conn.commit()
    conn.close()
    return {"ok": True}
```

**Note on reset-password reuse:** the existing forgot-password sender lives in the auth routes. Before implementing, `grep -rn "forgot-password\|def forgot\|password_reset\|_send_password_reset" backend/` to find the real function/module name and call it; if it isn't easily importable, replicate its token-create + email-send inline (it inserts into `password_resets` and emails a `/reset-password/{token}` link). Do NOT leave a placeholder — wire a working send.

- [ ] **Step 3: Verify**

Run: `python -m py_compile backend/routes/admin.py`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/admin.py
git commit -m "feat(admin): user edit/delete/super-admin/role/reset/revoke endpoints"
```

---

## Task 6: Backend — org endpoints + audit list

**Files:** Modify `backend/routes/admin.py`

- [ ] **Step 1: Add request models** (with the others)

```python
class OrgPlanRequest(BaseModel):
    plan: str

class OrgTypeRequest(BaseModel):
    type: str
```

- [ ] **Step 2: Add the endpoints**

```python
@router.get("/orgs/{org_id}")
def org_detail(org_id: str, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    o = conn.execute("""SELECT id, name, COALESCE(NULLIF(type,''),'other') type,
                        COALESCE(NULLIF(plan,''),'free') plan, created_at FROM organizations WHERE id = ?""",
                     [org_id]).fetchone()
    if not o:
        conn.close(); raise HTTPException(status_code=404, detail="Org not found")
    members = [dict(r) for r in conn.execute(
        "SELECT u.id, COALESCE(NULLIF(u.name,''), u.username) name, om.role "
        "FROM org_members om JOIN users u ON u.id = om.user_id WHERE om.org_id = ? ORDER BY om.role",
        [org_id]).fetchall()]
    conn.close()
    d = dict(o); d["members"] = members; d["member_count"] = len(members)
    return d


@router.post("/orgs/{org_id}/plan")
def set_org_plan(org_id: str, req: OrgPlanRequest, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    conn.execute("UPDATE organizations SET plan = ? WHERE id = ?", [req.plan, org_id])
    _audit(conn, caller, "org.plan", "org", org_id, {"plan": req.plan})
    conn.commit(); conn.close()
    return {"ok": True, "plan": req.plan}


@router.post("/orgs/{org_id}/type")
def set_org_type(org_id: str, req: OrgTypeRequest, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    conn.execute("UPDATE organizations SET type = ? WHERE id = ?", [req.type, org_id])
    _audit(conn, caller, "org.type", "org", org_id, {"type": req.type})
    conn.commit(); conn.close()
    return {"ok": True, "type": req.type}


@router.delete("/orgs/{org_id}")
def delete_org_admin(org_id: str, caller: str = Depends(get_current_user_id)):
    require_super_admin(caller)
    conn = _conn()
    for tbl in ["org_members", "org_invites", "org_member_groups", "org_profiles"]:
        try:
            conn.execute(f"DELETE FROM {tbl} WHERE org_id = ?", [org_id])
        except Exception:
            pass
    conn.execute("DELETE FROM organizations WHERE id = ?", [org_id])
    _audit(conn, caller, "org.delete", "org", org_id, {})
    conn.commit(); conn.close()
    return {"ok": True, "deleted": org_id}


@router.get("/audit")
def list_audit(caller: str = Depends(get_current_user_id), limit: int = 50, offset: int = 0,
               target_type: str = None, target_id: str = None):
    require_super_admin(caller)
    conn = _conn()
    where, params = [], []
    if target_type:
        where.append("target_type = ?"); params.append(target_type)
    if target_id:
        where.append("target_id = ?"); params.append(target_id)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        f"SELECT id, actor_id, actor_name, action, target_type, target_id, detail, created_at "
        f"FROM admin_audit {clause} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params + [min(limit, 200), offset]).fetchall()
    total = conn.execute(f"SELECT COUNT(*) FROM admin_audit {clause}", params).fetchone()[0]
    conn.close()
    return {"audit": [dict(r) for r in rows], "total": total}
```

- [ ] **Step 3: Verify**

Run: `python -m py_compile backend/routes/admin.py`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/admin.py
git commit -m "feat(admin): org detail/plan/type/delete + audit list endpoints"
```

---

## Task 7: Frontend API client fns

**Files:** Modify `frontend/src/api.js` (after the existing `adminSetPlan` line)

- [ ] **Step 1: Add the functions**

```javascript
export const getAdminUserDetail = (userId, targetId) => api.get(`/admin/users/${targetId}`, { params: { user_id: userId } });
export const getAdminUserViewAs = (userId, targetId) => api.get(`/admin/users/${targetId}/view-as`, { params: { user_id: userId } });
export const adminUpdateUser = (userId, targetId, data) => api.patch(`/admin/users/${targetId}`, { user_id: userId, ...data });
export const adminDeleteUser = (userId, targetId) => api.delete(`/admin/users/${targetId}`, { params: { user_id: userId } });
export const adminSetSuperAdmin = (userId, targetId, value) => api.post(`/admin/users/${targetId}/super-admin`, { user_id: userId, value });
export const adminSetUserRole = (userId, targetId, org_id, role) => api.post(`/admin/users/${targetId}/role`, { user_id: userId, org_id, role });
export const adminResetPassword = (userId, targetId) => api.post(`/admin/users/${targetId}/reset-password`, { user_id: userId });
export const adminRevokeSessions = (userId, targetId) => api.post(`/admin/users/${targetId}/revoke-sessions`, { user_id: userId });
export const getAdminOrgDetail = (userId, orgId) => api.get(`/admin/orgs/${orgId}`, { params: { user_id: userId } });
export const adminSetOrgPlan = (userId, orgId, plan) => api.post(`/admin/orgs/${orgId}/plan`, { user_id: userId, plan });
export const adminSetOrgType = (userId, orgId, type) => api.post(`/admin/orgs/${orgId}/type`, { user_id: userId, type });
export const adminDeleteOrg = (userId, orgId) => api.delete(`/admin/orgs/${orgId}`, { params: { user_id: userId } });
export const getAdminAudit = (userId, params = {}) => api.get('/admin/audit', { params: { user_id: userId, ...params } });
```

(The backend derives the actor from the JWT; `user_id` is sent only for parity with existing calls and is ignored server-side.)

- [ ] **Step 2: Verify**

Run from `frontend/`: `npx eslint src/api.js`
Expected: no NEW errors (pre-existing `no-empty` errors at lines ~17/182 are baseline).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(api): super-admin user/org/audit client functions"
```

---

## Task 8: `UserAdminDrawer` + Users-tab wiring

**Files:** Create `frontend/src/components/UserAdminDrawer.jsx`; Modify `frontend/src/pages/SuperAdmin.jsx`

**Reference:** model the drawer shell (dialog role, ESC, focus-return, reduced-motion, skeleton/error) on `frontend/src/components/StudentDrawer.jsx`. Read it first and mirror its structure.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/UserAdminDrawer.jsx`:

```jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { X, Shield, Trash2, KeyRound, LogOut, Zap, Trophy, Mail, Eye } from 'lucide-react';
import {
  getAdminUserDetail, adminUpdateUser, adminDeleteUser, adminSetSuperAdmin,
  adminSetUserRole, adminResetPassword, adminRevokeSessions, adminBlockUser, adminSetPlan,
} from '../api';
import { safeErrorMsg } from '../utils/errorUtils';

const PLANS = ['free', 'pro', 'enterprise'];
const ROLES = ['member', 'manager', 'admin', 'super_admin'];

function relTime(ts) {
  if (!ts) return 'never';
  let iso = String(ts).replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const d = Math.floor((Date.now() - t) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d}d ago` : d < 365 ? `${Math.floor(d/30)}mo ago` : `${Math.floor(d/365)}y ago`;
}

export default function UserAdminDrawer({ adminId, targetId, onClose, onChanged, onViewAs }) {
  const reduced = useReducedMotion();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', account_type: 'individual' });
  const [confirmDel, setConfirmDel] = useState('');
  const panelRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminUserDetail(adminId, targetId)
      .then((r) => { setD(r.data); setForm({ name: r.data.name || '', email: r.data.email || '', account_type: r.data.account_type || 'individual' }); })
      .catch((e) => setError(safeErrorMsg(e, 'Failed to load user')))
      .finally(() => setLoading(false));
  }, [adminId, targetId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const prev = typeof document !== 'undefined' ? document.activeElement : null;
    panelRef.current?.focus();
    return () => { try { prev?.focus?.(); } catch { /* gone */ } };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (key, fn, detail) => {
    setBusy(key); setError('');
    try { await fn(); onChanged?.(); load(); }
    catch (e) { setError(safeErrorMsg(e, 'Action failed')); }
    finally { setBusy(''); }
  };

  const name = String(d?.name || d?.username || '—');
  const isSuper = d?.is_super_admin || d?.break_glass;

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${name} admin`}
          onClick={(e) => e.stopPropagation()}
          initial={reduced ? false : { x: '100%' }} animate={reduced ? false : { x: 0 }} exit={reduced ? undefined : { x: '100%' }}
          transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          className="w-full max-w-md h-full overflow-y-auto bg-bg-surface border-l border-border-default shadow-2xl focus:outline-none">
          {loading ? (
            <div className="p-6 space-y-4">{[0,1,2].map(i => <div key={i} className="h-20 rounded-xl bg-bg-elevated animate-pulse" />)}</div>
          ) : error && !d ? (
            <div className="p-6"><button onClick={onClose} className="mb-3 text-text-muted"><X size={18} /></button><p className="text-sm text-red-500 mb-3">{String(error)}</p><button onClick={load} className="px-4 py-2 rounded-xl bg-red-100 text-red-600 text-xs font-bold">Retry</button></div>
          ) : d ? (
            <div>
              {/* Header */}
              <div className="p-5 border-b border-border-default flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">{name.substring(0,2).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-text-primary truncate">{name}</h2>
                  <p className="text-xs text-text-muted truncate">@{String(d.username)}{d.email ? ` · ${d.email}` : ''}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">{d.plan}</span>
                    {d.is_blocked ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">blocked</span> : null}
                    {isSuper ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">{d.break_glass ? 'super-admin · env · locked' : 'super-admin'}</span> : null}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{d.account_type}</span>
                  </div>
                </div>
                <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-secondary p-1"><X size={18} /></button>
              </div>

              {error ? <div className="px-5 py-2 text-xs text-red-500">{String(error)}</div> : null}

              {/* Summary */}
              <div className="p-5 grid grid-cols-3 gap-3 border-b border-border-default text-center">
                <div><Zap size={14} className="mx-auto text-cyan-500 mb-1" /><div className="text-lg font-bold text-text-primary">{d.points}</div><div className="text-[10px] text-text-muted uppercase">XP</div></div>
                <div><Trophy size={14} className="mx-auto text-amber-500 mb-1" /><div className="text-lg font-bold text-text-primary">{d.lessons_completed}</div><div className="text-[10px] text-text-muted uppercase">Lessons</div></div>
                <div><div className="text-lg font-bold text-text-primary mt-4">{relTime(d.last_active)}</div><div className="text-[10px] text-text-muted uppercase">Last active</div></div>
              </div>

              {/* Edit form */}
              {editing ? (
                <div className="p-5 border-b border-border-default space-y-2">
                  <input className="input-neo w-full py-2 text-sm" placeholder="Name" value={form.name} onChange={(e)=>setForm(f=>({...f,name:e.target.value}))} />
                  <input className="input-neo w-full py-2 text-sm" placeholder="Email" value={form.email} onChange={(e)=>setForm(f=>({...f,email:e.target.value}))} />
                  <select className="input-neo w-full py-2 text-sm" value={form.account_type} onChange={(e)=>setForm(f=>({...f,account_type:e.target.value}))}>
                    <option value="individual">individual</option><option value="organization">organization</option>
                  </select>
                  <div className="flex gap-2">
                    <button disabled={busy==='edit'} onClick={()=>act('edit',()=>adminUpdateUser(adminId,targetId,form)).then(()=>setEditing(false))} className="btn-neo btn-neo-primary py-1.5 px-4 text-sm">Save</button>
                    <button onClick={()=>setEditing(false)} className="btn-neo btn-neo-ghost py-1.5 px-4 text-sm">Cancel</button>
                  </div>
                </div>
              ) : null}

              {/* Org memberships + role */}
              {(d.orgs || []).length ? (
                <div className="p-5 border-b border-border-default">
                  <h3 className="text-sm font-bold text-text-secondary mb-2">Organizations</h3>
                  <div className="space-y-2">
                    {d.orgs.map((o) => (
                      <div key={o.org_id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-text-secondary truncate">{o.org_name}</span>
                        <select disabled={busy.startsWith('role')} value={o.role}
                          onChange={(e)=>act(`role-${o.org_id}`,()=>adminSetUserRole(adminId,targetId,o.org_id,e.target.value))}
                          className="text-xs input-neo py-1 px-2">
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Actions */}
              <div className="p-5 border-b border-border-default grid grid-cols-2 gap-2">
                <button disabled={busy==='block'} onClick={()=>act('block',()=>adminBlockUser(targetId,adminId,!d.is_blocked))} className="btn-neo btn-neo-ghost py-2 text-sm">{d.is_blocked ? 'Unblock' : 'Block'}</button>
                <select disabled={busy==='plan'} value={d.plan} onChange={(e)=>act('plan',()=>adminSetPlan(targetId,adminId,e.target.value))} className="input-neo py-2 text-sm">
                  {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <button onClick={()=>setEditing(v=>!v)} className="btn-neo btn-neo-ghost py-2 text-sm">Edit</button>
                <button onClick={()=>onViewAs?.(d)} className="btn-neo btn-neo-ghost py-2 text-sm inline-flex items-center justify-center gap-1"><Eye size={14}/>View as</button>
                <button disabled={!d.has_email || busy==='reset'} title={d.has_email ? '' : 'No email on file — add one via Edit'} onClick={()=>act('reset',()=>adminResetPassword(adminId,targetId))} className="btn-neo btn-neo-ghost py-2 text-sm inline-flex items-center justify-center gap-1"><KeyRound size={14}/>Reset pw</button>
                <button disabled={busy==='revoke'} onClick={()=>act('revoke',()=>adminRevokeSessions(adminId,targetId))} className="btn-neo btn-neo-ghost py-2 text-sm inline-flex items-center justify-center gap-1"><LogOut size={14}/>Revoke</button>
                {!d.break_glass ? (
                  <button disabled={busy==='super'} onClick={()=>act('super',()=>adminSetSuperAdmin(adminId,targetId,!d.is_super_admin))} className="btn-neo btn-neo-ghost py-2 text-sm inline-flex items-center justify-center gap-1"><Shield size={14}/>{d.is_super_admin ? 'Revoke admin' : 'Make admin'}</button>
                ) : <div className="text-[10px] text-text-muted flex items-center justify-center">env admin · locked</div>}
                {!d.break_glass && d.id !== adminId ? (
                  <div className="col-span-2">
                    {confirmDel === d.username ? (
                      <button disabled={busy==='del'} onClick={()=>act('del',()=>adminDeleteUser(adminId,targetId)).then(()=>onClose())} className="w-full py-2 text-sm font-bold text-white bg-red-500 rounded-xl">Confirm delete</button>
                    ) : (
                      <input className="input-neo w-full py-2 text-sm" placeholder={`Type "${d.username}" to delete`} value={confirmDel} onChange={(e)=>setConfirmDel(e.target.value)} />
                    )}
                  </div>
                ) : null}
              </div>

              {/* Recent admin actions */}
              {(d.recent_audit || []).length ? (
                <div className="p-5">
                  <h3 className="text-sm font-bold text-text-secondary mb-2">Recent admin actions</h3>
                  <ul className="space-y-1.5">
                    {d.recent_audit.map((a, i) => (
                      <li key={i} className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary">{a.action} <span className="text-text-muted">by {a.actor_name}</span></span>
                        <span className="text-text-muted">{relTime(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Wire it into SuperAdmin.jsx Users tab**

In `frontend/src/pages/SuperAdmin.jsx`: import the drawer and `adminId` (the current super-admin's `user.id`). Add state `const [openUserId, setOpenUserId] = useState(null); const [viewAsUser, setViewAsUser] = useState(null);`. In the Users table `<tbody>`, make each row clickable: add `onClick={() => setOpenUserId(u.id)}` + `className="... cursor-pointer"` to the `<tr>` (keep existing block/plan controls working by adding `onClick={(e)=>e.stopPropagation()}` to the cells that contain interactive controls). After the table, render:

```jsx
{openUserId && (
  <UserAdminDrawer
    adminId={user.id}
    targetId={openUserId}
    onClose={() => setOpenUserId(null)}
    onChanged={() => loadUsers(q)}
    onViewAs={(u) => { setViewAsUser(u); setOpenUserId(null); }}
  />
)}
```

Add the import: `import UserAdminDrawer from '../components/UserAdminDrawer';`

- [ ] **Step 3: Verify**

Run from `frontend/`: `npx eslint src/components/UserAdminDrawer.jsx src/pages/SuperAdmin.jsx`
Expected: no NEW errors (the `motion` disable comment mirrors StudentDrawer).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/UserAdminDrawer.jsx frontend/src/pages/SuperAdmin.jsx
git commit -m "feat(admin-ui): user admin drawer with full action set + Users wiring"
```

---

## Task 9: View-as read-only panel

**Files:** Modify `frontend/src/pages/SuperAdmin.jsx`

- [ ] **Step 1: Add the view-as panel**

In `SuperAdmin.jsx`, import `getAdminUserViewAs` and add a panel rendered when `viewAsUser` is set. On open, fetch the snapshot; render under a sticky banner. Add this near the other render blocks:

```jsx
{viewAsUser && (
  <ViewAsPanel adminId={user.id} target={viewAsUser} onExit={() => setViewAsUser(null)} />
)}
```

And define `ViewAsPanel` (in the same file, above the default export, or as a small component):

```jsx
function ViewAsPanel({ adminId, target, onExit }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    getAdminUserViewAs(adminId, target.id)
      .then((r) => setData(r.data)).catch((e) => setErr(safeErrorMsg(e, 'Failed')));
  }, [adminId, target.id]);
  return (
    <div className="fixed inset-0 z-50 bg-bg-base overflow-y-auto">
      <div className="sticky top-0 z-10 bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm font-semibold">
        <span>Viewing {String(target.name || target.username)} · read-only</span>
        <button onClick={onExit} className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30">Exit</button>
      </div>
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        {err ? <p className="text-red-500 text-sm">{err}</p> : !data ? <p className="text-text-muted text-sm">Loading…</p> : (
          <>
            <h2 className="text-xl font-bold text-text-primary">{String(data.profile?.name || data.profile?.username)}</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-bg-surface border border-border-default rounded-2xl p-4 text-center"><div className="text-2xl font-bold text-text-primary">{data.summary?.xp ?? 0}</div><div className="text-xs text-text-muted">XP</div></div>
              <div className="bg-bg-surface border border-border-default rounded-2xl p-4 text-center"><div className="text-2xl font-bold text-text-primary">{data.summary?.lessons_completed ?? 0}</div><div className="text-xs text-text-muted">Lessons</div></div>
              <div className="bg-bg-surface border border-border-default rounded-2xl p-4 text-center"><div className="text-2xl font-bold text-text-primary">{data.summary?.signals_7d ?? 0}</div><div className="text-xs text-text-muted">Signals 7d</div></div>
            </div>
            <div className="bg-bg-surface border border-border-default rounded-2xl p-4">
              <h3 className="text-sm font-bold text-text-secondary mb-2">Topic mastery</h3>
              {(data.mastery || []).length === 0 ? <p className="text-xs text-text-muted">No mastery data.</p> : data.mastery.map((m) => (
                <div key={m.topic} className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-text-secondary w-32 truncate">{m.topic}</span>
                  <div className="flex-1 h-2 bg-bg-elevated rounded-full overflow-hidden"><div className="h-full bg-cyan-400" style={{ width: `${Math.round((Number(m.mastery_level)||0)*100)}%` }} /></div>
                  <span className="text-[11px] text-text-muted w-9 text-right">{Math.round((Number(m.mastery_level)||0)*100)}%</span>
                </div>
              ))}
            </div>
            <div className="bg-bg-surface border border-border-default rounded-2xl p-4">
              <h3 className="text-sm font-bold text-text-secondary mb-2">Recent lessons</h3>
              {(data.lessons || []).length === 0 ? <p className="text-xs text-text-muted">None yet.</p> : (
                <ul className="space-y-1">{data.lessons.map((l, i) => <li key={i} className="flex justify-between text-xs"><span className="text-text-secondary">{l.lesson_id}</span><span className="text-text-muted">+{l.xp_awarded||0} XP</span></li>)}</ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

Ensure `getAdminUserViewAs` and `safeErrorMsg` are imported in `SuperAdmin.jsx`.

- [ ] **Step 2: Verify**

Run from `frontend/`: `npx eslint src/pages/SuperAdmin.jsx`
Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/SuperAdmin.jsx
git commit -m "feat(admin-ui): read-only view-as panel"
```

---

## Task 10: Admins tab

**Files:** Modify `frontend/src/pages/SuperAdmin.jsx`

- [ ] **Step 1: Add the tab + content**

Add `{ k: 'admins', label: 'Admins', icon: Shield }` to the `TABS` array (import `Shield` from lucide-react if not already). Add state `const [admins, setAdmins] = useState(null);` and a loader that reuses `getAdminUsers` filtered client-side, plus a promote search. Implement the tab body:

```jsx
{tab === 'admins' && (
  <div className="space-y-4">
    <p className="text-sm text-text-muted">Super-admins have full platform control. Env break-glass admins are always active and can't be removed here.</p>
    <AdminPromote adminId={user.id} onChanged={() => { setUsers(null); setAdmins(null); }} />
    <AdminsList adminId={user.id} />
  </div>
)}
```

And define the two small components in-file:

```jsx
function AdminsList({ adminId }) {
  const [rows, setRows] = useState(null);
  const reload = useCallback(() => { getAdminUsers(adminId, '', 200, 0).then((r) => setRows((r.data.users || []).filter(u => u.is_super_admin))); }, [adminId]);
  useEffect(() => { reload(); }, [reload]);
  if (rows === null) return <div className="h-16 rounded-xl bg-bg-elevated animate-pulse" />;
  if (!rows.length) return <p className="text-sm text-text-muted">Only env break-glass admins exist. Promote someone below.</p>;
  return (
    <div className="bg-bg-surface border border-border-default rounded-2xl divide-y divide-border-default">
      {rows.map((u) => (
        <div key={u.id} className="flex items-center justify-between p-3">
          <span className="text-sm text-text-primary">{u.name || u.username} <span className="text-text-muted text-xs">@{u.username}</span></span>
          <button onClick={() => adminSetSuperAdmin(adminId, u.id, false).then(reload).catch(()=>{})} className="text-xs text-red-500 font-bold">Demote</button>
        </div>
      ))}
    </div>
  );
}

function AdminPromote({ adminId, onChanged }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState([]); const [msg, setMsg] = useState('');
  const search = (e) => { e.preventDefault(); if (!q.trim()) return; getAdminUsers(adminId, q.trim(), 10, 0).then((r) => setRes(r.data.users || [])); };
  const promote = (u) => adminSetSuperAdmin(adminId, u.id, true).then(() => { setMsg(`Promoted ${u.username}`); setRes([]); setQ(''); onChanged?.(); }).catch(()=>setMsg('Failed'));
  return (
    <div className="bg-bg-surface border border-border-default rounded-2xl p-4 space-y-2">
      <form onSubmit={search} className="flex gap-2"><input className="input-neo flex-1 py-2 text-sm" placeholder="Search user to promote…" value={q} onChange={(e)=>setQ(e.target.value)} /><button className="btn-neo btn-neo-primary py-2 px-4 text-sm">Search</button></form>
      {res.map((u) => <div key={u.id} className="flex items-center justify-between text-sm"><span>{u.name || u.username} <span className="text-text-muted text-xs">@{u.username}</span></span><button onClick={()=>promote(u)} className="text-xs text-cyan-600 font-bold">Make admin</button></div>)}
      {msg ? <p className="text-xs text-green-600">{msg}</p> : null}
    </div>
  );
}
```

Ensure `getAdminUsers`, `adminSetSuperAdmin`, `useCallback` are imported.

- [ ] **Step 2: Verify** — `npx eslint src/pages/SuperAdmin.jsx` (no new errors).
- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/SuperAdmin.jsx
git commit -m "feat(admin-ui): Admins tab (promote/demote)"
```

---

## Task 11: `OrgAdminDrawer` + Orgs-tab wiring

**Files:** Create `frontend/src/components/OrgAdminDrawer.jsx`; Modify `frontend/src/pages/SuperAdmin.jsx`

- [ ] **Step 1: Create the component** (mirror UserAdminDrawer's shell)

```jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { X } from 'lucide-react';
import { getAdminOrgDetail, adminSetOrgPlan, adminSetOrgType, adminDeleteOrg } from '../api';
import { safeErrorMsg } from '../utils/errorUtils';

const PLANS = ['free', 'pro', 'enterprise'];
const TYPES = ['school', 'university', 'enterprise', 'other'];

export default function OrgAdminDrawer({ adminId, orgId, onClose, onChanged }) {
  const reduced = useReducedMotion();
  const [d, setD] = useState(null); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(''); const [confirmDel, setConfirmDel] = useState('');
  const panelRef = useRef(null);
  const load = useCallback(() => { setLoading(true); getAdminOrgDetail(adminId, orgId).then((r)=>setD(r.data)).catch((e)=>setError(safeErrorMsg(e,'Failed'))).finally(()=>setLoading(false)); }, [adminId, orgId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const prev = document.activeElement; panelRef.current?.focus(); return () => { try { prev?.focus?.(); } catch { /* gone */ } }; }, []);
  useEffect(() => { const k = (e)=>{ if (e.key==='Escape') onClose(); }; document.addEventListener('keydown', k); return ()=>document.removeEventListener('keydown', k); }, [onClose]);
  const act = async (key, fn) => { setBusy(key); setError(''); try { await fn(); onChanged?.(); load(); } catch (e) { setError(safeErrorMsg(e,'Failed')); } finally { setBusy(''); } };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}>
        <motion.aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Organization admin" onClick={(e)=>e.stopPropagation()}
          initial={reduced?false:{x:'100%'}} animate={reduced?false:{x:0}} exit={reduced?undefined:{x:'100%'}} transition={{type:'spring',stiffness:400,damping:40}}
          className="w-full max-w-md h-full overflow-y-auto bg-bg-surface border-l border-border-default shadow-2xl focus:outline-none">
          {loading ? <div className="p-6"><div className="h-24 rounded-xl bg-bg-elevated animate-pulse" /></div> : d ? (
            <div>
              <div className="p-5 border-b border-border-default flex items-start justify-between">
                <div><h2 className="text-lg font-bold text-text-primary">{d.name}</h2><p className="text-xs text-text-muted">{d.member_count} members · {d.type} · {d.plan}</p></div>
                <button onClick={onClose} aria-label="Close" className="text-text-muted p-1"><X size={18} /></button>
              </div>
              {error ? <div className="px-5 py-2 text-xs text-red-500">{error}</div> : null}
              <div className="p-5 border-b border-border-default grid grid-cols-2 gap-2">
                <select disabled={busy==='plan'} value={d.plan} onChange={(e)=>act('plan',()=>adminSetOrgPlan(adminId,orgId,e.target.value))} className="input-neo py-2 text-sm">{PLANS.map(p=><option key={p} value={p}>{p}</option>)}</select>
                <select disabled={busy==='type'} value={d.type} onChange={(e)=>act('type',()=>adminSetOrgType(adminId,orgId,e.target.value))} className="input-neo py-2 text-sm">{TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>
                <div className="col-span-2">
                  {confirmDel === d.name ? (
                    <button disabled={busy==='del'} onClick={()=>act('del',()=>adminDeleteOrg(adminId,orgId)).then(()=>onClose())} className="w-full py-2 text-sm font-bold text-white bg-red-500 rounded-xl">Confirm delete org</button>
                  ) : <input className="input-neo w-full py-2 text-sm" placeholder={`Type "${d.name}" to delete`} value={confirmDel} onChange={(e)=>setConfirmDel(e.target.value)} />}
                </div>
              </div>
              <div className="p-5">
                <h3 className="text-sm font-bold text-text-secondary mb-2">Members</h3>
                <ul className="space-y-1">{(d.members||[]).map((m)=><li key={m.id} className="flex justify-between text-xs"><span className="text-text-secondary">{m.name}</span><span className="text-text-muted">{m.role}</span></li>)}</ul>
              </div>
            </div>
          ) : <div className="p-6 text-sm text-red-500">{error || 'Not found'}</div>}
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Wire into the Orgs tab** — import `OrgAdminDrawer`, add `const [openOrgId, setOpenOrgId] = useState(null);`, make org rows `onClick={() => setOpenOrgId(o.id)} className="... cursor-pointer"`, and render `{openOrgId && <OrgAdminDrawer adminId={user.id} orgId={openOrgId} onClose={()=>setOpenOrgId(null)} onChanged={loadOrgs} />}`.

- [ ] **Step 3: Verify** — `npx eslint src/components/OrgAdminDrawer.jsx src/pages/SuperAdmin.jsx` (no new errors).
- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/OrgAdminDrawer.jsx frontend/src/pages/SuperAdmin.jsx
git commit -m "feat(admin-ui): org admin drawer + Orgs wiring"
```

---

## Task 12: Audit tab

**Files:** Modify `frontend/src/pages/SuperAdmin.jsx`

- [ ] **Step 1: Add the tab**

Add `{ k: 'audit', label: 'Audit', icon: Activity }` to `TABS` (import `Activity` if needed — it's already imported per the existing file). Add state `const [audit, setAudit] = useState(null);` and a loader `useEffect(() => { if (tab==='audit' && audit===null) getAdminAudit(user.id, { limit: 100 }).then((r)=>setAudit(r.data.audit)); }, [tab, audit, user.id]);`. Body:

```jsx
{tab === 'audit' && (
  <div className="bg-bg-surface border border-border-default rounded-2xl overflow-hidden">
    {audit === null ? <div className="p-6"><div className="h-10 bg-bg-elevated animate-pulse rounded" /></div> : audit.length === 0 ? <div className="p-6 text-sm text-text-muted">No admin actions yet.</div> : (
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-text-muted border-b border-border-default"><th className="px-4 py-3">When</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Detail</th></tr></thead>
        <tbody className="divide-y divide-border-default">
          {audit.map((a) => (
            <tr key={a.id} className="hover:bg-bg-elevated/50">
              <td className="px-4 py-2 text-text-muted">{relTimeSA(a.created_at)}</td>
              <td className="px-4 py-2 text-text-secondary">{a.actor_name}</td>
              <td className="px-4 py-2"><span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-bg-elevated text-text-secondary">{a.action}</span></td>
              <td className="px-4 py-2 text-text-muted">{a.target_type ? `${a.target_type}:${String(a.target_id).slice(0,8)}` : '—'}</td>
              <td className="px-4 py-2 text-text-muted truncate max-w-[200px]">{a.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
)}
```

Add a small `relTimeSA` helper near the top of the file (or reuse one already present): same body as the `relTime` in UserAdminDrawer. Import `getAdminAudit`.

- [ ] **Step 2: Verify** — `npx eslint src/pages/SuperAdmin.jsx` (no new errors).
- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/SuperAdmin.jsx
git commit -m "feat(admin-ui): Audit tab"
```

---

## Task 13: Polish + full build

**Files:** Modify `frontend/src/pages/SuperAdmin.jsx` and the two drawers as needed.

- [ ] **Step 1: Cross-check** — dark-mode token parity (all surfaces use `bg-bg-*`/`text-text-*`/`border-border-*`), skeletons present on drawer/tab loads, empty/error states present, every destructive action behind a typed confirm, row-level interactive controls call `e.stopPropagation()` so row-click vs control-click don't conflict.
- [ ] **Step 2: Full build**

Run from `frontend/`: `npm run build`
Expected: `✓ built` with no errors.

- [ ] **Step 3: Commit any fixes**

```bash
git add frontend/src/pages/SuperAdmin.jsx frontend/src/components/UserAdminDrawer.jsx frontend/src/components/OrgAdminDrawer.jsx
git commit -m "polish(admin-ui): dark-mode/a11y/skeletons/confirms pass"
```

---

## Task 14: Live user-testing pass + deploy

**Files:** none (verification + deploy)

- [ ] **Step 1: Merge to main + deploy**

```bash
git checkout main
git merge feat/superadmin-controls
git push origin main
```
Watch the deploy: `gh run watch $(gh run list --limit 1 --json databaseId -q '.[0].databaseId') --exit-status`. Expected: `success`.

- [ ] **Step 2: Run the spec §8 live flows** against the deployed app, signed in as super-admin, using a **throwaway test user + test org**:
  1. Promote test-user → (after their re-login) they get the Super Admin nav; demote → it's gone.
  2. Attempt demote/delete of `muthu@pymasters.net` → blocked; shows `env · locked`.
  3. Edit a user to add an email; Reset Password sends a link; confirm Reset disabled when no email.
  4. Revoke a test-user's sessions → their next action returns 401 / forces re-login.
  5. Delete the test-user (typed confirm) → gone; self-delete blocked.
  6. Change a test-org's plan + type; delete it (typed confirm).
  7. View-as a user → read-only snapshot under banner; Exit returns; no write controls reachable.
  8. Audit tab records every action with correct actor/target/time.
  9. Drawers keyboard-operable (ESC, focus-return) + correct in dark mode.

- [ ] **Step 3:** If all pass, the feature is done. If any fails, file the specific gap and fix via a follow-up task (return to the relevant task above).

---

## Self-Review (completed by author)

- **Spec coverage:** schema (T1) · auth tv/revocation (T2) · roles+break-glass+audit helper+block/plan audit (T3) · user detail+view-as (T4) · user edit/delete/super-admin/role/reset/revoke (T5) · org detail/plan/type/delete + audit list (T6) · api client (T7) · UserAdminDrawer+Users (T8) · view-as panel (T9) · Admins tab (T10) · OrgAdminDrawer+Orgs (T11) · Audit tab (T12) · polish (T13) · live test + deploy (T14). All §3–§8 mapped.
- **Type/name consistency:** client fns (`getAdminUserDetail`, `adminSetSuperAdmin(userId,targetId,value)`, `adminSetUserRole(userId,targetId,org_id,role)`, etc.) match their usage in T8/T10/T11/T12; backend routes match the client paths; `break_glass`/`has_email`/`is_super_admin`/`token_version` field names consistent backend⇄drawer; audit `action` strings consistent.
- **Placeholders:** none — the one reuse-the-existing-sender note (T5 reset-password) gives an explicit grep + a concrete fallback (replicate token-create + email-send), not a TODO.
- **Risk note:** T2 adds a per-request DB read to token verification — intended trade for revocable sessions; fine on single-instance SQLite.
