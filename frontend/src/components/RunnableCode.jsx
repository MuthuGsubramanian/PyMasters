import { useState, useRef } from 'react';
import { Play, Loader2, Check, X, Copy, Target } from 'lucide-react';
import api from '../api';
import ErrorExplainer from './ErrorExplainer';
import { comparePrediction, recordPrediction } from '../utils/predict';

// Flatten ReactMarkdown's `children` (string | node | node[]) to raw code text.
function flattenText(node) {
    if (node == null) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(flattenText).join('');
    if (typeof node === 'object' && node.props) return flattenText(node.props.children);
    return String(node);
}

// Modules the hardened sandbox can actually import: Python stdlib commons plus
// the few third-party packages baked into the image (numpy, requests, httpx).
// We WHITELIST rather than blacklist because Trending/AI snippets pull an
// open-ended set of exotic libs (torch, diffusers, flwr, langchain, pandas…)
// that aren't installed — running them would ModuleNotFoundError. Any import
// outside this set makes the block read-only (still copy-able).
const SANDBOX_MODULES = new Set([
    // stdlib
    'os', 'sys', 'math', 'cmath', 'random', 'json', 're', 'collections', 'itertools',
    'functools', 'datetime', 'time', 'string', 'typing', 'dataclasses', 'enum',
    'pathlib', 'csv', 'io', 'abc', 'copy', 'heapq', 'bisect', 'decimal', 'fractions',
    'statistics', 'threading', 'asyncio', 'multiprocessing', 'queue', 'socket',
    'struct', 'hashlib', 'hmac', 'base64', 'uuid', 'secrets', 'textwrap', 'pprint',
    'operator', 'contextlib', 'warnings', 'traceback', 'unittest', 'argparse',
    'logging', 'subprocess', 'sqlite3', 'urllib', 'http', 'xml', 'html', 'glob',
    'shutil', 'tempfile', 'zipfile', 'tarfile', 'gzip', 'array', 'types', 'weakref',
    'inspect', 'importlib', '__future__', 'numbers', 'calendar', 'zoneinfo', 'difflib',
    // installed in the image
    'numpy', 'np', 'requests', 'httpx',
]);
function importsAllAvailable(code) {
    const re = /^\s*(?:import\s+([\w.]+)|from\s+([\w.]+)\s+import)/gm;
    let m;
    while ((m = re.exec(code))) {
        const root = (m[1] || m[2]).split('.')[0];
        if (!SANDBOX_MODULES.has(root)) return false;
    }
    return true;
}

