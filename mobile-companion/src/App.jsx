import { useEffect, useRef, useState } from 'react';
import { DRILLS, CODE_TEMPLATES } from './drills';

export default function App() {
  const [tab, setTab] = useState('home');
  const [xp, setXp] = useState(() => Number(localStorage.getItem('pm_pocket_xp') || 0));
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
    localStorage.setItem('pm_pocket_xp', String(xp));
  }, [xp]);

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

  const drill = DRILLS[drillIdx % DRILLS.length];

  const selectAnswer = (idx) => {
    if (picked !== null) return;
    setPicked(idx);
    if (idx === drill.answer) {
      setXp((v) => v + 10);
      try { navigator.vibrate?.(25); } catch {}
    } else {
      try { navigator.vibrate?.([35, 30, 35]); } catch {}
    }
  };

  const nextDrill = () => {
    setPicked(null);
    setDrillIdx((i) => (i + 1) % DRILLS.length);
  };

  const runPython = async () => {
    setRunningCode(true);
    setOutput('Loading Python 3 engine…');
    try {
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
      const py = pyodideRef.current;
      const lines = [];
      py.setStdout({ batched: (msg) => lines.push(msg) });
      py.setStderr({ batched: (msg) => lines.push(msg) });
      const result = await py.runPythonAsync(code);
      if (lines.length === 0 && result !== undefined && result !== null) {
        lines.push(String(result));
      }
      setOutput(lines.join('\n') || '(Executed cleanly with no stdout output)');
      setXp((v) => v + 5);
    } catch (err) {
      setOutput(String(err?.message || err));
    } finally {
      setRunningCode(false);
    }
  };

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
      setXp((v) => v + 5);
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'ai', text: 'Check your connection or open pymasters.net/dashboard/vaathiyaar.' },
      ]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <img src="/icon-192.png" alt="PyMasters" />
          <div>
            <div className="brand-title">PyMasters Pocket</div>
            <div className="brand-sub">Mobile AI Python Companion</div>
          </div>
        </div>
        <div className="xp-pill">⚡ {xp} XP</div>
      </header>

      <main className="content">
        {tab === 'home' && (
          <>
            <section className="card hero-card">
              <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>
                LEARN PYTHON ANYWHERE
              </div>
              <h1 style={{ margin: '0 0 8px', fontSize: 21, lineHeight: 1.25 }}>
                Bite-sized Python drills, live Code Lab & Vaathiyaar AI.
              </h1>
              <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                Practice quick concepts on the go or launch into the full PyMasters Classroom and 13 Arcade games.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={() => setTab('drills')}>
                  Start 60s Drill →
                </button>
                <a className="btn btn-outline" href="https://pymasters.net/dashboard">
                  Open Full Platform ↗
                </a>
              </div>
            </section>

            <section className="card apk-banner">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 15 }}>📱 Get PyMasters for Android</strong>
                <span style={{ fontSize: 11, color: 'var(--emerald)', fontWeight: 700 }}>
                  ~{apkInfo.sizeMb} MB Ultra-Light
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>
                Install the lightweight native Android APK (with native splash, haptics, offline recovery & home-screen shortcuts) or add this PWA to your home screen.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {apkInfo.available && (
                  <a className="btn btn-emerald" href="/download/PyMasters.apk" download>
                    ⬇ Download Android APK
                  </a>
                )}
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
              <button type="button" className="quick-tile" onClick={() => setTab('lab')}>
                <strong>🐍 Pocket Code Lab</strong>
                <span>Run real Python 3 right on your phone</span>
              </button>
              <button type="button" className="quick-tile" onClick={() => setTab('tutor')}>
                <strong>🎓 Vaathiyaar AI</strong>
                <span>Ask any Python or ML question</span>
              </button>
              <a className="quick-tile" href="https://pymasters.net/dashboard/play">
                <strong>🕹️ Python Arcade</strong>
                <span>Play Linked Snake, Loop Runner & 11 more</span>
              </a>
              <a className="quick-tile" href="https://pymasters.net/dashboard/classroom">
                <strong>📚 Classroom</strong>
                <span>Adaptive Python to Deep Learning tracks</span>
              </a>
            </section>
          </>
        )}

        {tab === 'drills' && (
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>{drill.topic}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                #{drillIdx + 1} of {DRILLS.length}
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{drill.title}</h2>
            <div className="code-box">{drill.code}</div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>What does this Python snippet output / evaluate to?</p>
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
                    <span style={{ fontSize: 11, opacity: 0.7 }}>[{idx + 1}]</span>
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
                  {picked === drill.answer ? '✅ Spot on! (+10 XP)' : '💡 Good try — here is why:'}
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

        {tab === 'lab' && (
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>🐍 Pocket Python 3 Lab</h2>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>WebAssembly Runtime</span>
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
              {runningCode ? 'Running Python…' : '▶ Run Python (+5 XP)'}
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
            { id: 'drills', icon: '⚡', label: 'Drills' },
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
