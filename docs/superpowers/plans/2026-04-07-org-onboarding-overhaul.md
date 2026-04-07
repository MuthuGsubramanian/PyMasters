# Org/School Onboarding & Nav Visibility Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Differentiate org admin onboarding from individual onboarding, restrict Organization nav to admin roles, add org deletion, and add bulk file import for member invites.

**Architecture:** Add `account_type` column to `users` table. Branch onboarding UI and backend storage by account type. Org answers go to new `org_profiles` table. Nav visibility checks `activeOrg.role`. Delete org endpoint cascades to members/invites/profiles. File upload parses CSV/XLSX/TXT client-side and feeds existing bulk invite API.

**Tech Stack:** FastAPI + SQLite (backend), React + Tailwind (frontend), `xlsx` npm package (Excel parsing)

---

## File Structure

```
backend/
├── main.py                        — Add account_type column migration, org_profiles table creation
├── routes/profile.py              — Branch onboarding by account_type, org admin deletion guard
├── routes/organizations.py        — Add DELETE /api/org/{org_id} endpoint
├── vaathiyaar/profiler.py         — Add save_org_onboarding function

frontend/
├── src/api.js                     — Add registerUser account_type param, deleteOrg function
├── src/context/AuthContext.jsx     — No changes needed (account_type auto-persisted via login/updateUser)
├── src/pages/Login.jsx            — Pass account_type to register call
├── src/pages/Onboarding.jsx       — Add ORG_QUESTIONS, branch on user.account_type
├── src/components/Layout.jsx      — Add role check for Organization nav visibility
├── src/pages/OrgDashboard.jsx     — Add invite prompt card, file upload, delete org modal
├── package.json                   — Add xlsx dependency
```

---

## Task 1: Backend — Add account_type Column and org_profiles Table

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add account_type column migration**

In `init_db()`, after the existing column migrations (after line 143 — the avatar_url migration), add:

```python
        if 'account_type' not in col_names:
            print("Migrating DB: Adding account_type column")
            cursor.execute("ALTER TABLE users ADD COLUMN account_type TEXT DEFAULT 'individual'")
```

- [ ] **Step 2: Create org_profiles table**

After the organizations table creation block (after line 525 — the org indexes), add:

```python
        # ── Org profiles (onboarding answers for org admins) ──────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS org_profiles (
                org_id TEXT PRIMARY KEY,
                org_size TEXT DEFAULT '',
                learner_profile TEXT DEFAULT '',
                skill_level TEXT DEFAULT '',
                learning_focus TEXT DEFAULT '',
                structure_preference TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
```

- [ ] **Step 3: Update UserRegister model to accept account_type**

In `main.py` line 604, update the model:

```python
class UserRegister(BaseModel):
    username: str
    password: str
    name: Optional[str] = "Learner"
    account_type: Optional[str] = "individual"
```

- [ ] **Step 4: Update register endpoint to store and return account_type**

In the register function (line 631), update the INSERT and return:

```python
@app.post("/api/auth/register")
def register(user: UserRegister):
    print(f"Register request for: {user.username}")
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = ?", [user.username])
        existing = cursor.fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")

        user_id = str(uuid.uuid4())
        hashed = hash_pw(user.password)
        default_unlocks = json.dumps(["module_1"])
        account_type = user.account_type if user.account_type in ("individual", "organization") else "individual"

        cursor.execute(
            "INSERT INTO users (id, username, password_hash, name, created_at, points, unlocked_modules, preferred_language, onboarding_completed, account_type) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 50, ?, 'en', 0, ?)",
            [user_id, user.username, hashed, user.name, default_unlocks, account_type]
        )
        conn.commit()
        return {
            "id": user_id, "username": user.username, "name": user.name,
            "points": 50, "unlocked": ["module_1"], "onboarding_completed": False,
            "account_type": account_type,
        }
    finally:
        conn.close()
```

- [ ] **Step 5: Update login endpoint to return account_type**

In the login function (line 655), update the SELECT and return:

