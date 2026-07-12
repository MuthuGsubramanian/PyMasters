import { useState, useCallback, useRef } from 'react';
import { Play, Loader2, Check, X, Copy } from 'lucide-react';
import api from '../api';

// Flatten ReactMarkdown's `children` (string | node | node[]) to raw code text.
function flattenText(node) {
    if (node == null) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(flattenText).join('');
    if (typeof node === 'object' && node.props) return flattenText(node.props.children);
    return String(node);
}

// Libraries the hardened sandbox doesn't ship (heavy ML / web / cloud SDKs) or
// that need network/GPU. A snippet importing these would only ModuleNotFoundError
// or hang, so it stays read-only (still copy-able) rather than offering a Run
// that's guaranteed to fail. Kept deliberately conservative — stdlib, numpy,
// pandas, requests etc. remain runnable.
const UNAVAILABLE_IMPORTS = /\b(?:import|from)\s+(torch|tensorflow|keras|transformers|langchain\w*|openai|anthropic|sklearn|scipy|matplotlib|seaborn|sentence_transformers|chromadb|faiss|pinecone|llama_index|ollama|fastapi|flask|django|uvicorn|streamlit|gradio|boto3|google\.cloud|selenium|playwright|bs4|beautifulsoup4|scrapy|cv2|PIL|pytesseract|spacy|nltk|xgboost|lightgbm|polars|duckdb|sqlalchemy|redis|pymongo|psycopg2|websockets?)\b/;

// Heuristic: is this fenced block Python we can meaningfully run in the sandbox?
// Skip shell/output/pip transcripts, heavy-dep imports, and trivial snippets.
function isRunnablePython(code, className) {
    const cls = (className || '').toLowerCase();
    if (/language-(bash|sh|shell|text|json|html|css|js|javascript|sql|output|console)/.test(cls)) return false;
    const trimmed = code.trim();
    if (!trimmed || trimmed.length < 6 || !trimmed.includes('\n') && !/[=(:]/.test(trimmed)) return false;
    // Transcript / REPL / shell lines we shouldn't execute verbatim
    if (/^(\$|>>>|\.\.\.|pip |python |# output|# =>)/m.test(trimmed) && !/\bprint\s*\(/.test(trimmed)) return false;
    // Needs a library the sandbox doesn't have → read-only
    if (UNAVAILABLE_IMPORTS.test(trimmed)) return false;
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
export default function RunnableCode({ children, className, code: rawCode, language, dark = false, copy = false }) {
    const code = (rawCode != null ? rawCode : flattenText(children)).replace(/\n$/, '');
    const runnable = isRunnablePython(code, className || (language ? `language-${language}` : ''));

    const rootRef = useRef(null);
    const [state, setState] = useState('idle'); // idle | running | done | error
    const [output, setOutput] = useState('');
    const [copied, setCopied] = useState(false);

    const doCopy = useCallback(() => {
        try {
            navigator.clipboard?.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard unavailable — no-op */ }
    }, [code]);

    // Lesson code blocks are usually CUMULATIVE — a later `print(b.shape)`
    // depends on `b = np.array(...)` defined in an earlier block. Running a
    // block in isolation would NameError. So we prepend the code of every
    // earlier runnable block within the same lesson section (marked with
    // data-runcode-scope) as setup. Redefinition is harmless in Python, and
    // chat answers (no scope wrapper) run standalone, which is what we want.
    const buildFullCode = useCallback(() => {
        const scope = rootRef.current?.closest('[data-runcode-scope]');
        if (!scope) return code;
        const roots = [...scope.querySelectorAll('[data-runnable-code]')];
        const idx = roots.indexOf(rootRef.current);
        if (idx <= 0) return code;
        const prelude = roots
            .slice(0, idx)
            .map((r) => r.querySelector('pre')?.textContent || '')
            .filter(Boolean)
            .join('\n');
        return prelude ? `${prelude}\n${code}` : code;
    }, [code]);

    const run = useCallback(async () => {
        if (state === 'running') return;
        setState('running');
        setOutput('');
        try {
            const res = await api.post('/playground/execute', { code: buildFullCode() });
            const data = res.data || {};
            setOutput(data.output || '(No output)');
            setState(data.exit_code === 0 ? 'done' : 'error');
        } catch (e) {
            // 402 (trial lapsed) is handled by the global interceptor → redirect;
            // anything else shows a calm inline message.
            const msg = e?.response?.status === 429
                ? 'Slow down a moment — too many runs. Try again shortly.'
                : 'Could not reach the sandbox. Please try again.';
            setOutput(msg);
            setState('error');
        }
    }, [buildFullCode, state]);

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
                    <button
                        type="button"
                        onClick={run}
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

            {/* Output */}
            {state !== 'idle' && (
                <div className="border-t border-white/[0.06] bg-black/40">
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
                </div>
            )}
        </div>
    );
}
