import { Component, useCallback, useState, useRef, lazy, Suspense } from 'react';

const PYTHON_QUICK_SYMBOLS = [
    { label: ':', insert: ':', cursorOffset: 1 },
    { label: '()', insert: '()', cursorOffset: 1 },
    { label: '[]', insert: '[]', cursorOffset: 1 },
    { label: '_', insert: '_', cursorOffset: 1 },
    { label: 'Tab', insert: '    ', cursorOffset: 4 },
    { label: '=', insert: ' = ', cursorOffset: 3 },
    { label: '->', insert: ' -> ', cursorOffset: 4 },
];

export function insertPythonSymbol(value, selectionStart, selectionEnd, sym) {
    const start = Math.max(0, selectionStart ?? value.length);
    const end = Math.max(start, selectionEnd ?? start);
    const nextValue = value.slice(0, start) + sym.insert + value.slice(end);
    const nextCursor = start + (sym.cursorOffset ?? sym.insert.length);
    return { nextValue, nextCursor };
}

// ── Fallback editor — always available, no external dependencies ────────────
function FallbackEditor({ value, onChange, onRun, placeholder, height, readOnly, textareaRef }) {
    return (
        <div className="relative rounded-lg overflow-hidden border border-slate-700/50" style={{ height }}>
            <div className="flex items-center justify-between px-3 py-1 bg-[#161b22] border-b border-slate-700/50">
                <span className="text-xs text-slate-400 font-mono">Python</span>
                <span className="text-xs text-slate-500 font-mono">Ctrl+Enter to run</span>
            </div>
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange?.(e.target.value)}
                onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        onRun?.();
                    }
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        const { selectionStart, selectionEnd } = e.target;
                        const newVal = value.substring(0, selectionStart) + '    ' + value.substring(selectionEnd);
                        onChange?.(newVal);
                        requestAnimationFrame(() => {
                            e.target.selectionStart = selectionStart + 4;
                            e.target.selectionEnd = selectionStart + 4;
                        });
                    }
                }}
                readOnly={readOnly}
                spellCheck={false}
                placeholder={placeholder}
                className="w-full bg-[#0d1117] text-[#e6edf3] font-mono text-sm p-4 resize-none outline-none leading-relaxed"
                style={{ caretColor: '#39d353', tabSize: 4, height: 'calc(100% - 28px)' }}
            />
        </div>
    );
}

// ── Mini error boundary for CodeMirror ──────────────────────────────────────
class EditorErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch(error) {
        console.error('[PythonEditor] CodeMirror crashed, using fallback:', error);
        this.props.onError?.();
    }
    render() {
        if (this.state.hasError) return this.props.fallback || null;
        return this.props.children;
    }
}

// ── Lazy-load CodeMirror ────────────────────────────────────────────────────
const CodeMirrorEditor = lazy(() =>
    import('@uiw/react-codemirror').then(async (mod) => {
        const { python } = await import('@codemirror/lang-python');
        const { oneDark } = await import('@codemirror/theme-one-dark');
        const { keymap, EditorView } = await import('@codemirror/view');
        const { indentUnit } = await import('@codemirror/language');
        const { Prec } = await import('@codemirror/state');

        const CodeMirror = mod.default;

        function CMEditor({ value, onChange, onRun, readOnly, height, placeholder, viewRef }) {
            const handleChange = useCallback((val) => onChange?.(val), [onChange]);

            // Prec.highest: basicSetup's default keymap binds Mod-Enter to insertBlankLine, which otherwise
            // wins and Ctrl+Enter just adds a line instead of running.
            const runKeymap = Prec.highest(keymap.of([{
                key: 'Mod-Enter',
                run: () => { onRun?.(); return true; },
            }]));

            return (
                <CodeMirror
                    value={value}
                    onChange={handleChange}
                    onCreateEditor={(view) => {
                        if (viewRef) viewRef.current = view;
                    }}
                    height={height}
                    theme={oneDark}
                    readOnly={readOnly}
                    placeholder={placeholder}
                    basicSetup={{
                        lineNumbers: true,
                        highlightActiveLineGutter: true,
                        highlightActiveLine: true,
                        bracketMatching: true,
                        closeBrackets: true,
                        autocompletion: false,
                        foldGutter: false,
                        tabSize: 4,
                    }}
                    extensions={[python(), indentUnit.of('    '), EditorView.lineWrapping, runKeymap]}
                    // A % height applies to .cm-editor inside the library's own wrapper div; that wrapper must
                    // fill its parent too, or the editor collapses to its content (47px on a phone, 2026-11-03).
                    className={`rounded-lg overflow-hidden border border-slate-700/50 text-sm ${String(height).endsWith('%') ? 'h-full' : ''}`}
                />
            );
        }

        return { default: CMEditor };
    }).catch((err) => {
        console.error('[PythonEditor] Failed to load CodeMirror:', err);
        return { default: FallbackEditor };
    })
);