```python
@app.post("/api/auth/login")
def login(user: UserLogin):
    print(f"Login request for: {user.username}")
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        hashed = hash_pw(user.password)
        cursor.execute(
            "SELECT id, name, points, unlocked_modules, onboarding_completed, account_type FROM users WHERE username = ? AND password_hash = ?",
            [user.username, hashed]
        )
        record = cursor.fetchone()

        if not record:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        # Check org membership
        org_row = cursor.execute("""
            SELECT o.id, o.name, o.type, om.role, om.department
            FROM org_members om JOIN organizations o ON o.id = om.org_id
            WHERE om.user_id = ?
            LIMIT 1
        """, [record[0]]).fetchone()

        org_info = None
        if org_row:
            org_info = {
                "id": org_row[0], "org_id": org_row[0],
                "name": org_row[1], "org_name": org_row[1],
                "type": org_row[2], "org_type": org_row[2],
                "role": org_row[3],
                "department": org_row[4] or ""
            }

        unlocks = json.loads(record[3]) if record[3] else ["module_1"]
        return {
            "id": record[0],
            "name": record[1],
            "username": user.username,
            "points": record[2] or 0,
            "unlocked": unlocks,
            "onboarding_completed": bool(record[4]),
            "account_type": record[5] or "individual",
            "token": f"mock-jwt-{record[0]}",
            "org": org_info
        }
    finally:
        conn.close()
```

- [ ] **Step 6: Verify backend starts**

Run: `cd backend && python -c "from main import init_db; init_db(); print('OK')"`
Expected: OK (no errors)

- [ ] **Step 7: Commit**

```bash
git add backend/main.py
git commit -m "feat: add account_type column and org_profiles table"
```

---

## Task 2: Backend — Branch Onboarding Endpoint + Org Admin Deletion Guard

**Files:**
- Modify: `backend/routes/profile.py`
- Modify: `backend/vaathiyaar/profiler.py`

- [ ] **Step 1: Add OrgOnboardingData model to profile.py**

After the existing `OnboardingData` model (line 41), add:

```python
class OrgOnboardingData(BaseModel):
    user_id: str
    preferred_language: str
    org_size: str
    learner_profile: str
    skill_level: str
    learning_focus: str
    structure_preference: str
```

- [ ] **Step 2: Add org onboarding endpoint**

After the existing `/onboarding` route (line 83), add:

```python
@router.post("/onboarding/org")
def org_onboarding(data: OrgOnboardingData):
    """
    Save org-focused onboarding for an organization admin.
    Stores org profile data and marks the admin's onboarding as complete.
    """
    if data.preferred_language.lower() in BLOCKED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail="Hindi is not supported on PyMasters. Please choose another language.",
        )

    conn = _get_conn()
    try:
        cursor = conn.cursor()

        # Find the user's org
        cursor.execute(
            "SELECT org_id FROM org_members WHERE user_id = ? AND role IN ('super_admin', 'admin') LIMIT 1",
            [data.user_id]
        )
        org_row = cursor.fetchone()
        if not org_row:
            raise HTTPException(status_code=400, detail="User is not an org admin")

        org_id = org_row["org_id"]

        # Upsert org_profiles
        cursor.execute("""
            INSERT INTO org_profiles (org_id, org_size, learner_profile, skill_level, learning_focus, structure_preference)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (org_id) DO UPDATE SET
                org_size = excluded.org_size,
                learner_profile = excluded.learner_profile,
                skill_level = excluded.skill_level,
                learning_focus = excluded.learning_focus,
                structure_preference = excluded.structure_preference
        """, [org_id, data.org_size, data.learner_profile, data.skill_level, data.learning_focus, data.structure_preference])

        # Update user's preferred_language and mark onboarding complete
        cursor.execute(
            "UPDATE users SET preferred_language = ?, onboarding_completed = 1 WHERE id = ?",
            [data.preferred_language, data.user_id]
        )

        # Also create/update user_profiles entry to mark onboarding_completed
        cursor.execute("""
            INSERT INTO user_profiles (user_id, preferred_language, onboarding_completed)
            VALUES (?, ?, 1)
            ON CONFLICT (user_id) DO UPDATE SET
                preferred_language = excluded.preferred_language,
                onboarding_completed = 1
        """, [data.user_id, data.preferred_language])

        conn.commit()
        return {"onboarding_completed": True, "user_id": data.user_id}
    finally:
        conn.close()
```

- [ ] **Step 3: Add org admin deletion guard to delete_account**

In the `delete_account` function (line 195), after the "Verify user exists" check (line 207), add the guard:

```python
        # Guard: don't allow deletion if user is sole super_admin of any org
        cursor.execute("""
            SELECT om.org_id, o.name
            FROM org_members om
            JOIN organizations o ON o.id = om.org_id
            WHERE om.user_id = ? AND om.role = 'super_admin'
        """, [user_id])
        admin_orgs = cursor.fetchall()

        for org in admin_orgs:
            # Check if there are other super_admins
            cursor.execute(
                "SELECT COUNT(*) FROM org_members WHERE org_id = ? AND role = 'super_admin' AND user_id != ?",
                [org["org_id"], user_id]
            )
            other_admins = cursor.fetchone()[0]
            if other_admins == 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"You are the only super admin of '{org['name']}'. Transfer ownership or delete the organization first."
                )
```

Also add `org_invites` to the related_tables cleanup list. After the existing `("org_members", "user_id")` entry in the list, add:

```python
            ("org_invites", "invited_by"),
```

Wait — `invited_by` stores user_id of who sent the invite. This is the correct column to clean up invites created by the deleted user. But we should NOT delete invites where the user was merely the subject. The existing `org_members` cleanup already removes membership.

- [ ] **Step 4: Verify backend starts**

Run: `cd backend && python -c "from main import app; print('Routes OK')"`
Expected: Routes OK

- [ ] **Step 5: Commit**

```bash
git add backend/routes/profile.py
git commit -m "feat: add org onboarding endpoint and deletion guard"
```

---

## Task 3: Backend — Add Delete Organization Endpoint

**Files:**
- Modify: `backend/routes/organizations.py`

- [ ] **Step 1: Add the DELETE endpoint**

At the end of `organizations.py`, add:

```python
@router.delete("/{org_id}")
def delete_organization(org_id: str, user_id: str = None):
    """
    Permanently delete an organization and all associated data.
    Requires super_admin role. Member user accounts are preserved.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    conn = _get_conn()
    try:
        cursor = conn.cursor()

        # Verify org exists
        cursor.execute("SELECT id, name FROM organizations WHERE id = ?", [org_id])
        org = cursor.fetchone()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

        # Verify user is super_admin
        cursor.execute(
            "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
            [org_id, user_id]
        )
        member = cursor.fetchone()
        if not member or member["role"] != "super_admin":
            raise HTTPException(status_code=403, detail="Only super admins can delete an organization")

        # Delete all associated data
        cursor.execute("DELETE FROM org_members WHERE org_id = ?", [org_id])
        cursor.execute("DELETE FROM org_invites WHERE org_id = ?", [org_id])

        # Delete org_profiles (may not exist if onboarding wasn't completed)
        try:
            cursor.execute("DELETE FROM org_profiles WHERE org_id = ?", [org_id])
        except Exception:
            pass

        # Delete the organization itself
        cursor.execute("DELETE FROM organizations WHERE id = ?", [org_id])

        conn.commit()
        return {"deleted": True, "org_id": org_id}
    finally:
        conn.close()
```

Note: This uses the same `_get_conn()` helper already defined in the file. Verify the function exists by reading the file.

- [ ] **Step 2: Verify the _get_conn helper exists**

Search `organizations.py` for `def _get_conn`. If it doesn't exist, add it:

```python
def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/organizations.py
git commit -m "feat: add DELETE /api/org/{org_id} endpoint"
```

---

## Task 4: Frontend — Update API Layer and Login

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/pages/Login.jsx`

- [ ] **Step 1: Update registerUser to accept account_type**

In `api.js` line 66, change:

```javascript
export const registerUser = (username, password, name, account_type = 'individual') =>
    api.post('/auth/register', { username, password, name, account_type });
```

- [ ] **Step 2: Add deleteOrg and saveOrgOnboarding API functions**

After the existing org functions (around line 146), add:

```javascript
export const deleteOrg = (orgId, userId) =>
    api.delete(`/org/${orgId}`, { params: { user_id: userId } });