// Earlier blocks run first as setup, but silently: the learner should only see (and predict) the
// output of the block they clicked. SETUP_LINES = lines the wrapper adds before their code.
const SETUP_LINES = 4;
function withSilentPrelude(prelude, code) {
    return 'import contextlib as _pm_cl, io as _pm_io\n'
        + 'with _pm_cl.redirect_stdout(_pm_io.StringIO()):\n'
        + `    try: exec(${JSON.stringify(prelude)})\n`
        + '    except Exception: pass\n'
        + code;
}
// Map traceback line numbers back to the block the learner is looking at.
const shiftLines = (text, offset) => (offset
    ? text.replace(/(File "[^"]*main\.py", line )(\d+)/g, (_, pre, n) => `${pre}${Math.max(1, Number(n) - offset)}`)
    : text);

// Reference cards frequently show *cheatsheets* — bare operator or keyword
// listings (`+ - * / // % **`, `== != < >`, `and or not`) that aren't valid
// programs. Running them SyntaxErrors, so treat any block containing such a
// line as read-only.
const _OP = '[+\\-*/%@<>=!&|^~.]';
const OPERATOR_ONLY_LINE = new RegExp(`^${_OP}+(\\s+${_OP}+)+$`);
const KEYWORD = '(?:and|or|not|is|in|True|False|None|pass|break|continue|del|global|nonlocal)';
const KEYWORD_ONLY_LINE = new RegExp(`^${KEYWORD}(\\s+${KEYWORD})+$`);
function looksLikeCheatsheet(code) {
    for (const raw of code.split('\n')) {
        const line = raw.replace(/#.*$/, '').trim();
        if (!line) continue;
        if (OPERATOR_ONLY_LINE.test(line) || KEYWORD_ONLY_LINE.test(line)) return true;
    }
    return false;
}

// Heuristic: is this fenced block Python we can meaningfully run in the sandbox?
// Skip shell/output/pip transcripts, cheatsheets, heavy-dep imports, trivial.
function isRunnablePython(code, className) {
    const cls = (className || '').toLowerCase();
    if (/language-(bash|sh|shell|text|json|html|css|js|javascript|sql|output|console)/.test(cls)) return false;
    const trimmed = code.trim();
    if (!trimmed || trimmed.length < 6 || !trimmed.includes('\n') && !/[=(:]/.test(trimmed)) return false;
    // Transcript / REPL / shell lines we shouldn't execute verbatim
    if (/^(\$|>>>|\.\.\.|pip |python |# output|# =>)/m.test(trimmed) && !/\bprint\s*\(/.test(trimmed)) return false;
    // Dockerfile / config directives mislabeled as python (Trending snippets
    // are all tagged python in the modal, so FROM/RUN/COPY etc. slip through)
    if (/^(FROM|WORKDIR|COPY|RUN|CMD|ENTRYPOINT|EXPOSE|ENV|ADD|ARG|LABEL|VOLUME|USER|HEALTHCHECK|version:|services:|apiVersion:)\s/m.test(trimmed)) return false;
    // Imports a module the sandbox doesn't have → read-only
    if (!importsAllAvailable(trimmed)) return false;
    // Operator/keyword cheatsheet → read-only
    if (looksLikeCheatsheet(trimmed)) return false;
    // Looks Pythonic: explicit tag, or common Python constructs
    if (/language-(python|py)/.test(cls)) return true;
    return /\b(print|def|import|for|while|if|class|lambda|return|=)\b/.test(trimmed);
}

/**
 * A lesson code block that can be executed inline in the shared sandbox.
 * Turns passive reading into active experimentation — the distinctive bit is
 * that the *exact* example a learner is reading is one click from running,
 * without leaving the lesson for the Playground. Falls back to a plain
 * <pre> for non-runnable blocks (shell transcripts, output, other languages).
 *
 * `dark` picks the palette so it reads on both the Vaathiyaar story card
 * (dark) and the light content sections.
 *
 * Two entry points:
 *  - markdown: pass `children` + `className` (fenced ```python blocks).
 *  - raw string: pass `code` + optional `language` (Reference `CodeBlock`,
 *    Trending snippet modal). `label` overrides the shown language; `copy`
 *    adds a copy-to-clipboard button (preserves Reference's affordance).
 */
export default function RunnableCode({ children, className, code: rawCode, language, dark = false, copy = false, predict = false }) {
    const code = (rawCode != null ? rawCode : flattenText(children)).replace(/\n$/, '');
    const runnable = isRunnablePython(code, className || (language ? `language-${language}` : ''));

    const rootRef = useRef(null);
    const [state, setState] = useState('idle'); // idle | running | done | error
    const [output, setOutput] = useState('');
    const [copied, setCopied] = useState(false);
    // Predict-then-run: null (off) | 'open' (writing a guess) | { ...comparePrediction, stats, errorType }
    const [predicting, setPredicting] = useState(null);
    const [guess, setGuess] = useState('');
    const canPredict = predict && /\bprint\s*\(/.test(code);

    const doCopy = () => {
        try {
            navigator.clipboard?.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard unavailable — no-op */ }
    };

    // Lesson code blocks are usually CUMULATIVE — a later `print(b.shape)`
    // depends on `b = np.array(...)` defined in an earlier block. Running a
    // block in isolation would NameError. So we prepend the code of every
    // earlier runnable block within the same lesson section (marked with
    // data-runcode-scope) as setup (silently - see withSilentPrelude). Redefinition
    // is harmless in Python, and chat answers (no scope wrapper) run standalone.
    const buildFullCode = () => {
        const scope = rootRef.current?.closest('[data-runcode-scope]');
        if (!scope) return { source: code, offset: 0 };
        const roots = [...scope.querySelectorAll('[data-runnable-code]')];
        const idx = roots.indexOf(rootRef.current);
        if (idx <= 0) return { source: code, offset: 0 };
        const prelude = roots
            .slice(0, idx)
            .map((r) => r.querySelector('pre')?.textContent || '')
            .filter(Boolean)
            .join('\n');
        return prelude ? { source: withSilentPrelude(prelude, code), offset: SETUP_LINES } : { source: code, offset: 0 };
    };

    const run = async (prediction = null) => {
        if (state === 'running') return;
        setState('running');
        setOutput('');
        try {
            const { source, offset } = buildFullCode();
            // Lesson blocks tag failed runs with the lesson id for the misconception radar.
            const lessonId = predict ? (window.location.pathname.match(/\/classroom\/([\w-]+)/) || [])[1] : undefined;
            const res = await api.post('/playground/execute', { code: source, lesson_id: lessonId });
            const data = res.data || {};
            const out = shiftLines(data.output || '(No output)', offset);
            setOutput(out);
            setState(data.exit_code === 0 ? 'done' : 'error');
            if (prediction !== null) {
                const err = (data.error || '').trim();
                const printed = err ? (data.output || '').replace(err, '').trim() : (data.output || '');
                const errorType = data.exit_code === 0 ? null
                    : ((err.split('\n').pop() || '').match(/^(\w+(?:Error|Exception))/) || [])[1] || null;
                const result = comparePrediction(prediction, printed === '(No output)' ? '' : printed, errorType);
                setPredicting({ ...result, errorType, stats: recordPrediction(result.exact) });
            }
        } catch (e) {
            // 402 (trial lapsed) is handled by the global interceptor → redirect;
            // anything else shows a calm inline message.
            const msg = e?.response?.status === 429
                ? 'Slow down a moment — too many runs. Try again shortly.'
                : 'Could not reach the sandbox. Please try again.';
            setOutput(msg);
            setState('error');
            if (prediction !== null) setPredicting(null);
        }
    };

    const preCls = dark
        ? 'surface-code p-3 rounded-lg text-xs font-mono overflow-x-auto border border-white/[0.06]'
        : 'surface-code p-3 rounded-lg text-xs font-mono overflow-x-auto';

    const codeBody = rawCode != null
        ? <code className="whitespace-pre">{code}</code>
        : <code>{children}</code>;

    const copyBtn = copy ? (
        <button
            type="button"
            onClick={doCopy}
            aria-label="Copy code"
            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-1 rounded-md text-slate-400 hover:text-slate-200 transition-colors"
        >
            {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
        </button>
    ) : null;

    if (!runnable) {
        // Non-Python / shell / output — keep it read-only, but still offer copy
        // when a raw snippet asked for it (Reference/Trending affordance parity).
        if (copy) {
            return (
                <div className={`my-3 rounded-lg overflow-hidden border border-white/[0.08] shadow-sm`}>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-black/30 border-b border-white/[0.06]">
                        <span className="text-[10px] font-mono text-slate-400">{language || 'code'}</span>
                        <span className="ml-auto">{copyBtn}</span>
                    </div>
                    <pre className={`${preCls} rounded-none border-0 my-0`}>{codeBody}</pre>
                </div>
            );
        }
        return <pre className={`${preCls} my-2`}>{codeBody}</pre>;
    }

    return (
        <div ref={rootRef} data-runnable-code className="my-3 rounded-lg overflow-hidden border border-white/[0.08] shadow-sm">
            {/* Header: filename dots + copy + Run button */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/30 border-b border-white/[0.06]">
                <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
                </div>
                <span className="text-[10px] font-mono text-slate-400 ml-1">{language || 'python'}</span>
                <div className="ml-auto flex items-center gap-1">
                    {copyBtn}
                    {canPredict && (
                        <button
                            type="button"
                            onClick={() => { setPredicting('open'); setGuess(''); }}
                            disabled={state === 'running'}
                            title="Guess the output first, then run to check"
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md bg-violet-500/80 hover:bg-violet-500 text-white disabled:opacity-60 transition-colors"
                        >
                            <Target size={12} /> Predict
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => { setPredicting(null); run(); }}
                        disabled={state === 'running'}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md bg-green-500/90 hover:bg-green-500 text-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                        {state === 'running'
                            ? <><Loader2 size={12} className="animate-spin" /> Running…</>
                            : <><Play size={12} fill="currentColor" /> Run</>}
                    </button>
                </div>
            </div>

            {/* Code */}
            <pre className={`${preCls} rounded-none border-0 my-0`}>{codeBody}</pre>

            {/* Predict-then-run: commit to a guess before seeing the output */}
            {predicting === 'open' && (
                <div className="border-t border-white/[0.06] bg-slate-900 px-3 py-2.5 border-l-2 border-l-violet-400">
                    <label className="block text-[11px] font-semibold text-violet-200 mb-1.5" htmlFor={`guess-${code.length}`}>
                        What will this print? Write it exactly, one line per line of output (or name the error).
                    </label>
                    <textarea
                        id={`guess-${code.length}`}
                        value={guess}
                        onChange={(e) => setGuess(e.target.value)}
                        rows={Math.min(6, Math.max(2, guess.split('\n').length))}
                        autoFocus
                        className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-violet-400"
                        placeholder="e.g. 6"
                    />
                    <div className="mt-2 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => run(guess)}
                            disabled={!guess.trim() || state === 'running'}
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md bg-violet-500 hover:bg-violet-400 text-white disabled:opacity-50 transition-colors"
                        >
                            <Play size={12} fill="currentColor" /> Run &amp; check
                        </button>
                        <button type="button" onClick={() => setPredicting(null)} className="text-[11px] text-slate-400 hover:text-slate-200">Cancel</button>
                    </div>
                </div>
            )}
            {predicting && predicting !== 'open' && state !== 'running' && (
                <div className={`border-t border-white/[0.06] bg-slate-900 border-l-2 px-3 py-2.5 text-xs ${predicting.exact ? 'border-l-green-400' : 'border-l-amber-400'}`} role="status">
                    <div className={`font-bold ${predicting.exact ? 'text-green-300' : 'text-amber-300'}`}>
                        {predicting.exact
                            ? (predicting.errorType ? `Spot on - you saw the ${predicting.errorType} coming.` : 'Spot on - your prediction matched exactly.')
                            : predicting.errorType
                                ? `Not quite - this stops with ${predicting.errorType}.`
                                : `${predicting.matched} of ${predicting.total} line${predicting.total === 1 ? '' : 's'} right.`}
                    </div>
                    {!predicting.exact && !predicting.errorType && (
                        <table className="mt-1.5 font-mono text-[11.5px]">
                            <thead><tr className="text-slate-400"><th className="pr-4 text-left font-normal">Your guess</th><th className="text-left font-normal">Actual</th></tr></thead>
                            <tbody>
                                {predicting.lines.filter((l) => !l.ok).slice(0, 5).map((l, k) => (
                                    <tr key={k}><td className="pr-4 text-red-300">{l.got || '(nothing)'}</td><td className="text-green-300">{l.expected || '(nothing)'}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    <div className="mt-1 text-[11px] text-slate-400">
                        Prediction accuracy {predicting.stats.correct}/{predicting.stats.tries}
                        {predicting.stats.streak > 1 ? ` - ${predicting.stats.streak} in a row` : ''}
                    </div>
                </div>
            )}

            {/* Output */}
            {state !== 'idle' && (
                <div className="border-t border-white/[0.06] bg-slate-950">
                    <div className="flex items-center gap-1.5 px-3 pt-2 text-[10px] font-bold uppercase tracking-wider">
                        {state === 'running' && <span className="text-slate-400">Executing…</span>}
                        {state === 'done' && <><Check size={11} className="text-green-400" /><span className="text-green-400">Output</span></>}
                        {state === 'error' && <><X size={11} className="text-red-400" /><span className="text-red-400">Output</span></>}
                    </div>
                    <pre className="px-3 py-2 text-xs font-mono text-slate-200 whitespace-pre-wrap max-h-48 overflow-auto">
                        {state === 'running'
                            ? 'The sandbox may take a few seconds to warm up on the first run…'
                            : output}
                    </pre>
                    {state === 'error' && <ErrorExplainer text={output} className="mx-3 mb-3 mt-0" />}
                </div>
            )}
        </div>
    );
}
