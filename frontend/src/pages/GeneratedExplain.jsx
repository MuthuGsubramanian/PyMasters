import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ScrollyExplain from '../components/ScrollyExplain';
import GenericExplainVisual from '../components/explains/GenericExplainVisual';
import { getExplain } from '../api';

// Viewer for an ON-DEMAND generated Explains essay (per-lesson "Explain this
// visually" button). Feeds the stored DATA (text steps) into the shared
// ScrollyExplain engine with the generic data-driven visual. No bespoke code
// per essay — the content is data, the visual is generic.
export default function GeneratedExplain() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        setData(null); setError('');
        getExplain(id)
            .then((r) => { if (alive) setData(r.data); })
            .catch(() => { if (alive) setError('This explanation could not be found. It may have expired.'); });
        return () => { alive = false; };
    }, [id]);

    useEffect(() => {
        document.title = data ? `${data.title} — PyMasters Explains` : 'Explains — PyMasters';
        window.scrollTo(0, 0);
    }, [data]);

    if (error) {
        return (
            <div className="max-w-2xl mx-auto py-16 text-center">
                <p className="text-text-secondary mb-4">{error}</p>
                <button onClick={() => navigate('/dashboard/explains')} className="btn-neo btn-neo-ghost inline-flex items-center gap-1.5 py-2 px-4">
                    <ArrowLeft size={15} aria-hidden="true" /> All Explains
                </button>
            </div>
        );
    }
    if (!data) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-text-muted">
                <Loader2 size={22} className="animate-spin" aria-hidden="true" />
                <p className="text-sm">Loading your explanation…</p>
            </div>
        );
    }

    const md = (text) => (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || ''}</ReactMarkdown>
    );
    const steps = (data.steps || []).map((s) => ({ title: s.title, body: md(s.body) }));
    const Visual = ({ stepIndex }) => <GenericExplainVisual steps={data.steps} stepIndex={stepIndex} />;

    return (
        <ScrollyExplain
            title={data.title}
            subtitle={data.subtitle}
            steps={steps}
            Visual={Visual}
            takeaway={data.takeaway ? md(data.takeaway) : null}
        />
    );
}