export const saveOrgOnboarding = (data) => api.post('/profile/onboarding/org', data);
```

- [ ] **Step 3: Update Login.jsx to pass account_type**

In `Login.jsx`, in the `handleSubmit` function (around line 41), change the register call:

```javascript
const res = await registerUser(username, password, username, accountType === 'organization' ? 'organization' : 'individual');
```

The variable `accountType` already exists in the component state (line 21: `const [accountType, setAccountType] = useState(null)`).

- [ ] **Step 4: Store account_type from register response**

After the register call (around line 43), ensure account_type is on the data object:

```javascript
if (!data.token) data.token = `mock-jwt-${data.id}`;
if (!data.account_type) data.account_type = accountType === 'organization' ? 'organization' : 'individual';
isNewUser = true;
```

- [ ] **Step 5: Verify frontend build**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api.js frontend/src/pages/Login.jsx
git commit -m "feat: pass account_type through register flow"
```

---

## Task 5: Frontend — Org Admin Onboarding Questions in Onboarding.jsx

**Files:**
- Modify: `frontend/src/pages/Onboarding.jsx`

This is the core UI change. The Onboarding page needs to show different questions based on `user.account_type`.

- [ ] **Step 1: Add ORG_QUESTIONS array**

After the existing `QUESTIONS` array (after line 115), add:

```javascript
const ORG_QUESTIONS = [
    {
        key: 'preferred_language',
        type: 'language',
        text: "First things first — which language should the platform use for your organization? 🌐",
    },
    {
        key: 'org_size',
        type: 'choice',
        text: "How many learners will use PyMasters? 👥",
        options: [
            { value: '1-10',   label: '👤 1-10 learners' },
            { value: '11-50',  label: '👥 11-50 learners' },
            { value: '51-200', label: '🏫 51-200 learners' },
            { value: '200+',   label: '🏢 200+ learners' },
        ],
    },
    {
        key: 'learner_profile',
        type: 'choice',
        text: "Who are your learners? 🎓",
        options: [
            { value: 'k12',          label: '🏫 K-12 Students' },
            { value: 'university',   label: '🎓 University Students' },
            { value: 'professional', label: '💼 Working Professionals' },
            { value: 'mixed',        label: '🌍 Mixed Group' },
        ],
    },
    {
        key: 'skill_level',
        type: 'choice',
        text: "What's their current Python level? 📊",
        options: [
            { value: 'beginner', label: '🌱 Complete Beginners' },
            { value: 'some',     label: '📝 Some Experience' },
            { value: 'mixed',    label: '🔀 Mixed Levels' },
        ],
    },
    {
        key: 'learning_focus',
        type: 'choice',
        text: "What should they learn? 🎯",
        options: [
            { value: 'fundamentals',  label: '🐍 Python Fundamentals' },
            { value: 'ai_ml',         label: '🤖 AI & Machine Learning' },
            { value: 'web',           label: '🌐 Web Development' },
            { value: 'data_science',  label: '📊 Data Science' },
            { value: 'mixed',         label: '🎯 Mixed / All Topics' },
        ],
    },
    {
        key: 'structure_preference',
        type: 'choice',
        text: "How do you want to manage learning? 📋",
        options: [
            { value: 'assigned',    label: '📋 Assign Specific Paths' },
            { value: 'free_choice', label: '🆓 Let Learners Choose' },
            { value: 'mix',         label: '🔀 Mix of Both' },
        ],
    },
];
```

- [ ] **Step 2: Add ORG_REACTIONS map**

After the existing `REACTIONS` object (after line 164), add:

```javascript
const ORG_REACTIONS = {
    '1-10':        "A focused group! You'll be able to give everyone personal attention. 👤",
    '11-50':       "Nice team size! Big enough for group dynamics, small enough to track everyone. 👥",
    '51-200':      "A proper classroom! The analytics dashboard will be your best friend. 🏫",
    '200+':        "An enterprise operation! We'll make sure the platform scales for your needs. 🏢",
    k12:           "Young minds! I love it. We'll keep things visual and engaging. 🏫",
    university:    "University students — they'll appreciate the depth we go into. 🎓",
    professional:  "Working professionals — practical, job-relevant content is the priority. 💼",
    mixed:         "A diverse group! We'll make sure everyone finds their level. 🌍",
    beginner:      "Starting from scratch — we'll build a strong foundation. 🌱",
    some:          "Some experience — we can skip the absolute basics and accelerate. 📝",
    fundamentals:  "Core Python — the foundation everything else is built on. 🐍",
    ai_ml:         "AI & ML — the hottest field in tech right now. Great choice! 🤖",
    web:           "Web development — Flask, FastAPI, and beyond. 🌐",
    data_science:  "Data science — pandas, numpy, and the power of data. 📊",
    assigned:      "Structured paths — great for consistency across your team. 📋",
    free_choice:   "Learner autonomy — motivated learners thrive with choice. 🆓",
    mix:           "Best of both worlds — structure where needed, freedom where possible. 🔀",
};
```

