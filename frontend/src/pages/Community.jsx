import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    getGlobalLeaderboard, getMembers, followMember, unfollowMember,
} from '../api';
import { Trophy, Flame, Search, UserPlus, UserCheck, Crown, Medal, Loader2 } from 'lucide-react';
import clsx from 'clsx';

// Tier accents — given explicit light/dark shades so they stay legible in BOTH themes.
const TIER_COLORS = {
    Master: 'text-amber-600 dark:text-amber-400',
    Expert: 'text-fuchsia-600 dark:text-fuchsia-400',
    Advanced: 'text-cyan-600 dark:text-cyan-400',
    Intermediate: 'text-emerald-600 dark:text-emerald-400',
    Apprentice: 'text-sky-600 dark:text-sky-400',
    Novice: 'text-text-muted',
};

function rankBadge(rank) {
    if (rank === 1) return <Crown size={16} className="text-amber-500 dark:text-amber-400" />;
    if (rank === 2) return <Medal size={16} className="text-slate-400 dark:text-slate-300" />;
    if (rank === 3) return <Medal size={16} className="text-amber-700" />;
    return <span className="text-xs font-bold text-text-muted w-4 text-center">{rank}</span>;
}

function Avatar({ name, url, size = 36 }) {
    const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    if (url) return <img src={url} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />;
    return (
        <div className="rounded-full bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center text-white font-bold"
             style={{ width: size, height: size, fontSize: size * 0.36 }}>
            {initials}
        </div>
    );
}

export default function Community() {
    useEffect(() => { document.title = 'Community — PyMasters'; }, []);
    const { user, activeOrg } = useAuth();
    const orgId = activeOrg?.id || activeOrg?.org_id || null;
    const [tab, setTab] = useState('leaderboard');

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-text-primary font-display flex items-center gap-2">
                    <Trophy className="text-amber-500 dark:text-amber-400" size={24} /> Community
                </h1>
                <p className="text-text-muted text-sm mt-1">See where you rank and connect with other PyMasters learners.</p>
            </div>

            <div className="flex gap-2 mb-6">
                {[['leaderboard', 'Leaderboard'], ['members', 'Members']].map(([id, label]) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={clsx(
                            'px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
                            tab === id ? 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white'
                                       : 'bg-bg-elevated text-text-muted hover:text-text-primary'
                        )}
                    >{label}</button>
                ))}
            </div>

            {tab === 'leaderboard' ? <Leaderboard meId={user?.id} orgId={orgId} /> : <Members meId={user?.id} orgId={orgId} />}
        </div>
    );
}

function Leaderboard({ meId, orgId }) {
    const [scope, setScope] = useState('xp');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        setLoading(true);
        getGlobalLeaderboard(scope, 50, 0, orgId)
            .then((r) => { if (active) setData(r.data); })
            .catch(() => { if (active) setData({ leaderboard: [], me: null, total_participants: 0 }); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [scope, orgId]);

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2">
                    <ScopeBtn active={scope === 'xp'} onClick={() => setScope('xp')} icon={<Trophy size={14} />} label="XP" />
                    <ScopeBtn active={scope === 'streak'} onClick={() => setScope('streak')} icon={<Flame size={14} />} label="Streak" />
                </div>
                {data?.total_participants != null && (
                    <span className="text-xs text-text-muted">{data.total_participants} learners</span>
                )}
            </div>

            {data?.me && (
                <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 flex items-center gap-3">
                    <span className="text-sm font-bold text-cyan-700 dark:text-cyan-300">Your rank</span>
                    <span className="text-lg font-extrabold text-text-primary">#{data.me.rank}</span>
                    <span className="text-xs text-text-muted ml-auto">
                        {scope === 'xp' ? `${data.me.metric} XP · ${data.me.tier}` : `${data.me.metric} day streak`}
                    </span>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-cyan-500 dark:text-cyan-400" /></div>
            ) : (
                <div className="rounded-2xl border border-border-default bg-bg-surface divide-y divide-border-default">
                    {(data?.leaderboard || []).map((row) => (
                        <div key={row.user_id}
                             className={clsx('flex items-center gap-3 px-4 py-3',
                                 row.user_id === meId && 'bg-cyan-500/[0.08]')}>
                            <div className="w-6 flex justify-center">{rankBadge(row.rank)}</div>
                            <Avatar name={row.name} url={row.avatar_url} />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-text-primary truncate">
                                    {row.name}{row.user_id === meId && <span className="text-cyan-600 dark:text-cyan-400"> (you)</span>}
                                </p>
                                <p className={clsx('text-xs', TIER_COLORS[row.tier] || 'text-text-muted')}>{row.tier}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-text-primary">
                                    {scope === 'streak' ? `${row.metric}🔥` : `${row.xp}`}
                                </p>
                                <p className="text-[10px] text-text-muted">{scope === 'streak' ? 'day streak' : 'XP'}</p>
                            </div>
                        </div>
                    ))}
                    {(!data?.leaderboard || data.leaderboard.length === 0) && (
                        <p className="text-center text-text-muted text-sm py-10">No rankings yet — earn XP to get on the board.</p>
                    )}
                </div>
            )}
        </div>
    );
}

