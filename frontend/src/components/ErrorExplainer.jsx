import { Lightbulb } from 'lucide-react';
import { explainError } from '../utils/errorExplainer';

// "What happened / how to fix" card for a Python traceback (free, client-side).
export default function ErrorExplainer({ text, className = '' }) {
    const ex = explainError(text);
    if (!ex) return null;
    return (
        <div className={`mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs leading-relaxed ${className}`}
             role="note" aria-label="Error explanation">
            <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                <Lightbulb size={13} />
                {ex.title}{ex.line ? <span className="font-normal text-amber-200/80"> - line {ex.line}</span> : null}
            </div>
            <p className="mt-1 text-slate-200"><span className="font-semibold text-slate-100">What happened: </span>{ex.what}</p>
            <p className="mt-1 text-slate-200"><span className="font-semibold text-slate-100">How to fix: </span>{ex.fix}</p>
        </div>
    );
}