- [ ] **Step 3: Modify the main Onboarding component to branch on account_type**

In the `Onboarding` component (line 402), update the logic:

After `const username = ...` (line 409), add:

```javascript
    const isOrg = user?.account_type === 'organization';
    const questions = isOrg ? ORG_QUESTIONS : QUESTIONS;
    const reactions = isOrg ? ORG_REACTIONS : REACTIONS;
```

Update the greeting (line 410-412):

```javascript
    const greeting = isOrg
        ? (username
            ? `Vanakkam, ${username}! 🙏 I'm Vaathiyaar. Let's set up your organization's learning environment. A few quick questions!`
            : "Vanakkam! 🙏 I'm Vaathiyaar. Let's set up your organization's learning environment. A few quick questions!")
        : (username
            ? `Vanakkam, ${username}! 🙏 I'm Vaathiyaar — your personal Python guide. Before we dive in, I'd love to get to know you a little. Ready?`
            : "Vanakkam! 🙏 I'm Vaathiyaar — your personal Python guide. Before we dive in, I'd love to get to know you a little. Ready?");
```

Update the initial messages to use `questions[0]` instead of `QUESTIONS[0]`:

```javascript
    const [messages, setMessages] = useState([
        makeMsg('vaathiyaar', greeting),
        makeMsg('vaathiyaar', questions[0].text, { questionIndex: 0 }),
    ]);
```

- [ ] **Step 4: Update handleAnswer to use the questions/reactions variables**

In `handleAnswer` (line 430), replace all `QUESTIONS[currentStep]` with `questions[currentStep]` and `QUESTIONS[nextStep]` with `questions[nextStep]`. Replace `QUESTIONS.length` with `questions.length`.

For reactions, replace the reaction lookup:

```javascript
        if (question.type !== 'contact') {
            const nestedReaction = reactions[question.key]?.[option.value];
            const reaction = nestedReaction || reactions[option.value] || "Noted! Let's keep going. 😊";
            await delay(400);
            addMsg(makeMsg('vaathiyaar', reaction));
        }
```

- [ ] **Step 5: Update the submission block to branch by account type**

In the "All answered — submit" block (line 478-531), replace:

```javascript
        } else {
            // All answered — submit
            await delay(800);
            try {
                if (isOrg) {
                    // Org admin: save org onboarding
                    const { saveOrgOnboarding } = await import('../api');
                    await saveOrgOnboarding({
                        user_id: user?.id,
                        preferred_language: newAnswers.preferred_language || 'en',
                        org_size: newAnswers.org_size || '',
                        learner_profile: newAnswers.learner_profile || '',
                        skill_level: newAnswers.skill_level || '',
                        learning_focus: newAnswers.learning_focus || '',
                        structure_preference: newAnswers.structure_preference || '',
                    });
                } else {
                    // Individual: save personal onboarding (existing flow)
                    await api.post('/profile/onboarding', {
                        user_id: user?.id,
                        ...newAnswers,
                        linkedin_url: newAnswers.linkedin_url || undefined,
                        github_url: newAnswers.github_url || undefined,
                    });
                }
            } catch (err) {
                console.error('Onboarding submit failed:', err);
            }

            // Mark onboarding complete in local user state
            updateUser({ onboarding_completed: true, preferred_language: newAnswers.preferred_language || 'en' });

            if (isOrg) {
                // Org admins land on org dashboard
                addMsg(makeMsg('vaathiyaar', username
                    ? `${username}, your organization is all set! Let's get your team onboard. 🚀`
                    : "Your organization is all set! Let's get your team onboard. 🚀"
                ));
                setDone(true);
                setBusy(false);
                await delay(1500);
                navigate('/dashboard/org');
            } else {
                // Individual: existing path recommendation flow
                let recommendedPath = null;
                try {
                    const recRes = await api.get(`/paths/recommend?user_id=${user?.id}`);
                    recommendedPath = recRes.data;
                } catch (e) {
                    console.log('Path recommendation not available:', e);
                }

                if (recommendedPath && recommendedPath.id) {
                    addMsg(makeMsg('vaathiyaar', username
                        ? `${username}, based on everything you told me, I've found the perfect learning path for you! 🎯`
                        : "Based on everything you told me, I've found the perfect learning path for you! 🎯"
                    ));
                    await delay(600);
                    const lessons = recommendedPath.lesson_sequence
                        ? JSON.parse(recommendedPath.lesson_sequence).length
                        : '?';
                    addMsg(makeMsg('vaathiyaar',
                        `**${recommendedPath.name}**\n\n${recommendedPath.description || ''}\n\n` +
                        `📚 ${lessons} lessons · ⏱️ ~${recommendedPath.estimated_hours || '?'} hours · ` +
                        `${recommendedPath.difficulty_start} → ${recommendedPath.difficulty_end}`,
                        { isPathRecommendation: true, pathId: recommendedPath.id }
                    ));
                    setDone(true);
                    setBusy(false);
                } else {
                    addMsg(makeMsg('vaathiyaar', username
                        ? `${username}, you're all set! Let's begin your Python journey! 🚀`
                        : "You're all set! Let's begin your Python journey! 🚀"
                    ));
                    setDone(true);
                    setBusy(false);
                    await delay(1500);
                    navigate('/dashboard/classroom');
                }
            }
        }