function ScopeBtn({ active, onClick, icon, label }) {
    return (
        <button onClick={onClick}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors',
                active ? 'bg-bg-inset text-text-primary' : 'bg-bg-elevated text-text-muted hover:text-text-primary')}>
            {icon}{label}
        </button>
    );
}

function Members({ meId, orgId }) {
    const [q, setQ] = useState('');
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState({});

    const load = useCallback((query) => {
        setLoading(true);
        getMembers(query, 30, 0, orgId)
            .then((r) => setMembers(r.data.members || []))
            .catch(() => setMembers([]))
            .finally(() => setLoading(false));
    }, [orgId]);

    useEffect(() => {
        const t = setTimeout(() => load(q), 250);
        return () => clearTimeout(t);
    }, [q, load]);

    const toggle = async (m) => {
        setBusy((b) => ({ ...b, [m.user_id]: true }));
        try {
            const res = m.is_following ? await unfollowMember(m.user_id) : await followMember(m.user_id);
            // Trust the server's authoritative response (follow state + exact follower
            // count) when present; only fall back to an optimistic, clamped estimate if
            // the fields are missing, so the displayed count can't drift or go negative.
            const d = (res && res.data) || {};
            const nowFollowing = typeof d.following === 'boolean' ? d.following : !m.is_following;
            setMembers((list) => list.map((x) => x.user_id === m.user_id
                ? {
                    ...x,
                    is_following: nowFollowing,
                    followers: Number.isFinite(d.target_followers)
                        ? d.target_followers
                        : Math.max(0, x.followers + (nowFollowing ? 1 : -1)),
                  }
                : x));
        } catch { /* ignore */ }
        finally { setBusy((b) => ({ ...b, [m.user_id]: false })); }
    };

    return (
        <div>
            <div className="relative mb-4">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search members by name or username…"
                    className="w-full bg-bg-elevated border border-border-default rounded-xl pl-10 pr-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-cyan-500/40"
                />
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-cyan-500 dark:text-cyan-400" /></div>
            ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                    {members.map((m) => (
                        <div key={m.user_id} className="rounded-2xl border border-border-default bg-bg-surface p-4 flex items-center gap-3">
                            <Avatar name={m.name} url={m.avatar_url} size={42} />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-text-primary truncate flex items-center gap-1.5">
                                    <span className="truncate">{m.name}</span>
                                    {m.follows_you && (
                                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-bg-inset text-text-secondary">
                                            Follows you
                                        </span>
                                    )}
                                </p>
                                <p className="text-xs text-text-muted truncate">
                                    <span className={TIER_COLORS[m.tier] || 'text-text-muted'}>{m.tier}</span>
                                    {' · '}{m.xp} XP · {m.followers} follower{m.followers === 1 ? '' : 's'}
                                </p>
                            </div>
                            {m.user_id !== meId && (
                                <button
                                    onClick={() => toggle(m)}
                                    disabled={busy[m.user_id]}
                                    className={clsx('shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors',
                                        m.is_following
                                            ? 'bg-bg-elevated text-text-secondary hover:bg-bg-inset'
                                            : 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:scale-[1.03]')}
                                >
                                    {busy[m.user_id] ? <Loader2 size={12} className="animate-spin" />
                                        : m.is_following ? <UserCheck size={12} /> : <UserPlus size={12} />}
                                    {m.is_following ? 'Connected' : 'Connect'}
                                </button>
                            )}
                        </div>
                    ))}
                    {members.length === 0 && (
                        <p className="text-center text-text-muted text-sm py-10 sm:col-span-2">No members found.</p>
                    )}
                </div>
            )}
        </div>
    );
}
