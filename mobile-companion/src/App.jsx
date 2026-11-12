import { useCallback, useEffect, useRef, useState } from 'react';
import { DRILLS, CODE_TEMPLATES } from './drills';

function readStoredUser() {
  try {
    const raw = localStorage.getItem('pm_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.id && parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

function getTextVariant(val, fallback = '') {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val.en || Object.values(val).find((v) => typeof v === 'string' && v.trim()) || fallback;
  }
  return String(val);
}

function stripMarkdown(md = '') {
  return String(md)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

export default function App() {
  const [tab, setTab] = useState('home');

  // Guest / offline fallback XP
  const [guestXp, setGuestXp] = useState(() => Number(localStorage.getItem('pm_pocket_xp') || 0));

  // Synced PyMasters account state (shared schema with pymasters.net `localStorage['pm_user']`)
  const [user, setUser] = useState(readStoredUser);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  // Live backend progress & lesson catalog
  const [syncedStats, setSyncedStats] = useState(null);
  const [completedLessons, setCompletedLessons] = useState(() => new Set());
  const [lessons, setLessons] = useState([]);
  const [coreModules, setCoreModules] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState('all');
  const [syncing, setSyncing] = useState(false);
  const [practiceMode, setPracticeMode] = useState('lessons'); // 'lessons' | 'drills'

  // Active live lesson runner state
  const [activeLesson, setActiveLesson] = useState(null);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [lessonCode, setLessonCode] = useState('');
  const [challengeIdx, setChallengeIdx] = useState(0);
  const [evalBusy, setEvalBusy] = useState(false);
  const [evalResult, setEvalResult] = useState(null);
  const [moduleBusyId, setModuleBusyId] = useState(null);

  // Offline 60s Drills state
  const [drillIdx, setDrillIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [apkInfo, setApkInfo] = useState({ available: true, sizeMb: '0.4' });

  // Pocket Code Lab (Pyodide Wasm Python 3 runtime loaded on demand)
  const [code, setCode] = useState(CODE_TEMPLATES[0].code);
  const [output, setOutput] = useState('Tap "Run Python" to execute in-browser Python 3.');
  const [runningCode, setRunningCode] = useState(false);
  const pyodideRef = useRef(null);

  // Vaathiyaar AI Chat
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: 'Vanakkam! I am Vaathiyaar, your pocket Python teacher. Ask me any Python, DSA, or Machine Learning question!',
    },
  ]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    localStorage.setItem('pm_pocket_xp', String(guestXp));
  }, [guestXp]);

  const authHeaders = useCallback(
    (extra = {}) => {
      const headers = { ...extra };
      if (user?.token) {
        headers.Authorization = `Bearer ${user.token}`;
      }
      return headers;
    },
    [user?.token]
  );

  const handleSignOut = useCallback(() => {
    localStorage.removeItem('pm_user');
    setUser(null);
    setSyncedStats(null);
    setCompletedLessons(new Set());
    setEvalResult(null);
  }, []);

  const syncAccountData = useCallback(
    async (sessionUser = user) => {
      setSyncing(true);
      try {
        const headers = sessionUser?.token
          ? { Authorization: `Bearer ${sessionUser.token}` }
          : {};
        const uidQuery = sessionUser?.id ? `&user_id=${encodeURIComponent(sessionUser.id)}` : '';

        const catalogPromise = fetch(`/api/classroom/lessons?lang=en${uidQuery}`, { headers })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        const modulesPromise = fetch('/api/content/modules', { headers })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        if (sessionUser?.id && sessionUser?.token) {
          const uid = encodeURIComponent(sessionUser.id);
          const [catalogData, modulesData, statsRes, compRes] = await Promise.all([
            catalogPromise,
            modulesPromise,
            fetch(`/api/profile/${uid}/stats`, { headers }).catch(() => null),
            fetch(`/api/content/completions/${uid}`, { headers }).catch(() => null),
          ]);

          if (catalogData && Array.isArray(catalogData.lessons)) {
            setLessons(catalogData.lessons);
          }
          if (Array.isArray(modulesData)) {
            setCoreModules(modulesData);
          }
          if (statsRes?.status === 401 || compRes?.status === 401) {
            handleSignOut();
            return;
          }
          if (statsRes?.ok) {
            const statsJson = await statsRes.json();
            setSyncedStats(statsJson);
          }
          if (compRes?.ok) {
            const compJson = await compRes.json();
            const ids = (compJson?.completions || []).map((c) => c.lesson_id).filter(Boolean);
            setCompletedLessons(new Set(ids));
          }
        } else {
          const [catalogData, modulesData] = await Promise.all([catalogPromise, modulesPromise]);
          if (catalogData && Array.isArray(catalogData.lessons)) {
            setLessons(catalogData.lessons);
          }
          if (Array.isArray(modulesData)) {
            setCoreModules(modulesData);
          }
        }
      } finally {
        setSyncing(false);
      }
    },
    [user, handleSignOut]
  );

  // Hydrate saved token via GET /api/auth/me on initial load
  useEffect(() => {
    const stored = readStoredUser();
    if (!stored?.token) {
      syncAccountData(null);
      return;
    }
    let alive = true;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${stored.token}` } })
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 401) {
          handleSignOut();
          syncAccountData(null);
          return;
        }
        if (res.ok) {
          const fresh = await res.json();
          const merged = { ...stored, ...fresh, token: fresh.token || stored.token };
          localStorage.setItem('pm_user', JSON.stringify(merged));
          setUser(merged);
          syncAccountData(merged);
        } else {
          syncAccountData(stored);
        }
      })
      .catch(() => {
        if (alive) syncAccountData(stored);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    fetch('/health')
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.apkAvailable === 'boolean') {
          setApkInfo({
            available: d.apkAvailable,
            sizeMb: d.apkSizeBytes ? (d.apkSizeBytes / (1024 * 1024)).toFixed(1) : '1.5',
          });
        }
      })
      .catch(() => {});
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    const username = usernameInput.trim();
    const password = passwordInput;
    if (!username || !password || authBusy) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.token) {
        setAuthError(data?.detail || 'Invalid username or password.');
        return;
      }
      localStorage.setItem('pm_user', JSON.stringify(data));
      setUser(data);
      setPasswordInput('');
      await syncAccountData(data);
    } catch {
      setAuthError('Could not reach PyMasters backend. Offline drills remain ready.');
    } finally {
      setAuthBusy(false);
    }
  };

  const openLesson = async (lessonId) => {
    setLoadingLesson(true);
    setEvalResult(null);
    setChallengeIdx(0);
    try {
      const uidParam = user?.id ? `?user_id=${encodeURIComponent(user.id)}` : '';
      const res = await fetch(`/api/classroom/lesson/${encodeURIComponent(lessonId)}${uidParam}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Could not load lesson.');
      const detail = await res.json();
      setActiveLesson(detail);
      const firstChallenge = (detail.practice_challenges && detail.practice_challenges[0]) || {};
      setLessonCode(firstChallenge.starter_code || '# Write your Python solution here\n');
      setTab('lessons');
    } catch (err) {
      setEvalResult({
        success: false,
        message: err?.message || 'Unable to load lesson right now. Try Offline Drills!',
      });
    } finally {
      setLoadingLesson(false);
    }
  };

  const selectChallengeIndex = (idx) => {
    if (!activeLesson?.practice_challenges?.[idx]) return;
    setChallengeIdx(idx);
    setEvalResult(null);
    setLessonCode(activeLesson.practice_challenges[idx].starter_code || '# Write your Python solution here\n');
  };

  const submitLessonSolution = async () => {
    if (!activeLesson) return;
    if (!user?.id || !user?.token) {
      setEvalResult({
        success: false,
        message: 'Sign in to your PyMasters account on the Home tab to grade & sync XP to Web!',
      });
      return;
    }
    setEvalBusy(true);
    setEvalResult(null);
    try {
      const res = await fetch('/api/classroom/evaluate', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          user_id: String(user.id),
          code: lessonCode,
          lesson_id: activeLesson.id,
          topic: activeLesson.topic || activeLesson.id,
          challenge_index: challengeIdx,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEvalResult({
          success: false,
          message: data?.detail || 'Evaluation failed. Please check your code and try again.',
        });
        return;
      }

      const fbText =
        typeof data.feedback === 'object'
          ? data.feedback?.message || data.feedback?.hint || ''
          : String(data.feedback || '');

      if (data.success) {
        setCompletedLessons((prev) => {
          const next = new Set(prev);
          next.add(activeLesson.id);
          return next;
        });
        try {
          navigator.vibrate?.(30);
        } catch {}
        await syncAccountData(user);
      }

      setEvalResult({
        success: Boolean(data.success),
        output: data.output || '',
        xpEarned: data.xp_earned || 0,
        message: data.success
          ? data.xp_earned > 0
            ? `Passed! +${data.xp_earned} XP synced to pymasters.net.`
            : 'Passed! Lesson completion is synced across Web & Mobile.'
          : fbText || 'Output did not match yet — tweak your code and try again!',
      });
    } catch {
      setEvalResult({
        success: false,
        message: 'Network error while grading. You can still test locally in Code Lab!',
      });
    } finally {
      setEvalBusy(false);
    }
  };

  const handleCompleteCoreModule = async (moduleId) => {
    if (!user?.id || !user?.token || moduleBusyId) return;
    setModuleBusyId(moduleId);
    try {
      const res = await fetch('/api/content/complete', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          user_id: String(user.id),
          module_id: moduleId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setCompletedLessons((prev) => {
          const next = new Set(prev);
          next.add(moduleId);
          return next;
        });
        await syncAccountData(user);
      }
    } finally {
      setModuleBusyId(null);
    }
  };

  const drill = DRILLS[drillIdx % DRILLS.length];

  const selectAnswer = (idx) => {
    if (picked !== null) return;
    setPicked(idx);
    if (idx === drill.answer) {
      setGuestXp((v) => v + 10);
      try {
        navigator.vibrate?.(25);
      } catch {}
    } else {
      try {
        navigator.vibrate?.([35, 30, 35]);
      } catch {}
    }
  };

  const nextDrill = () => {
    setPicked(null);
    setDrillIdx((i) => (i + 1) % DRILLS.length);
  };

  const ensurePyodide = async () => {
    if (!pyodideRef.current) {
      if (!window.loadPyodide) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      pyodideRef.current = await window.loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/',
      });
    }
    return pyodideRef.current;
  };

  const runPythonSnippet = async (sourceCode, onResult) => {
    setRunningCode(true);
    onResult('Loading Python 3 engine…');
    try {
      const py = await ensurePyodide();
      const lines = [];
      py.setStdout({ batched: (msg) => lines.push(msg) });
      py.setStderr({ batched: (msg) => lines.push(msg) });
      const result = await py.runPythonAsync(sourceCode);
      if (lines.length === 0 && result !== undefined && result !== null) {
        lines.push(String(result));
      }
      onResult(lines.join('\n') || '(Executed cleanly with no stdout output)');
      if (!user) {
        setGuestXp((v) => v + 5);
      }
    } catch (err) {
      onResult(String(err?.message || err));
    } finally {
      setRunningCode(false);
    }
  };

  const runPython = () => runPythonSnippet(code, setOutput);

  const askTutor = async (e) => {
    e?.preventDefault();
    const q = question.trim();
    if (!q || asking) return;
    setQuestion('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setAsking(true);
    try {
      const res = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: 'ai', text: data.reply || 'Try testing that in Code Lab!' }]);
      if (!user) setGuestXp((v) => v + 5);
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'ai', text: 'Check your connection or open pymasters.net/dashboard/vaathiyaar.' },
      ]);
    } finally {
      setAsking(false);
    }
  };

  const displayedXp = user ? (syncedStats?.total_xp ?? user.points ?? 0) : guestXp;
  const displayedStreak = user ? (syncedStats?.current_streak ?? 0) : 0;

  const tracks = Array.from(new Set(lessons.map((l) => l.track).filter(Boolean)));
  const filteredLessons =
    selectedTrack === 'all' ? lessons : lessons.filter((l) => l.track === selectedTrack);
  const activeChallenge =
    (activeLesson?.practice_challenges && activeLesson.practice_challenges[challengeIdx]) || null;

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <img src="/icon-192.png" alt="PyMasters" />
          <div>
            <div className="brand-title">PyMasters Pocket</div>
            <div className="brand-sub">
              {user ? `Synced · @${user.username}` : 'Mobile AI Python Companion'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {user && (
            <div
              className="xp-pill"
              style={{
                background: 'rgba(251, 191, 36, 0.14)',
                borderColor: 'rgba(251, 191, 36, 0.4)',
                color: 'var(--amber)',
              }}
            >
              🔥 {displayedStreak}d
            </div>
          )}
          <div className="xp-pill">⚡ {displayedXp} XP</div>
        </div>
      </header>

      <main className="content">
        {tab === 'home' && (
          <>
            {/* PyMasters Cloud Sync / Account Card */}
            <section className="card">
              {user ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--emerald)', fontWeight: 700 }}>
                        ● SYNCED WITH PYMASTERS.NET
                      </div>
                      <strong style={{ fontSize: 16 }}>
                        Vanakkam, {user.name || user.username}!
                      </strong>
                    </div>
                    <button
                      type="button"
                      className="chip"
                      onClick={() => syncAccountData(user)}
                      disabled={syncing}
                    >
                      {syncing ? 'Syncing…' : '↻ Sync'}
                    </button>
                  </div>

                  <div className="quick-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <div className="quick-tile" style={{ padding: 10, cursor: 'default' }}>
                      <strong style={{ color: 'var(--accent)' }}>{displayedXp}</strong>
                      <span>Total XP</span>
                    </div>
                    <div className="quick-tile" style={{ padding: 10, cursor: 'default' }}>
                      <strong style={{ color: 'var(--amber)' }}>{displayedStreak} days</strong>
                      <span>Streak</span>
                    </div>
                    <div className="quick-tile" style={{ padding: 10, cursor: 'default' }}>
                      <strong style={{ color: 'var(--emerald)' }}>{completedLessons.size}</strong>
                      <span>Completed</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Rank: <strong style={{ color: 'var(--text)' }}>{syncedStats?.rank || 'Learner'}</strong>
                    </span>
                    <button
                      type="button"
                      className="chip"
                      onClick={handleSignOut}
                      style={{ color: 'var(--danger)' }}
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
                      SYNC YOUR PROGRESS
                    </div>
                    <strong style={{ fontSize: 16 }}>Sign in to your PyMasters account</strong>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.45 }}>
                      Sync lessons, XP, daily streaks, and completions live with pymasters.net — or practice offline as a guest below.
                    </p>
                  </div>
                  {authError && (
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        background: 'rgba(248,113,113,0.14)',
                        border: '1px solid var(--danger)',
                        color: '#fecaca',
                        fontSize: 12.5,
                      }}
                    >
                      {authError}
                    </div>
                  )}
                  <input
                    className="chat-input"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="PyMasters username"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                  <input
                    className="chat-input"
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Password"
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="submit" className="btn btn-primary" disabled={authBusy} style={{ flex: 1 }}>
                      {authBusy ? 'Signing in…' : 'Sign In & Sync'}
                    </button>
                    <a className="btn btn-outline" href="https://pymasters.net/login">
                      Create Account ↗
                    </a>
                  </div>
                </form>
              )}
            </section>

            <section className="card hero-card">
              <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>
                100% AD-FREE PYTHON & AI LEARNING
              </div>
              <h1 style={{ margin: '0 0 8px', fontSize: 21, lineHeight: 1.25 }}>
                Live synced Classroom lessons, 60s drills & Vaathiyaar AI.
              </h1>
              <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                Complete real PyMasters lessons on your phone and pick up right where you left off on Web or Android.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setPracticeMode(lessons.length > 0 ? 'lessons' : 'drills');
                    setTab('lessons');
                  }}
                >
                  {lessons.length > 0 ? `Browse ${lessons.length} Live Lessons →` : 'Start 60s Drill →'}
                </button>
                <a className="btn btn-outline" href="https://pymasters.net/dashboard">
                  Open Full Platform ↗
                </a>
              </div>
            </section>

            <section className="card apk-banner">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 15 }}>📱 Get PyMasters for Android</strong>
                <span style={{ fontSize: 12, color: 'var(--emerald)', fontWeight: 700 }}>
                  ~{apkInfo.sizeMb} MB Ultra-Light
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>
                Install the native Android app or add this companion to your home screen for instant offline drills.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {apkInfo.available && (
                  <a className="btn btn-emerald" href="/download/PyMasters.apk" download>
                    ⬇ Download Android APK
                  </a>
                )}
                <a
                  className="btn btn-outline"
                  href="https://t.me/boost/PyMasterscommunity"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  💬 Telegram Support &amp; Community ↗
                </a>
                {installPrompt && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={async () => {
                      installPrompt.prompt();
                      await installPrompt.userChoice;
                      setInstallPrompt(null);
                    }}
                  >
                    + Install Web App
                  </button>
                )}
              </div>
            </section>

            <section className="quick-grid">
              <button
                type="button"
                className="quick-tile"
                onClick={() => {
                  setPracticeMode('drills');
                  setTab('lessons');
                }}
              >
                <strong>⚡ Offline Drills</strong>
                <span>Quick 60-second guest quizzes</span>
              </button>
              <button type="button" className="quick-tile" onClick={() => setTab('lab')}>
                <strong>🐍 Pocket Code Lab</strong>
                <span>Run real Python 3 on your phone</span>
              </button>
              <button type="button" className="quick-tile" onClick={() => setTab('tutor')}>
                <strong>🎓 Vaathiyaar AI</strong>
                <span>Ask any Python or ML question</span>
              </button>
              <a className="quick-tile" href="https://pymasters.net/dashboard/classroom">
                <strong>📚 Full Classroom</strong>
                <span>Visual steppers & 13 Arcade games</span>
              </a>
            </section>
          </>
        )}

        {tab === 'lessons' && (
          <>
            <div className="chip-row">
              <button
                type="button"
                className="chip"
                style={
                  practiceMode === 'lessons'
                    ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                    : undefined
                }
                onClick={() => setPracticeMode('lessons')}
              >
                📚 Live Lessons ({lessons.length})
              </button>
              <button
                type="button"
                className="chip"
                style={
                  practiceMode === 'drills'
                    ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                    : undefined
                }
                onClick={() => setPracticeMode('drills')}
              >
                ⚡ Offline Drills ({DRILLS.length})
              </button>
            </div>

            {practiceMode === 'lessons' ? (
              activeLesson ? (
                <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="chip"
                      onClick={() => {
                        setActiveLesson(null);
                        setEvalResult(null);
                      }}
                    >
                      ← Back to Catalog
                    </button>
                    <span style={{ fontSize: 12, color: completedLessons.has(activeLesson.id) ? 'var(--emerald)' : 'var(--accent)', fontWeight: 700 }}>
                      {completedLessons.has(activeLesson.id)
                        ? '✅ Completed & Synced'
                        : `+${activeLesson.xp_reward || 25} XP`}
                    </span>
                  </div>

                  <h2 style={{ margin: 0, fontSize: 18 }}>
                    {activeLesson.active_title || getTextVariant(activeLesson.title, activeLesson.id)}
                  </h2>

                  {(activeLesson.active_story || activeLesson.story_variants?.en) && (
                    <div
                      style={{
                        fontSize: 13,
                        color: 'var(--muted)',
                        lineHeight: 1.55,
                        maxHeight: 170,
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        padding: 10,
                        borderRadius: 12,
                        background: 'var(--surface-2)',
                      }}
                    >
                      {stripMarkdown(activeLesson.active_story || activeLesson.story_variants?.en).slice(0, 900)}
                    </div>
                  )}

                  {Array.isArray(activeLesson.practice_challenges) && activeLesson.practice_challenges.length > 1 && (
                    <div className="chip-row">
                      {activeLesson.practice_challenges.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="chip"
                          style={
                            challengeIdx === idx
                              ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                              : undefined
                          }
                          onClick={() => selectChallengeIndex(idx)}
                        >
                          Challenge #{idx + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  {activeChallenge && (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        background: 'rgba(56, 189, 248, 0.09)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ display: 'block', marginBottom: 4, color: 'var(--accent)' }}>
                        Practice Challenge
                      </strong>
                      {getTextVariant(
                        activeChallenge.description || activeChallenge.prompt,
                        'Write Python code to solve this lesson challenge.'
                      )}
                    </div>
                  )}

                  <textarea
                    className="editor-textarea"
                    value={lessonCode}
                    onChange={(e) => setLessonCode(e.target.value)}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                  />

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      disabled={evalBusy}
                      onClick={submitLessonSolution}
                    >
                      {evalBusy ? 'Grading & Syncing…' : '✓ Submit & Sync XP'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={runningCode}
                      onClick={() =>
                        runPythonSnippet(lessonCode, (out) =>
                          setEvalResult({ success: true, output: out, message: 'Local Python 3 output:' })
                        )
                      }
                    >
                      {runningCode ? 'Running…' : '▶ Test Locally'}
                    </button>
                  </div>

                  {evalResult && (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        background: evalResult.success ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                        border: `1px solid ${evalResult.success ? 'var(--emerald)' : 'var(--danger)'}`,
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ display: 'block', marginBottom: 4 }}>{evalResult.message}</strong>
                      {evalResult.output && <div className="code-box">{evalResult.output}</div>}
                    </div>
                  )}
                </section>
              ) : (
                <>
                  {tracks.length > 0 && (
                    <div className="chip-row">
                      <button
                        type="button"
                        className="chip"
                        style={selectedTrack === 'all' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                        onClick={() => setSelectedTrack('all')}
                      >
                        All Tracks
                      </button>
                      {tracks.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="chip"
                          style={selectedTrack === t ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                          onClick={() => setSelectedTrack(t)}
                        >
                          {t.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  )}

                  {user && coreModules.length > 0 && (
                    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
                        CORE QUICK MODULES (SYNCED)
                      </div>
                      {coreModules.slice(0, 4).map((mod) => {
                        const isDone = completedLessons.has(mod.id);
                        return (
                          <div
                            key={mod.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 10px',
                              borderRadius: 12,
                              background: 'var(--surface-2)',
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: 13.5, display: 'block' }}>{mod.title}</strong>
                              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                +{mod.xp_reward || 50} XP
                              </span>
                            </div>
                            {isDone ? (
                              <span style={{ fontSize: 12, color: 'var(--emerald)', fontWeight: 700 }}>
                                ✅ Done
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="chip"
                                disabled={moduleBusyId === mod.id}
                                onClick={() => handleCompleteCoreModule(mod.id)}
                              >
                                {moduleBusyId === mod.id ? 'Saving…' : 'Complete'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </section>
                  )}

                  <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 15 }}>
                        {loadingLesson ? 'Opening lesson…' : 'PyMasters Live Curriculum'}
                      </strong>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {filteredLessons.length} lessons
                      </span>
                    </div>

                    {filteredLessons.length === 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                        {syncing
                          ? 'Syncing live curriculum from pymasters.net…'
                          : 'Offline or unable to reach live catalog right now — switch to Offline Drills above!'}
                      </div>
                    ) : (
                      filteredLessons.slice(0, 40).map((lesson) => {
                        const done = completedLessons.has(lesson.id);
                        return (
                          <button
                            key={lesson.id}
                            type="button"
                            className="choice-btn"
                            style={{ fontFamily: 'inherit', alignItems: 'center', gap: 10 }}
                            onClick={() => openLesson(lesson.id)}
                          >
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>
                                {getTextVariant(lesson.title, lesson.id)}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                                {(lesson.track || 'python').replace(/_/g, ' ')} · +{lesson.xp_reward || 25} XP
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: done ? 'var(--emerald)' : 'var(--accent)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {done ? '✅ Done' : 'Practice →'}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </section>
                </>
              )
            ) : (
              <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
                    OFFLINE DRILL · {drill.topic}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    #{drillIdx + 1} of {DRILLS.length}
                  </span>
                </div>
                <h2 style={{ margin: 0, fontSize: 18 }}>{drill.title}</h2>
                <div className="code-box">{drill.code}</div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                  What does this Python snippet output / evaluate to?
                </p>
                <div className="choice-list">
                  {drill.choices.map((c, idx) => {
                    let cls = 'choice-btn';
                    if (picked !== null) {
                      if (idx === drill.answer) cls += ' correct';
                      else if (idx === picked) cls += ' wrong';
                    }
                    return (
                      <button key={idx} type="button" className={cls} onClick={() => selectAnswer(idx)}>
                        <span>{c}</span>
                        <span style={{ fontSize: 12, opacity: 0.7 }}>[{idx + 1}]</span>
                      </button>
                    );
                  })}
                </div>
                {picked !== null && (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: picked === drill.answer ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                      border: `1px solid ${picked === drill.answer ? 'var(--emerald)' : 'var(--danger)'}`,
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    <strong style={{ display: 'block', marginBottom: 4 }}>
                      {picked === drill.answer ? '✅ Spot on! (+10 Pocket XP)' : '💡 Good try — here is why:'}
                    </strong>
                    {drill.why}
                  </div>
                )}
                {picked !== null && (
                  <button type="button" className="btn btn-primary" onClick={nextDrill}>
                    Next Question →
                  </button>
                )}
              </section>
            )}
          </>
        )}

        {tab === 'lab' && (
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>🐍 Pocket Python 3 Lab</h2>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>WebAssembly Runtime</span>
            </div>
            <div className="chip-row">
              {CODE_TEMPLATES.map((tpl) => (
                <button key={tpl.label} type="button" className="chip" onClick={() => setCode(tpl.code)}>
                  {tpl.label}
                </button>
              ))}
            </div>
            <textarea
              className="editor-textarea"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <button type="button" className="btn btn-primary" onClick={runPython} disabled={runningCode}>
              {runningCode ? 'Running Python…' : '▶ Run Python'}
            </button>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Output</div>
              <div className="code-box" style={{ minHeight: 68 }}>{output}</div>
            </div>
          </section>
        )}

        {tab === 'tutor' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="chat-log">
              {messages.map((m, i) => (
                <div key={i} className={`bubble ${m.role}`}>
                  {m.text}
                </div>
              ))}
              {asking && <div className="bubble ai">Vaathiyaar is thinking…</div>}
            </div>
            <div className="chip-row">
              {[
                'Explain list vs tuple simply',
                'How does a Python generator work?',
                'Give me a quick recursion tip',
              ].map((prompt) => (
                <button key={prompt} type="button" className="chip" onClick={() => setQuestion(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
            <form className="chat-input-row" onSubmit={askTutor}>
              <input
                className="chat-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask Vaathiyaar about Python…"
              />
              <button type="submit" className="btn btn-primary" disabled={asking}>
                Ask
              </button>
            </form>
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Primary">
        <div className="bottom-nav-inner">
          {[
            { id: 'home', icon: '🏠', label: 'Home' },
            { id: 'lessons', icon: '📚', label: 'Lessons' },
            { id: 'lab', icon: '🐍', label: 'Code Lab' },
            { id: 'tutor', icon: '🎓', label: 'AI Tutor' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-tab ${tab === item.id ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