// ── Main export ─────────────────────────────────────────────────────────────
export default function PythonEditor({ showQuickSymbols = true, ...props }) {
    const [cmFailed, setCmFailed] = useState(false);
    const viewRef = useRef(null);
    const textareaRef = useRef(null);

    const handleInsertSymbol = useCallback((sym) => {
        if (props.readOnly) return;
        const view = viewRef.current;
        if (view && view.state && typeof view.dispatch === 'function') {
            const sel = view.state.selection.main;
            view.dispatch({
                changes: { from: sel.from, to: sel.to, insert: sym.insert },
                selection: { anchor: sel.from + (sym.cursorOffset ?? sym.insert.length) },
            });
            view.focus();
            return;
        }
        const el = textareaRef.current;
        const current = props.value ?? '';
        const isFocused = el && document.activeElement === el;
        const start = el && (isFocused || el.selectionStart > 0) ? el.selectionStart : current.length;
        const end = el && (isFocused || el.selectionEnd > 0) ? el.selectionEnd : start;
        const { nextValue, nextCursor } = insertPythonSymbol(current, start, end, sym);
        props.onChange?.(nextValue);
        if (el) {
            requestAnimationFrame(() => {
                el.focus();
                el.selectionStart = nextCursor;
                el.selectionEnd = nextCursor;
            });
        }
    }, [props]);

    const editorNode = cmFailed ? (
        <FallbackEditor {...props} textareaRef={textareaRef} />
    ) : (
        <EditorErrorBoundary
            onError={() => setCmFailed(true)}
            fallback={<FallbackEditor {...props} textareaRef={textareaRef} />}
        >
            <Suspense fallback={<FallbackEditor {...props} textareaRef={textareaRef} />}>
                <CodeMirrorEditor {...props} viewRef={viewRef} textareaRef={textareaRef} />
            </Suspense>
        </EditorErrorBoundary>
    );

    if (!showQuickSymbols || props.readOnly) {
        return editorNode;
    }

    return (
        <div className="flex flex-col">
            {editorNode}
            {/* Sticky Python quick-symbol bar above mobile keyboard */}
            <div
                role="toolbar"
                aria-label="Python quick symbols"
                data-testid="python-quick-symbols"
                className="lg:hidden sticky bottom-0 z-20 flex items-center gap-1.5 px-2.5 py-2 bg-[#161b22] border-t border-slate-700/60 overflow-x-auto"
            >
                {PYTHON_QUICK_SYMBOLS.map((sym) => (
                    <button
                        key={sym.label}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleInsertSymbol(sym)}
                        aria-label={`Insert ${sym.label}`}
                        className="min-w-10 min-h-9 px-2.5 py-1 rounded-lg bg-[#0d1117] border border-slate-700/80 text-slate-200 hover:border-cyan-400/60 hover:text-cyan-300 font-mono text-xs font-semibold shrink-0 active:scale-95 transition-transform"
                    >
                        {sym.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
