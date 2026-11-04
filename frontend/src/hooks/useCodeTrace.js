import { useCallback, useState } from 'react';
import api from '../api';
import { safeErrorMsg } from '../utils/errorUtils';

// A short, friendly message for a failed /playground/trace call.
export function traceErrorMessage(err) {
    const detail = safeErrorMsg(err, '');
    if (err?.response?.status === 429) {
        return `You are running code too fast. ${detail || 'Wait a moment and try again.'}`.trim();
    }
    return `Could not visualize your code: ${detail || 'please try again.'}`;
}

// Fetch a step-by-step trace of the learner's own code for TraceViewer.
// Same endpoint, auth and limits as the Playground "Visualize" button.
// `fetchHeap(code)` asks the same endpoint for the object-model trace (mode "heap") used by
// the "Under the hood" tab; it returns the trace and throws on failure (the caller shows it).
export default function useCodeTrace(userId) {
    const [trace, setTrace] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const visualize = useCallback(async (code) => {
        if (!code || !code.trim()) return;
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/playground/trace', { user_id: userId, code });
            setTrace(res.data);
        } catch (err) {
            setError(traceErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [userId]);

    const fetchHeap = useCallback(async (code) => {
        const res = await api.post('/playground/trace', { user_id: userId, code, mode: 'heap' });
        return res.data;
    }, [userId]);

    const resetError = useCallback(() => setError(''), []);
    const close = useCallback(() => setTrace(null), []);

    return { trace, loading, error, visualize, fetchHeap, close, resetError };
}
