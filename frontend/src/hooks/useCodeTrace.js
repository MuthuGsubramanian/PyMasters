import { useCallback, useState } from 'react';
import api from '../api';
import { safeErrorMsg } from '../utils/errorUtils';

// Fetch a step-by-step trace of the learner's own code for TraceViewer.
// Same endpoint, auth and limits as the Playground "Visualize" button.
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
            const detail = safeErrorMsg(err, '');
            if (err?.response?.status === 429) {
                setError(`You are running code too fast. ${detail || 'Wait a moment and try again.'}`.trim());
            } else {
                setError(`Could not visualize your code: ${detail || 'please try again.'}`);
            }
        } finally {
            setLoading(false);
        }
    }, [userId]);

    const close = useCallback(() => setTrace(null), []);

    return { trace, loading, error, visualize, close };
}
