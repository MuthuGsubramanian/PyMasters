import { Component, useCallback, useState, lazy, Suspense } from 'react';

// ── Fallback editor — always available, no external dependencies ────────────
function FallbackEditor({ value, onChange, onRun, placeholder, height, readOnly }) {
    return (
        <div className="relative rounded-lg overflow-hidden border border-slate-700/50" style={{ height }}>
            <div className="flex items-center justify-between px-3 py-1 bg-[#161b22] border-b border-slate-700/50">
                <span className="text-[10px] text-slate-500 font-mono">Python</span>
                <span className="text-[10px] text-slate-600 font-mono">Ctrl+Enter to run</span>
            </div>
            <textarea
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
        const { keymap } = await import('@codemirror/view');
        const { indentUnit } = await import('@codemirror/language');

        const CodeMirror = mod.default;

        function CMEditor({ value, onChange, onRun, readOnly, height, placeholder }) {
            const handleChange = useCallback((val) => onChange?.(val), [onChange]);

            const runKeymap = keymap.of([{
                key: 'Mod-Enter',
                run: () => { onRun?.(); return true; },
            }]);

            return (
                <CodeMirror
                    value={value}
                    onChange={handleChange}
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
                    extensions={[python(), indentUnit.of('    '), runKeymap]}
                    className="rounded-lg overflow-hidden border border-slate-700/50 text-sm"
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
export default function PythonEditor(props) {
    const [cmFailed, setCmFailed] = useState(false);

    if (cmFailed) {
        return <FallbackEditor {...props} />;
    }

    return (
        <EditorErrorBoundary
            onError={() => setCmFailed(true)}
            fallback={<FallbackEditor {...props} />}
        >
            <Suspense fallback={<FallbackEditor {...props} />}>
                <CodeMirrorEditor {...props} />
            </Suspense>
        </EditorErrorBoundary>
    );
}
