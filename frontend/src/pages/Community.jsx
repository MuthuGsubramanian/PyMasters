import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    getGlobalLeaderboard, getMembers, followMember, unfollowMember,
} from '../api';
import { Trophy, Flame, Search, UserPlus, UserCheck, Crown, Medal, Loader2 } from 'lucide-react';
import clsx from 'clsx';

const TIER_COLORS = {
    Master: 'text-amber-400', Expert: 'text-fuchsia-400', Advanced: 'text-cyan-400',
    Intermediate: 'text-emerald-400', Apprentice: 'text-sky-400', Novice: 'text-slate-400',
};

function rankBadge(rank) {
    if (rank === 1) return <Crown size={16} className="text-amber-400" />;
    if (rank === 2) return <Medal size={16} className="text-slate-300" />;
    if (rank === 3) return <Medal size={16} className="text-amber-700" />;
    return <span className="text-xs font-bold text-slate-500 w-4 text-center">{rank}</span>;
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
    const { user } = useAuth();
    const [tab, setTab] = useState('leaderboard');

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-white font-display flex items-center gap-2">
                    <Trophy className="text-amber-400" size={24} /> Community
                </h1>
                <p className="text-slate-400 text-sm mt-1">See where you rank and connect with other PyMasters learners.</p>
            </div>

            <div className="flex gap-2 mb-6">
                {[['leaderboard', 'Leaderboard'], ['members', 'Members']].map(([id, label]) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={clsx(
                            'px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
                            tab === id ? 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white'
                                       : 'bg-white/[0.04] text-slate-400 hover:text-white'
                        )}
                    >{label}</button>
                ))}
            </div>

            {tab === 'leaderboard' ? <Leaderboard meId={user?.id} /> : <Members meId={user?.id} />}
        </div>
    );
}

function Leaderboard({ meId }) {
    const [scope, setScope] = useState('xp');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        setLoading(true);
        getGlobalLeaderboard(scope, 50, 0)
            .then((r) => { if (active) setData(r.data); })
            .catch(() => { if (active) setData({ leaderboard: [], me: null, total_participants: 0 }); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [scope]);

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2">
                    <ScopeBtn active={scope === 'xp'} onClick={() => setScope('xp')} icon={<Trophy size={14} />} label="XP" />
                    <ScopeBtn active={scope === 'streak'} onClick={() => setScope('streak')} icon={<Flame size={14} />} label="Streak" />
                </div>
                {data?.total_participants != null && (
                    <span className="text-xs text-slate-500">{data.total_participants} learners</span>
                )}
            </div>

            {data?.me && (
                <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 flex items-center gap-3">
                    <span className="text-sm font-bold text-cyan-300">Your rank</span>
                    <span className="text-lg font-extrabold text-white">#{data.me.rank}</span>
                    <span className="text-xs text-slate-400 ml-auto">
                        {scope === 'xp' ? `${data.me.metric} XP · ${data.me.tier}` : `${data.me.metric} day streak`}
                    </span>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-cyan-400" /></div>
            ) : (
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
                    {(data?.leaderboard || []).map((row) => (
                        <div key={row.user_id}
                             className={clsx('flex items-center gap-3 px-4 py-3',
                                 row.user_id === meId && 'bg-cyan-500/[0.06]')}>
                            <div className="w-6 flex justify-center">{rankBadge(row.rank)}</div>
                            <Avatar name={row.name} url={row.avatar_url} />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-white truncate">
                                    {row.name}{row.user_id === meId && <span className="text-cyan-400"> (you)</span>}
                                </p>
                                <p className={clsx('text-xs', TIER_COLORS[row.tier] || 'text-slate-400')}>{row.tier}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-white">
                                    {scope === 'streak' ? `${row.metric}🔥` : `${row.xp}`}
                                </p>
                                <p className="text-[10px] text-slate-500">{scope === 'streak' ? 'day streak' : 'XP'}</p>
                            </div>
                        </div>
                    ))}
                    {(!data?.leaderboard || data.leaderboard.length === 0) && (
                        <p className="text-center text-slate-500 text-sm py-10">No rankings yet — earn XP to get on the board.</p>
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
                active ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-slate-400 hover:text-white')}>
            {icon}{label}
        </button>
    );
}

function Members({ meId }) {
    const [q, setQ] = useState('');
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState({});

    const load = useCallback((query) => {
        setLoading(true);
        getMembers(query, 30, 0)
            .then((r) => setMembers(r.data.members || []))
            .catch(() => setMembers([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        const t = setTimeout(() => load(q), 250);
        return () => clearTimeout(t);
    }, [q, load]);

    const toggle = async (m) => {
        setBusy((b) => ({ ...b, [m.user_id]: true }));
        try {
            if (m.is_following) await unfollowMember(m.user_id);
            else await followMember(m.user_id);
            setMembers((list) => list.map((x) => x.user_id === m.user_id
                ? { ...x, is_following: !x.is_following, followers: x.followers + (x.is_following ? -1 : 1) }
                : x));
        } catch { /* ignore */ }
        finally { setBusy((b) => ({ ...b, [m.user_id]: false })); }
    };

    return (
        <div>
            <div className="relative mb-4">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search members by name or username…"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                />
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-cyan-400" /></div>
            ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                    {members.map((m) => (
                        <div key={m.user_id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-3">
                            <Avatar name={m.name} url={m.avatar_url} size={42} />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-white truncate">{m.name}</p>
                                <p className="text-xs text-slate-500 truncate">
                                    <span className={TIER_COLORS[m.tier] || 'text-slate-400'}>{m.tier}</span>
                                    {' · '}{m.xp} XP · {m.followers} follower{m.followers === 1 ? '' : 's'}
                                </p>
                            </div>
                            {m.user_id !== meId && (
                                <button
                                    onClick={() => toggle(m)}
                                    disabled={busy[m.user_id]}
                                    className={clsx('shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors',
                                        m.is_following
                                            ? 'bg-white/[0.06] text-slate-300 hover:bg-white/10'
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
                        <p className="text-center text-slate-500 text-sm py-10 sm:col-span-2">No members found.</p>
                    )}
                </div>
            )}
        </div>
    );
}
