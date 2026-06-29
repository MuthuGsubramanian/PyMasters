import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api';
import { Mail, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';

export default function ForgotPassword() {
    useEffect(() => { document.title = 'Forgot Password — PyMasters'; }, []);
    const [identifier, setIdentifier] = useState('');
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!identifier.trim() || busy) return;
        setBusy(true);
        try { await forgotPassword(identifier.trim()); } catch { /* always succeed-looking */ }
        setSent(true);
        setBusy(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-10">
            <div className="panel rounded-2xl p-8 max-w-md w-full space-y-5">
                <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/20">
                        <Mail className="text-white" size={22} />
                    </div>
                    <h1 className="text-2xl font-bold font-display text-text-primary">Reset your password</h1>
                    <p className="text-text-muted text-sm">Enter your username or email and we'll send a reset link.</p>
                </div>

                {sent ? (
                    <div className="text-center space-y-3">
                        <CheckCircle2 size={36} className="mx-auto text-green-500" />
                        <p className="text-sm text-text-secondary">If an account exists for <strong>{identifier}</strong>, a reset link is on its way. Check your inbox (the link expires in 1 hour).</p>
                        <Link to="/login" className="btn-neo btn-neo-ghost inline-flex text-sm mt-2"><ArrowLeft size={15} /> Back to sign in</Link>
                    </div>
                ) : (
                    <form onSubmit={submit} className="space-y-3">
                        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Username or email" autoFocus
                            className="w-full px-4 py-2.5 rounded-xl border border-border-default bg-bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus" />
                        <button type="submit" disabled={busy || !identifier.trim()} className="btn-neo btn-neo-primary w-full justify-center py-3">
                            {busy ? <Loader2 size={16} className="animate-spin" /> : 'Send reset link'}
                        </button>
                        <p className="text-center text-xs text-text-muted">
                            Remembered it? <Link to="/login" className="text-cyan-600 font-medium hover:underline">Sign in</Link>
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}
