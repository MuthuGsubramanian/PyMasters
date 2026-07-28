import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import PythonEditor from '../components/PythonEditor';
import OutputPanel from '../components/OutputPanel';
import VoiceTutor from '../components/VoiceTutor';
import VaathiyaarMessage from '../components/VaathiyaarMessage';
import api, {
    getPlaygroundFiles, getPlaygroundFile, createPlaygroundFile,
    updatePlaygroundFile, deletePlaygroundFile,
} from '../api';
import { safeErrorMsg } from '../utils/errorUtils';
import {
    Sparkles, Zap, Play, Trash2, Send, Terminal, Loader2, Mic,
    Save, FolderOpen, FilePlus2, Pencil, Check, X,
} from 'lucide-react';
import { Button, Badge, Modal, Drawer, Input } from '../components/ui';

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

    // CodeMirror defers external `value` updates behind a typing latch driven by
    // a 1ms setInterval; in hidden/throttled tabs that latch can take minutes to
    // expire, so programmatic content swaps (file load, Vaathiyaar inject,
    // restore) silently never render. Bumping this key remounts the editor with
    // the new doc, bypassing the latch. Typing never bumps it.
    const [docVersion, setDocVersion] = useState(0);
    const replaceCode = (val) => {
        setCode(val);
        setDocVersion((v) => v + 1);
    };

    // ── F2: autosave the editor buffer to localStorage so a refresh never loses
    // work. Scoped per user (two accounts in one browser don't see each other's
    // buffer). Private-browsing / disabled storage degrades silently. Server-side
    // snippet storage is out of scope for this change.
    const [restoredSession, setRestoredSession] = useState(false);
    const hydratedRef = useRef(false);
    const bufferKey = user?.id ? `pm_playground_code_${user.id}` : null;
    const readBuffer = (key) => { try { return key ? localStorage.getItem(key) : null; } catch { return null; } };
    const writeBuffer = (key, val) => {
        try { if (!key) return; if (val) localStorage.setItem(key, val); else localStorage.removeItem(key); } catch { /* storage unavailable */ }
    };
    // Restore once, when the user is known — but never clobber code already injected
    // from a Vaathiyaar demo deep-link.
    useEffect(() => {
        if (!user?.id || hydratedRef.current) return;
        const saved = readBuffer(`pm_playground_code_${user.id}`);
        if (saved && !code.trim()) {
            replaceCode(saved);
            setRestoredSession(true);
        }
        hydratedRef.current = true;
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    // Debounced save on every edit (only after the initial restore has run, so the
    // empty initial state can't overwrite a saved buffer before it's read).
    useEffect(() => {
        if (!user?.id || !hydratedRef.current) return;
        const t = setTimeout(() => writeBuffer(`pm_playground_code_${user.id}`, code), 600);
        return () => clearTimeout(t);
    }, [code, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Saved files: server-side named files (Save / Save as… / My Files).
    // localStorage autosave above stays as the unsaved-draft layer.
    const [currentFile, setCurrentFile] = useState(null); // {id, name} of loaded file
    const [savedCode, setSavedCode] = useState(null);     // code as last persisted
    const [saving, setSaving] = useState(false);
    const [saveAsOpen, setSaveAsOpen] = useState(false);
    const [saveAsName, setSaveAsName] = useState('');
    const [filesOpen, setFilesOpen] = useState(false);
    const [files, setFiles] = useState(null);             // null = loading
    const [filesError, setFilesError] = useState('');
    const [renamingId, setRenamingId] = useState(null);
    const [renameText, setRenameText] = useState('');
    const [notice, setNotice] = useState(null);           // {text, kind} transient banner
    const noticeTimer = useRef(null);
    const dirty = currentFile ? code !== savedCode : false;

    const showNotice = (text, kind = 'ok') => {
        setNotice({ text, kind });
        clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), 3500);
    };
    useEffect(() => () => clearTimeout(noticeTimer.current), []);

    const loadFiles = async () => {
        setFilesError('');
        try {
            const r = await getPlaygroundFiles();
            setFiles(r.data.files);
        } catch (err) {
            setFilesError(safeErrorMsg(err, 'Could not load your files'));
            setFiles([]);
        }
    };
    const openFilesDrawer = () => { setFilesOpen(true); setFiles(null); loadFiles(); };

    const openSaveAs = () => {
        setSaveAsName(currentFile?.name || 'my_script.py');
        setSaveAsOpen(true);
    };

    const handleSave = async () => {
        if (!code.trim() || saving) return;
        if (!currentFile) { openSaveAs(); return; }
        setSaving(true);
        try {
            await updatePlaygroundFile(currentFile.id, { code });
            setSavedCode(code);
            showNotice(`Saved “${currentFile.name}”`);
        } catch (err) {
            if (err?.response?.status === 404) {
                // File was deleted elsewhere — fall back to Save as…
                setCurrentFile(null);
                setSavedCode(null);
                openSaveAs();
            } else {
                showNotice(safeErrorMsg(err, 'Save failed'), 'error');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleSaveAs = async (e) => {
        e?.preventDefault?.();
        const name = saveAsName.trim();
        if (!name || saving) return;
        setSaving(true);
        try {
            const r = await createPlaygroundFile({ name, code });
            setCurrentFile({ id: r.data.file.id, name: r.data.file.name });
            setSavedCode(code);
            setSaveAsOpen(false);
            showNotice(`Saved “${r.data.file.name}”`);
        } catch (err) {
            showNotice(safeErrorMsg(err, 'Save failed'), 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleLoadFile = async (f) => {
        const unsaved = currentFile ? dirty : !!code.trim();
        if (unsaved && !window.confirm(`Open “${f.name}”? Unsaved changes in the editor will be lost.`)) return;
        try {
            const r = await getPlaygroundFile(f.id);
            replaceCode(r.data.file.code);
            setCurrentFile({ id: r.data.file.id, name: r.data.file.name });
            setSavedCode(r.data.file.code);
            setFilesOpen(false);
            setOutput('');
            setExecutionTime(null);
        } catch (err) {
            showNotice(safeErrorMsg(err, 'Could not open the file'), 'error');
            loadFiles(); // it may have been deleted elsewhere — refresh the list
        }
    };

    const startRename = (f) => { setRenamingId(f.id); setRenameText(f.name); };
    const commitRename = async (f) => {
        const name = renameText.trim();
        setRenamingId(null);
        if (!name || name === f.name) return;
        try {
            const r = await updatePlaygroundFile(f.id, { name });
            const newName = r.data.file.name;
            setFiles((fs) => (fs || []).map((x) => (x.id === f.id ? { ...x, name: newName } : x)));
            if (currentFile?.id === f.id) setCurrentFile((c) => ({ ...c, name: newName }));
        } catch (err) {
            showNotice(safeErrorMsg(err, 'Rename failed'), 'error');
        }
    };

    const handleDeleteFile = async (f) => {
        if (!window.confirm(`Delete “${f.name}”? This cannot be undone.`)) return;
        try {
            await deletePlaygroundFile(f.id);
            setFiles((fs) => (fs || []).filter((x) => x.id !== f.id));
            if (currentFile?.id === f.id) { setCurrentFile(null); setSavedCode(null); }
        } catch (err) {
            showNotice(safeErrorMsg(err, 'Delete failed'), 'error');
        }
    };

    const fmtWhen = (ts) => {
        if (!ts) return '';
        const s = String(ts);
        const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
        if (Number.isNaN(d.getTime())) return s;
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    const fmtSize = (bytes) => {
        if (bytes == null) return '';
        return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    };

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
            replaceCode(injected);
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
        replaceCode('');
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

            {/* F2: tell the learner their buffer was restored (autosave isn't silent). */}
            {restoredSession && (
                <div
                    role="status"
                    className="mt-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 flex items-center justify-between gap-3"
                >
                    <span>Restored your last session’s code.</span>
                    <button
                        onClick={() => setRestoredSession(false)}
                        className="text-cyan-300 hover:text-cyan-100 underline underline-offset-2"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Transient save/load feedback (errors stay until replaced or timed out). */}
            {notice && (
                <div
                    role="status"
                    className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
                        notice.kind === 'error'
                            ? 'border-red-500/40 bg-red-500/10 text-red-300'
                            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    }`}
                >
                    {notice.text}
                </div>
            )}

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
                            <span className="text-xs font-semibold text-code-foreground/70 ml-2 flex items-center gap-1.5 min-w-0">
                                <Terminal size={12} className="flex-shrink-0" />
                                <span className="truncate max-w-[10rem] sm:max-w-[16rem]">{currentFile?.name || 'code.py'}</span>
                                {dirty && (
                                    <span
                                        className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"
                                        title="Unsaved changes"
                                        aria-label="Unsaved changes"
                                    />
                                )}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={handleSave}
                                disabled={saving || !code.trim() || (currentFile && !dirty)}
                                title={currentFile ? `Save changes to ${currentFile.name}` : 'Save this code as a file'}
                                className="flex items-center gap-1 text-[10px] font-semibold text-code-foreground/70 bg-white/5 border border-white/10 rounded-lg px-2 py-1 hover:bg-white/10 hover:text-code-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                                Save
                            </button>
                            <button
                                onClick={openSaveAs}
                                disabled={saving || !code.trim()}
                                title="Save as a new file"
                                className="flex items-center gap-1 text-[10px] font-semibold text-code-foreground/70 bg-white/5 border border-white/10 rounded-lg px-2 py-1 hover:bg-white/10 hover:text-code-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <FilePlus2 size={11} />
                                <span className="hidden sm:inline">Save as</span>
                            </button>
                            <button
                                onClick={openFilesDrawer}
                                title="Browse your saved files"
                                className="flex items-center gap-1 text-[10px] font-semibold text-code-foreground/70 bg-white/5 border border-white/10 rounded-lg px-2 py-1 hover:bg-white/10 hover:text-code-foreground transition-all"
                            >
                                <FolderOpen size={11} />
                                <span className="hidden sm:inline">My files</span>
                            </button>
                            <span className="text-[10px] text-code-foreground/50 font-mono ml-1">Python 3</span>
                        </div>
                    </div>

                    {/* Two-column body: code editor on the LEFT, output on the RIGHT.
                        Side-by-side on desktop (≥lg); stacks vertically on smaller
                        screens so the editor never collapses to a sliver. */}
                    <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
                        {/* Left column — editor + toolbar + package installer */}
                        <div className="flex flex-col min-h-0 flex-1 lg:w-3/5 lg:border-r border-border-strong">
                            <div className="flex-1 min-h-[180px] overflow-hidden">
                                <PythonEditor
                                    key={docVersion}
                                    value={code}
                                    onChange={setCode}
                                    onRun={handleRunCode}
                                    height="100%"
                                    placeholder="# Write Python code here...&#10;# Press Ctrl+Enter to run"
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
                                    <span className="hidden sm:inline">Send to Vaathiyaar</span>
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

                        {/* Right column — output pane */}
                        <div className="flex flex-col min-h-0 flex-1 lg:w-2/5 border-t lg:border-t-0 border-border-strong surface-code">
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
                    </div>
                </div>
            </div>

            {/* ── Save as… modal ──────────────────────────────────────────── */}
            <Modal open={saveAsOpen} onClose={() => setSaveAsOpen(false)} title="Save file as">
                <form onSubmit={handleSaveAs} className="space-y-4">
                    <Input
                        value={saveAsName}
                        onChange={(e) => setSaveAsName(e.target.value)}
                        placeholder="my_script.py"
                        aria-label="File name"
                        maxLength={100}
                        autoFocus
                    />
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setSaveAsOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" size="sm" disabled={!saveAsName.trim() || saving}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* ── My files drawer ─────────────────────────────────────────── */}
            <Drawer open={filesOpen} onClose={() => setFilesOpen(false)} title="My files">
                {files === null ? (
                    <div className="flex items-center gap-2 text-sm text-text-muted py-6 justify-center">
                        <Loader2 size={16} className="animate-spin" />
                        Loading…
                    </div>
                ) : files.length === 0 ? (
                    <p className="text-sm text-text-muted">
                        {filesError || 'No saved files yet — write some code and hit Save.'}
                    </p>
                ) : (
                    <>
                        <ul className="space-y-2">
                            {files.map((f) => (
                                <li key={f.id} className="rounded-xl border border-border-default bg-bg-elevated/40 px-3 py-2.5">
                                    {renamingId === f.id ? (
                                        <form
                                            onSubmit={(e) => { e.preventDefault(); commitRename(f); }}
                                            className="flex items-center gap-1.5"
                                        >
                                            <Input
                                                value={renameText}
                                                onChange={(e) => setRenameText(e.target.value)}
                                                aria-label={`New name for ${f.name}`}
                                                maxLength={100}
                                                autoFocus
                                                className="text-sm py-1.5"
                                            />
                                            <Button type="submit" variant="ghost" size="icon" aria-label="Confirm rename">
                                                <Check size={14} />
                                            </Button>
                                            <Button type="button" variant="ghost" size="icon" aria-label="Cancel rename" onClick={() => setRenamingId(null)}>
                                                <X size={14} />
                                            </Button>
                                        </form>
                                    ) : (
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => handleLoadFile(f)}
                                                className="min-w-0 flex-1 text-left group"
                                                title={`Open ${f.name}`}
                                            >
                                                <span className="block text-sm font-semibold text-text-primary truncate group-hover:text-accent-primary transition-colors">
                                                    {f.name}
                                                </span>
                                                <span className="block text-[11px] text-text-muted">
                                                    {fmtWhen(f.updated_at)} · {fmtSize(f.size)}
                                                </span>
                                            </button>
                                            {currentFile?.id === f.id && <Badge variant="success">Open</Badge>}
                                            <Button variant="ghost" size="icon" aria-label={`Rename ${f.name}`} onClick={() => startRename(f)}>
                                                <Pencil size={14} />
                                            </Button>
                                            <Button variant="ghost" size="icon" aria-label={`Delete ${f.name}`} onClick={() => handleDeleteFile(f)}>
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                        <p className="mt-3 text-[11px] text-text-muted">{files.length}/50 files</p>
                    </>
                )}
            </Drawer>

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
