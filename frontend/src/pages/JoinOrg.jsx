import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getInviteInfo, joinOrg, registerUser, loginUser } from '../api';
import { Building2, CheckCircle2, AlertCircle, Loader2, GraduationCap } from 'lucide-react';
import { safeErrorMsg } from '../utils/errorUtils';

// ──────────────────────────────────────────────────────────────────────────
// Public page: /join/:token — accept an organization invite (signup or join)
// ──────────────────────────────────────────────────────────────────────────
export default function JoinOrg() {
    const { token } = useParams();
    const navigate = useNavigate();
    const { user, login } = useAuth();

    const [invite, setInvite] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);

    // signup form (shown when the visitor is not logged in)
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => { document.title = 'Join Organization — PyMasters'; }, []);

    useEffect(() => {
        getInviteInfo(token)
            .then((r) => setInvite(r.data))
            .catch((e) => setErr(safeErrorMsg(e, 'This invite link is invalid or no longer exists.')))
            .finally(() => setLoading(false));
    }, [token]);

    const handleJoinExisting = async () => {
        setBusy(true); setErr('');
        try {
            const res = await joinOrg(token, { user_id: user.id });
            login({ ...user, org: res.data });
            navigate('/dashboard');
        } catch (e) {
            setErr(safeErrorMsg(e, 'Could not join — the invite may already be used or expired.'));
        } finally { setBusy(false); }
    };

    const handleSignupAndJoin = async (e) => {
        e.preventDefault();
        if (!username.trim() || !password || !name.trim()) return;
        setBusy(true); setErr('');
        try {
            await registerUser(username.trim(), password, name.trim(), 'individual');
            const lr = await loginUser(username.trim(), password);
            const userData = lr.data;
            const org = await joinOrg(token, { user_id: userData.id });
            login({ ...userData, org: org.data });
            navigate('/onboarding');
        } catch (e2) {
            setErr(safeErrorMsg(e2, 'Could not create your account — that username may be taken.'));
        } finally { setBusy(false); }
    };

    // ── Loading ──
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="animate-spin text-cyan-500" size={28} />
            </div>
        );
    }

    // ── Invalid / expired / used invite ──
    const unusable = !invite || invite.valid === false;
    if (unusable) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <div className="panel rounded-2xl p-8 max-w-md w-full text-center space-y-3">
                    <AlertCircle size={36} className="mx-auto text-amber-500" />
                    <h1 className="text-xl font-bold font-display text-text-primary">Invite unavailable</h1>
                    <p className="text-text-muted text-sm">
                        {err || (invite?.used
                            ? 'This invitation has already been used.'
                            : invite?.expired
                            ? 'This invitation has expired. Ask your admin to send a new one.'
                            : 'This invite link is invalid.')}
                    </p>
                    <Link to="/login" className="btn-neo btn-neo-ghost inline-flex text-sm mt-2">Go to sign in</Link>
                </div>
            </div>
        );
    }

    // ── Valid invite ──
    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-10">
            <div className="panel rounded-2xl p-8 max-w-md w-full space-y-5">
                <div className="text-center space-y-2">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/20">
                        <Building2 className="text-white" size={26} />
                    </div>
                    <h1 className="text-2xl font-bold font-display text-text-primary">
                        Join {invite.org_name}
                    </h1>
                    <p className="text-text-muted text-sm">
                        You've been invited to join <strong className="text-text-secondary">{invite.org_name}</strong>
                        {' '}on PyMasters as a <strong className="text-text-secondary">{invite.role}</strong>.
                    </p>
                </div>

                {err && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                        <AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {err}
                    </div>
                )}

                {user ? (
                    // Logged in → one-click join
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-text-secondary bg-bg-elevated rounded-xl px-3 py-2">
                            <CheckCircle2 size={16} className="text-green-500" />
                            Signed in as <strong>{user.name || user.username}</strong>
                        </div>
                        <button onClick={handleJoinExisting} disabled={busy} className="btn-neo btn-neo-primary w-full justify-center py-3">
                            {busy ? <Loader2 size={16} className="animate-spin" /> : <>Join {invite.org_name}</>}
                        </button>
                    </div>
                ) : (
                    // Not logged in → create account then join
                    <form onSubmit={handleSignupAndJoin} className="space-y-3">
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-text-muted">Invited email</label>
                            <input value={invite.email} disabled className="input-neo mt-1 opacity-70 cursor-not-allowed" />
                        </div>
                        <input className="input-neo" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} required />
                        <input className="input-neo" placeholder="Choose a username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                        <input className="input-neo" type="password" placeholder="Create a password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                        <button type="submit" disabled={busy} className="btn-neo btn-neo-primary w-full justify-center py-3">
                            {busy ? <Loader2 size={16} className="animate-spin" /> : <><GraduationCap size={16} /> Create account & join</>}
                        </button>
                        <p className="text-center text-xs text-text-muted">
                            Already have an account?{' '}
                            <Link to="/login" className="text-cyan-600 font-medium hover:underline">Sign in</Link>
                            {' '}then reopen this link.
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}
