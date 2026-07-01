import { useEffect, useRef, useState } from 'react';
import { Trash2, Sparkles, Loader2 } from 'lucide-react';

function isErrorOutput(text) {
    if (!text) return false;
    // Match Python tracebacks/exceptions AND the backend's own execution
    // sentinels. Timeouts ("Execution timed out…"), subprocess failures
    // ("Execution failed…") and rate-limit notices were previously rendered
    // as green "success" with no help affordance — treat them as errors too.
    return /^(Traceback|.*Error:|.*Exception:|Execution error|Execution failed|Execution timed out|Security Error|Rate limit reached)/m.test(text);
}

export default function OutputPanel({
    output,
    error,
    running,
    executionTime,
    onClear,
    onAskAI,
    code,
}) {
    const scrollRef = useRef(null);
    // After a few seconds of an in-flight run, surface a "warming up" hint. The
    // first execution of a session can be slow while the backend sandbox cold-starts.
    const [slowRun, setSlowRun] = useState(false);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [output, error]);

    useEffect(() => {
        if (!running) {
            setSlowRun(false);
            return;
        }
        const t = setTimeout(() => setSlowRun(true), 3000);
        return () => clearTimeout(t);
    }, [running]);

    const hasError = isErrorOutput(output) || isErrorOutput(error);
    const displayText = [output, error].filter(Boolean).join('\n');

    return (
        <div className="flex flex-col h-full">
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-1.5 bg-[#161b22] border-b border-slate-700/50">
                <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-amber-400 animate-pulse' : hasError ? 'bg-red-400' : 'bg-green-400'}`} />
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                        {running ? 'Running...' : 'Output'}
                    </span>
                    {executionTime != null && !running && (
                        <span className="text-[10px] text-slate-500 font-mono ml-2">
                            {executionTime < 1000 ? `${executionTime}ms` : `${(executionTime / 1000).toFixed(1)}s`}
                        </span>
                    )}
                </div>
                {displayText && !running && (
                    <button
                        onClick={onClear}
                        className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                        title="Clear output"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed bg-[#0d1117]">
                {running ? (
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-amber-400">
                            <Loader2 size={14} className="animate-spin" />
                            <span>Executing...</span>
                        </div>
                        {slowRun && (
                            <span className="text-[11px] text-slate-500 italic pl-6">
                                First run can take a few seconds while the sandbox warms up…
                            </span>
                        )}
                    </div>
                ) : displayText ? (
                    <>
                        <pre className={`whitespace-pre-wrap break-words ${hasError ? 'text-red-400' : 'text-green-400'}`}>
                            {displayText}
                        </pre>
                        {hasError && onAskAI && (
                            <button
                                onClick={() => onAskAI(code, displayText)}
                                className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium hover:bg-purple-500/20 transition-colors"
                            >
                                <Sparkles size={12} />
                                Ask Vaathiyaar for help
                            </button>
                        )}
                    </>
                ) : (
                    <span className="text-slate-600 italic">Run your code to see output here...</span>
                )}
            </div>
        </div>
    );
}
