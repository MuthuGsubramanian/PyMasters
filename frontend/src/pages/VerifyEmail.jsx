import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { verifyEmail } from '../api';
import { MailCheck, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

// Landing page for the "Confirm your PyMasters email" link (routes/email_verify.py).
export default function VerifyEmail() {
    useEffect(() => { document.title = 'Confirm Email — PyMasters'; }, []);
    const { token } = useParams();
    const [state, setState] = useState('working'); // working | done | error
    const [err, setErr] = useState('');
    const sent = useRef(false);

    useEffect(() => {
        if (sent.current) return; // StrictMode runs effects twice in dev; the token is single-use
        sent.current = true;
        verifyEmail(token)
            .then(() => setState('done'))
            .catch((e) => {
                setErr(e?.response?.data?.detail || 'This verification link is invalid or has expired.');
                setState('error');
            });
    }, [token]);

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-10">
            <div className="panel rounded-2xl p-8 max-w-md w-full space-y-5 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center mx-auto shadow-lg shadow-violet-500/20">
                    <MailCheck className="text-white" size={22} />
                </div>
                <h1 className="text-2xl font-bold font-display text-text-primary">Confirm your email</h1>
                {state === 'working' && (
                    <p className="text-sm text-text-secondary flex items-center justify-center gap-2">
                        <Loader2 size={16} className="animate-spin" /> Confirming…
                    </p>
                )}
                {state === 'done' && (
                    <div className="space-y-3">
                        <CheckCircle2 size={36} className="mx-auto text-green-500" />
                        <p className="text-sm text-text-secondary">Your email is confirmed. Thanks!</p>
                        <Link to="/dashboard" className="btn-neo btn-neo-primary inline-flex justify-center px-6 py-2.5">Continue learning</Link>
                    </div>
                )}
                {state === 'error' && (
                    <div className="space-y-3">
                        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 text-left">
                            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {err}
                        </div>
                        <Link to="/dashboard/profile" className="text-sm text-text-link underline">Request a new link from your profile</Link>
                    </div>
                )}
            </div>
        </div>
    );
}
