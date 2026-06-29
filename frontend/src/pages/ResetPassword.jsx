import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { resetPassword } from '../api';
import { Lock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ResetPassword() {
    useEffect(() => { document.title = 'Reset Password — PyMasters'; }, []);
    const { token } = useParams();
    const navigate = useNavigate();
    const [pw, setPw] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [err, setErr] = useState('');

    const submit = async (e) => {
        e.preventDefault();
        setErr('');
        if (pw.length < 6) { setErr('Password must be at least 6 characters.'); return; }
        if (pw !== confirm) { setErr('Passwords do not match.'); return; }
        setBusy(true);
        try {
            await resetPassword(token, pw);
            setDone(true);
            setTimeout(() => navigate('/login'), 2200);
        } catch (e2) {
            setErr(e2?.response?.data?.detail || 'This reset link is invalid or expired.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-10">
            <div className="panel rounded-2xl p-8 max-w-md w-full space-y-5">
                <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/20">
                        <Lock className="text-white" size={22} />
                    </div>
                    <h1 className="text-2xl font-bold font-display text-text-primary">Set a new password</h1>
                </div>

                {done ? (
                    <div className="text-center space-y-3">
                        <CheckCircle2 size={36} className="mx-auto text-green-500" />
                        <p className="text-sm text-text-secondary">Password updated! Redirecting you to sign in…</p>
                    </div>
                ) : (
                    <form onSubmit={submit} className="space-y-3">
                        {err && (
                            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {err}
                            </div>
                        )}
                        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (min 6 characters)" autoComplete="new-password" autoFocus
                            className="w-full px-4 py-2.5 rounded-xl border border-border-default bg-bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus" />
                        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" autoComplete="new-password"
                            className="w-full px-4 py-2.5 rounded-xl border border-border-default bg-bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus" />
                        <button type="submit" disabled={busy} className="btn-neo btn-neo-primary w-full justify-center py-3">
                            {busy ? <Loader2 size={16} className="animate-spin" /> : 'Update password'}
                        </button>
                        <p className="text-center text-xs text-text-muted">
                            <Link to="/login" className="text-cyan-600 font-medium hover:underline">Back to sign in</Link>
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}
