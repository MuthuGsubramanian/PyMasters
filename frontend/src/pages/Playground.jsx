import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import PythonEditor from '../components/PythonEditor';
import OutputPanel from '../components/OutputPanel';
import VoiceTutor from '../components/VoiceTutor';
import VaathiyaarMessage from '../components/VaathiyaarMessage';
import api from '../api';
import { safeErrorMsg } from '../utils/errorUtils';
import { Sparkles, Zap, Play, Trash2, Send, Terminal, Loader2, Mic } from 'lucide-react';
import { Button, Badge } from '../components/ui';

// ──────────────────────────────────────────────────────────────────────────────
// Playground — focused live Python terminal.
//
// Vaathiyaar chat is NOT embedded here: it lives in the global slide-out panel
// (components/VaathiyaarPanel.jsx) exactly like on every other page. This page
// talks to the panel through two window events:
//   pm:vaathiyaar-ask    → panel opens and sends the given message
//   pm:vaathiyaar-inject → panel's "To editor" button replaces the editor code
// ──────────────────────────────────────────────────────────────────────────────
export default function Playground() {
    const { user } = useAuth();
    const [voiceOpen, setVoiceOpen] = useState(false);

    useEffect(() => { document.title = 'Playground — PyMasters'; }, []);

    // Code terminal state
    const [code, setCode] = useState('');
    const [output, setOutput] = useState('');
    const [running, setRunning] = useState(false);
    const [executionTime, setExecutionTime] = useState(null);

    // Prompt-credit meter (credits are burned by Vaathiyaar chat, incl. the panel)
    const [credits, setCredits] = useState(null);
    const [creditsLoading, setCreditsLoading] = useState(true);
    useEffect(() => {
        if (user?.id) {
            api.get(`/playground/credits/${user.id}`)
                .then((r) => setCredits(r.data))
                .catch(() => setCredits(null))
                .finally(() => setCreditsLoading(false));
        }
    }, [user]);

    // Code injected from the Vaathiyaar panel ("Insert" / "Run demo" on python
    // blocks). run:true executes the demo immediately — that's Vaathiyaar
    // demonstrating an example with the live terminal.
    const executeRef = useRef(null);
    useEffect(() => {
        const onInject = (e) => {
            const injected = e?.detail?.code;
            if (!injected) return;
            setCode(injected);
            if (e?.detail?.run) executeRef.current?.(injected);
        };
        window.addEventListener('pm:vaathiyaar-inject', onInject);
        return () => window.removeEventListener('pm:vaathiyaar-inject', onInject);
    }, []);

    const askVaathiyaar = (message) => {
        window.dispatchEvent(new CustomEvent('pm:vaathiyaar-ask', { detail: { message } }));
    };

    // ── Terminal actions ───────────────────────────────────────────────────
    const executeCode = async (codeText) => {
        if (!codeText.trim() || running) return;
        setRunning(true);
        setOutput('');
        setExecutionTime(null);
        const startTime = performance.now();
        try {
            const res = await api.post('/playground/execute', {
                user_id: user?.id,
                code: codeText,
            });
            const elapsed = Math.round(performance.now() - startTime);
            setExecutionTime(elapsed);
            const result = res.data;
            let out = '';
            if (result.output) out += result.output;
            // Backend already folds stderr into `output`; only append `error`
            // if it isn't already present, so tracebacks aren't shown twice.
            if (result.error && !out.includes(result.error.trim())) {
                out += (out ? '\n' : '') + result.error;
            }
            if (!out) out = '(no output)';
            setOutput(out);
        } catch (err) {
            setExecutionTime(Math.round(performance.now() - startTime));
            setOutput(`Execution error: ${safeErrorMsg(err, 'Unknown error')}`);
        } finally {
            setRunning(false);
        }
    };
    executeRef.current = executeCode;
    const handleRunCode = () => executeCode(code);

    const handleAskAIForHelp = (failedCode, errorText) => {
        askVaathiyaar(
            `My code produced this error. Help me fix it:\n\n\`\`\`python\n${failedCode}\n\`\`\`\n\nError:\n\`\`\`\n${errorText}\n\`\`\``
        );
    };

    const handleSendToVaathiyaar = () => {
        const codeContent = code.trim();
        if (!codeContent) return;
        askVaathiyaar(`Can you review this code?\n\`\`\`python\n${codeContent}\n\`\`\``);
    };

    const handleClearTerminal = () => {
        if (code.trim() && code.trim() !== '# Write Python code here...') {
            if (!window.confirm('Clear all code? This cannot be undone.')) return;
        }
        setCode('');
        setOutput('');
    };

    const [installPkg, setInstallPkg] = useState('');
    const [installing, setInstalling] = useState(false);

    const handleInstallPackage = async () => {
        const pkg = installPkg.trim();
        if (!pkg || installing) return;
        setInstalling(true);
        setOutput(`>>> pip install ${pkg}...\n`);
        try {
            const res = await api.post('/playground/install-package', { package: pkg, user_id: user?.id });
            if (res.data.success) {
                setOutput(`Successfully installed ${pkg}\n${res.data.output || ''}`);
            } else {
                setOutput(`Failed to install ${pkg}:\n${res.data.error}`);
            }
        } catch (err) {
            setOutput(`Install error: ${safeErrorMsg(err, 'Unknown error')}`);
        } finally {
            setInstalling(false);
            setInstallPkg('');
        }
    };

    const remaining = credits?.remaining_prompts ?? 0;
    const total = credits?.total_prompts ?? 0;
    const remainingPct = total > 0 ? Math.min((remaining / total) * 100, 100) : 0;

    return (
        // Height = viewport minus Layout's shell (p-6 container = 3rem; mobile adds
        // the fixed 3.5rem header) — avoids page-level double scroll.
        <div className="h-[calc(100dvh-6.5rem)] lg:h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
            <VaathiyaarMessage />

            {/* ── Toolbar: title, credits meter, voice — one compact row ──── */}
            <header className="flex-shrink-0 flex items-center gap-3 rounded-xl border border-border-default bg-bg-surface/60 backdrop-blur-sm px-4 py-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center text-white shadow-glow flex-shrink-0">
                    <Sparkles size={16} />
                </div>
                <div className="min-w-0">
                    <h1 className="text-lg font-bold font-display text-text-primary leading-tight">Playground</h1>
                </div>
                <span className="hidden sm:inline text-xs text-text-muted">Live Python terminal</span>
                <div className="flex-1" />
                {!creditsLoading && credits && (
                    <div
                        className="hidden md:flex items-center gap-2.5 mr-1"
                        title={`${remaining} of ${total} Vaathiyaar prompts remaining`}
                    >
                        <Badge variant="warning" className="text-xs px-2 py-0.5">
                            <Zap size={11} />
                            {credits.xp} XP
                        </Badge>
                        <div className="w-24 bg-bg-elevated h-1.5 rounded-full overflow-hidden" role="progressbar" aria-label="Vaathiyaar prompts remaining" aria-valuenow={remaining} aria-valuemax={total}>
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                    remainingPct > 50 ? 'bg-gradient-to-r from-emerald-400 to-green-500' :
                                    remainingPct > 20 ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
                                    'bg-gradient-to-r from-red-400 to-red-500'
                                }`}
                                style={{ width: `${remainingPct}%` }}
                            />
                        </div>
                        <span className="text-[11px] font-mono text-text-muted tabular-nums">
                            {remaining}/{total}
                        </span>
                    </div>
                )}
                <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setVoiceOpen(true)}
                    title="Talk to Vaathiyaar (voice)"
                >
                    <Mic size={14} />
                    Voice
                </Button>
            </header>

            {/* ── Terminal workspace — full width ─────────────────────────── */}
            <div className="flex-1 min-h-0 pt-4">
                <div className="h-full flex flex-col min-h-0 rounded-2xl border border-border-strong surface-code shadow-xl overflow-hidden">
                    {/* Terminal header */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-strong surface-code flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-400" />
                                <div className="w-3 h-3 rounded-full bg-amber-400" />
                                <div className="w-3 h-3 rounded-full bg-green-400" />
                            </div>
                            <span className="text-xs font-semibold text-code-foreground/70 ml-2 flex items-center gap-1.5">
                                <Terminal size={12} />
                                code.py
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-code-foreground/50 font-mono">Python 3</span>
                        </div>
                    </div>

                    {/* Code editor area. Scrolls internally when the viewport is
                        too short (≈<600px) so the editor never collapses to a
                        sliver — the min-h on the editor row guarantees a usable
                        typing surface at any window height. */}
                    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto dark-scrollbar">
                        <div className="flex-1 flex min-h-[160px] overflow-hidden">
                            <PythonEditor
                                value={code}
                                onChange={setCode}
                                onRun={handleRunCode}
                                height="calc(100% - 28px)"
                                placeholder="# Write Python code here...&#10;# Press Ctrl+Enter to run"
                            />
                        </div>

                        {/* Output panel */}
                        <div className="flex-shrink-0 border-t border-border-strong" style={{ maxHeight: '35%' }}>
                            <OutputPanel
                                output={output}
                                error=""
                                running={running}
                                executionTime={executionTime}
                                onClear={() => { setOutput(''); setExecutionTime(null); }}
                                onAskAI={handleAskAIForHelp}
                                code={code}
                            />
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border-strong surface-code flex-shrink-0">
                            <button
                                onClick={handleRunCode}
                                disabled={running || !code.trim()}
                                className={`flex items-center gap-1.5 text-xs font-bold text-white rounded-xl px-4 py-2 transition-all duration-300 ${
                                    running
                                        ? 'bg-green-600 animate-pulse cursor-wait'
                                        : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-green-500/20'
                                } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100`}
                            >
                                {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                                {running ? 'Running...' : 'Run Code'}
                            </button>
                            <span className="text-[10px] text-code-foreground/50 font-mono hidden sm:inline">Ctrl+Enter</span>
                            <button
                                onClick={handleClearTerminal}
                                className="flex items-center gap-1.5 text-xs font-medium text-code-foreground/70 bg-white/5 border border-white/10 rounded-xl px-3 py-2 hover:bg-white/10 hover:text-code-foreground transition-all duration-200"
                            >
                                <Trash2 size={13} />
                                Clear
                            </button>
                            <div className="flex-1" />
                            <button
                                onClick={handleSendToVaathiyaar}
                                disabled={!code.trim()}
                                title="Open Vaathiyaar and ask for a review of this code"
                                className="flex items-center gap-1.5 text-xs font-bold text-accent-primary bg-accent-primary/10 border border-accent-primary/30 rounded-xl px-3 py-2 hover:bg-accent-primary/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Send size={13} />
                                Send to Vaathiyaar
                            </button>
                        </div>

                        {/* Package installer */}
                        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-white/[0.04] flex-shrink-0">
                            <span className="text-[10px] text-code-foreground/50 font-mono flex-shrink-0">pip install</span>
                            <input
                                type="text"
                                value={installPkg}
                                onChange={(e) => setInstallPkg(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleInstallPackage()}
                                placeholder="package-name"
                                aria-label="Package name to install"
                                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-code-foreground placeholder-code-foreground/40 font-mono focus:outline-none focus:border-green-500/40"
                            />
                            <button
                                onClick={handleInstallPackage}
                                disabled={!installPkg.trim() || installing}
                                className="text-[10px] font-bold text-green-300 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-1.5 hover:bg-green-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {installing ? 'Installing...' : 'Install'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <VoiceTutor
                open={voiceOpen}
                onClose={() => setVoiceOpen(false)}
                user={user}
                lessonContext={null}
                language={user?.preferred_language || 'en'}
            />
        </div>
    );
}