```

- [ ] **Step 6: Update the ProgressDots total and active question rendering**

In the `ProgressDots` component usage and the question widget rendering at the bottom of the JSX, replace `QUESTIONS` with `questions`:

All occurrences of `QUESTIONS[msg.questionIndex]` → `questions[msg.questionIndex]`
All occurrences of `QUESTIONS.length` → `questions.length` (used in ProgressDots total)

- [ ] **Step 7: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Onboarding.jsx
git commit -m "feat: branch onboarding by account type — org admin gets 6 org-focused questions"
```

---

## Task 6: Frontend — Nav Visibility Role Check

**Files:**
- Modify: `frontend/src/components/Layout.jsx`

- [ ] **Step 1: Update the Organization nav item condition**

In Layout.jsx, find the conditional that adds the Organization nav item (currently `if (activeOrg)`). Change to:

```javascript
        if (activeOrg && (activeOrg.role === 'super_admin' || activeOrg.role === 'admin')) {
            items.push({ icon: Building2, label: 'Organization', path: '/dashboard/org', desc: 'Manage your org' });
        }
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Layout.jsx
git commit -m "feat: restrict Organization nav to admin/super_admin roles"
```

---

## Task 7: Frontend — Invite Prompt Card + File Upload + Delete Org on OrgDashboard

**Files:**
- Modify: `frontend/src/pages/OrgDashboard.jsx`
- Modify: `frontend/package.json`

This is the largest frontend task. It adds three features to OrgDashboard:
1. An invite prompt card (shown when org has only the admin)
2. File upload for bulk email import (.csv, .xlsx, .txt)
3. A delete organization button with confirmation modal

- [ ] **Step 1: Install xlsx package**

Run: `cd frontend && npm install xlsx`

- [ ] **Step 2: Add imports at the top of OrgDashboard.jsx**

Add to the existing import block:

```javascript
import { read, utils } from 'xlsx';
import { deleteOrg } from '../api';
```

- [ ] **Step 3: Add InvitePromptCard component**

Before the main `export default function OrgDashboard()`, add a new component:

```javascript
/* ------------------------------------------------------------------ */
/*  Invite Prompt — shown when org has only 1 member                   */
/* ------------------------------------------------------------------ */
function InvitePromptCard({ orgId, userId, onInviteSent }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(`pm_invite_prompt_dismissed_${orgId}`) === '1'; } catch { return false; }
  });

  // File upload state
  const [fileEmails, setFileEmails] = useState([]);
  const [fileRole, setFileRole] = useState('member');
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const fileInputRef = useRef(null);

  if (dismissed) return null;

  const handleSingleInvite = async () => {
    if (!email.trim() || sending) return;
    setSending(true);
    setResult(null);
    try {
      await inviteToOrg(orgId, { email: email.trim(), role, user_id: userId });
      setResult({ ok: true, msg: `Invited ${email.trim()}` });
      setEmail('');
      onInviteSent?.();
    } catch (err) {
      setResult({ ok: false, msg: safeErrorMsg(err, 'Failed to send invite') });
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    const emails = [];

    if (ext === 'xlsx' || ext === 'xls') {
      const data = await file.arrayBuffer();
      const wb = read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json(ws, { header: 1 });
      for (let i = 0; i < rows.length; i++) {
        const cell = String(rows[i]?.[0] || '').trim();
        if (!cell) continue;
        // Skip header row
        if (i === 0 && /^(email|mail|name|e-mail)/i.test(cell)) continue;
        if (cell.includes('@')) emails.push(cell);
      }
    } else {
      // CSV or TXT
      const text = await file.text();
      const lines = text.split(/[\n,;]+/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && trimmed.includes('@')) emails.push(trimmed);
      }
    }

    setFileEmails([...new Set(emails)]); // deduplicate
    setBulkResult(null);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBulkSend = async () => {
    if (fileEmails.length === 0 || bulkSending) return;
    setBulkSending(true);
    setBulkResult(null);
    try {
      const invites = fileEmails.map(em => ({ email: em, role: fileRole }));
      await bulkInviteToOrg(orgId, { invites, user_id: userId });
      setBulkResult({ ok: true, msg: `Sent ${fileEmails.length} invites` });
      setFileEmails([]);
      onInviteSent?.();
    } catch (err) {
      setBulkResult({ ok: false, msg: safeErrorMsg(err, 'Bulk invite failed') });
    } finally {
      setBulkSending(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(`pm_invite_prompt_dismissed_${orgId}`, '1'); } catch {}
  };

  return (
    <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-border-default rounded-2xl p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-text-primary font-bold text-base flex items-center gap-2">
            <Rocket size={18} className="text-cyan-500" /> Get your team started
          </h3>
          <p className="text-text-muted text-sm mt-1">Invite learners to start their Python journey with your organization.</p>
        </div>
        <button onClick={handleDismiss} className="text-text-muted hover:text-text-secondary p-1" title="Dismiss">
          <X size={16} />
        </button>
      </div>

      {/* Single invite */}
      <div className="flex gap-2 items-center">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="input-neo flex-1 py-2 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && handleSingleInvite()}
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="input-neo w-28 py-2 text-sm">
          <option value="member">Member</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
        <button onClick={handleSingleInvite} disabled={sending || !email.trim()} className="btn-neo btn-neo-primary py-2 px-4 text-sm">
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
      {result && (
        <p className={`text-xs ${result.ok ? 'text-green-600' : 'text-red-500'}`}>{result.msg}</p>
      )}

      {/* File upload */}
      <div className="border-t border-border-default pt-3">
        <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer hover:text-text-secondary transition-colors">
          <Upload size={14} />
          <span>Upload file (.csv, .xlsx, .txt)</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {fileEmails.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary font-medium">{fileEmails.length} emails found</p>
              <select value={fileRole} onChange={(e) => setFileRole(e.target.value)} className="input-neo w-28 py-1 text-xs">
                <option value="member">Member</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="max-h-32 overflow-y-auto bg-bg-inset rounded-lg p-2 text-xs text-text-muted space-y-0.5">
              {fileEmails.map((em, i) => <div key={i}>{em}</div>)}
            </div>
            <div className="flex gap-2">
              <button onClick={handleBulkSend} disabled={bulkSending} className="btn-neo btn-neo-primary py-1.5 px-4 text-xs">
                {bulkSending ? 'Sending...' : `Invite all ${fileEmails.length}`}
              </button>
              <button onClick={() => setFileEmails([])} className="btn-neo btn-neo-ghost py-1.5 px-4 text-xs">
                Clear
              </button>
            </div>
            {bulkResult && (
              <p className={`text-xs ${bulkResult.ok ? 'text-green-600' : 'text-red-500'}`}>{bulkResult.msg}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add DeleteOrgModal component**

After the InvitePromptCard component, add:

```javascript
/* ------------------------------------------------------------------ */
/*  Delete Org Modal                                                    */
/* ------------------------------------------------------------------ */
function DeleteOrgModal({ orgName, orgId, userId, onDeleted, onClose }) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const canDelete = confirmText === orgName;

  const handleDelete = async () => {
    if (!canDelete || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await deleteOrg(orgId, userId);
      onDeleted();
    } catch (err) {
      setError(safeErrorMsg(err, 'Failed to delete organization'));
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-bg-surface border border-border-default rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-text-primary font-bold">Delete Organization</h3>
            <p className="text-text-muted text-xs">This action cannot be undone</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary">
          This will permanently delete <strong>{orgName}</strong>, remove all members, and cancel all pending invites. Member accounts will not be deleted.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs text-text-muted font-medium">Type "{orgName}" to confirm</label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="input-neo py-2 text-sm"
            placeholder={orgName}
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-neo btn-neo-ghost py-2 px-4 text-sm">Cancel</button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="btn-neo py-2 px-4 text-sm font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            {deleting ? 'Deleting...' : 'Delete Organization'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add necessary imports**

Add to the existing lucide-react imports in OrgDashboard.jsx:

```javascript
import { Upload, Rocket, X, Loader2 } from 'lucide-react';
```

Check which of these are already imported and only add the missing ones. `X` and `Loader2` may not be there. `Upload` and `Rocket` are new.

Also add `useRef` to the React import if not already there.

- [ ] **Step 6: Wire InvitePromptCard into the Overview tab**

Inside the main OrgDashboard component, find the Overview tab rendering section. At the top of the Overview tab content (before the stat cards), add:

```javascript
{members.length <= 1 && (
  <InvitePromptCard
    orgId={getOrgId(activeOrg)}
    userId={user?.id}
    onInviteSent={() => loadMembers()}
  />
)}
```

Where `loadMembers` is the existing function that refreshes the member list (find its name in the component).

- [ ] **Step 7: Wire DeleteOrgModal into the Overview tab**

Add state for the delete modal in the main component:

```javascript
const [showDeleteOrg, setShowDeleteOrg] = useState(false);
```

At the bottom of the Overview tab content, add a delete button (visible to super_admins only):

```javascript
{activeOrg?.role === 'super_admin' && (
  <div className="border-t border-border-default pt-4 mt-4">
    <button
      onClick={() => setShowDeleteOrg(true)}
      className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
    >
      Delete Organization
    </button>
  </div>
)}

{showDeleteOrg && (
  <DeleteOrgModal
    orgName={getOrgName(org, activeOrg)}
    orgId={getOrgId(activeOrg)}
    userId={user?.id}
    onDeleted={() => {
      setOrg(null);
      navigate('/dashboard');
    }}
    onClose={() => setShowDeleteOrg(false)}
  />
)}
```

- [ ] **Step 8: Add file upload to the existing Invites tab**

In the Invites tab section, find the existing invite form and add a file upload option below it (same pattern as InvitePromptCard's file upload section). This reuses the same file parsing logic. Since both the prompt card and the invites tab need file upload, extract the parsing logic into a helper function at the top of the file:

```javascript
async function parseEmailFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const emails = [];

  if (ext === 'xlsx' || ext === 'xls') {
    const data = await file.arrayBuffer();
    const wb = read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = utils.sheet_to_json(ws, { header: 1 });
    for (let i = 0; i < rows.length; i++) {
      const cell = String(rows[i]?.[0] || '').trim();
      if (!cell) continue;
      if (i === 0 && /^(email|mail|name|e-mail)/i.test(cell)) continue;
      if (cell.includes('@')) emails.push(cell);
    }
  } else {
    const text = await file.text();
    const lines = text.split(/[\n,;]+/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && trimmed.includes('@')) emails.push(trimmed);
    }
  }

  return [...new Set(emails)];
}
```

Then use `parseEmailFile` in both InvitePromptCard and the Invites tab.

- [ ] **Step 9: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/OrgDashboard.jsx frontend/package.json frontend/package-lock.json
git commit -m "feat: add invite prompt card, file upload for bulk import, and delete org modal"
```

---

## Task 8: End-to-End Verification

**Files:** None (testing only)

- [ ] **Step 1: Verify backend starts**

Run: `cd backend && timeout 5 python main.py 2>&1 || true`
Expected: Server starts without errors (will timeout after 5s, that's fine)

- [ ] **Step 2: Verify frontend builds**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Verify no regressions — check all modified files compile**

Run: `cd frontend && npm run build 2>&1 | grep -i error`
Expected: No output (no errors)

- [ ] **Step 4: Commit any fixes**

If any issues found, fix and commit:

```bash
git add -u
git commit -m "fix: resolve build issues from org onboarding overhaul"
```
