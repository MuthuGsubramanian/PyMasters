import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    getChallengeCatalog, getOrgChallengeSets, createOrgChallengeSet,
    archiveOrgChallengeSet, getChallengeSetLeaderboard, getOrgLeaderboard,
} from '../api';
import { Swords, Trophy, Crown, Medal, Plus, Loader2, X, ChevronLeft, Check } from 'lucide-react';
import clsx from 'clsx';

function rankBadge(rank) {
    if (rank === 1) return <Crown size={16} className="text-amber-400" />;
    if (rank === 2) return <Medal size={16} className="text-slate-300" />;
    if (rank === 3) return <Medal size={16} className="text-amber-700" />;
    return <span className="text-xs font-bold text-slate-500 w-4 text-center">{rank}</span>;
}

export default function OrgCompete() {
    useEffect(() => { document.title = 'Compete — PyMasters'; }, []);
    const { user, activeOrg } = useAuth();
    const orgId = activeOrg?.id || activeOrg?.org_id;
    const isManager = ['super_admin', 'admin', 'manager'].includes(activeOrg?.role);
    const [tab, setTab] = useState('competitions');

    if (!orgId) {
        return <div className="max-w-3xl mx-auto px-4 py-12 text-center text-slate-400">
            You're not part of an organization yet.</div>;
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-white font-display flex items-center gap-2">
                    <Swords className="text-cyan-400" size={24} /> {activeOrg.name || 'Organization'} — Compete
                </h1>
                <p className="text-slate-400 text-sm mt-1">Competitive challenges and rankings within your organization.</p>
            </div>

            <div className="flex gap-2 mb-6">
                {[['competitions', 'Competitions'], ['leaderboard', 'Org Leaderboard']].map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id)}
                        className={clsx('px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
                            tab === id ? 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white'
                                       : 'bg-white/[0.04] text-slate-400 hover:text-white')}>
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'competitions'
                ? <Competitions orgId={orgId} isManager={isManager} meId={user?.id} />
                : <OrgRanking orgId={orgId} meId={user?.id} />}
        </div>
    );
}

function Competitions({ orgId, isManager, meId }) {
    const [sets, setSets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [openSet, setOpenSet] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        getOrgChallengeSets(orgId)
            .then((r) => setSets(r.data.challenge_sets || []))
            .catch(() => setSets([]))
            .finally(() => setLoading(false));
    }, [orgId]);

    useEffect(() => { load(); }, [load]);

    if (openSet) return <SetLeaderboard orgId={orgId} set={openSet} meId={meId} onBack={() => setOpenSet(null)} />;
    if (creating) return <CreateForm orgId={orgId} onDone={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />;

    return (
        <div>
            {isManager && (
                <button onClick={() => setCreating(true)}
                    className="mb-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-cyan-500 hover:scale-[1.02] transition-transform">
                    <Plus size={16} /> New competition
                </button>
            )}
            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-cyan-400" /></div>
            ) : sets.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-10">
                    No competitions yet.{isManager ? ' Create one to get your members competing.' : ' Check back soon.'}
                </p>
            ) : (
                <div className="space-y-3">
                    {sets.map((s) => (
                        <button key={s.id} onClick={() => setOpenSet(s)}
                            className="w-full text-left rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 hover:border-cyan-500/30 transition-colors">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-white truncate">{s.title}</p>
                                    {s.description && <p className="text-xs text-slate-400 truncate mt-0.5">{s.description}</p>}
                                    <p className="text-xs text-slate-500 mt-1">
                                        {s.challenge_count} challenge{s.challenge_count === 1 ? '' : 's'}
                                        {s.group_name ? ` · ${s.group_name}` : ' · whole org'}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-lg font-extrabold text-cyan-400">{s.my_completed}/{s.challenge_count}</div>
                                    <div className="text-[10px] text-slate-500">your progress</div>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function CreateForm({ orgId, onDone, onCancel }) {
    const [catalog, setCatalog] = useState([]);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [group, setGroup] = useState('');
    const [picked, setPicked] = useState(new Set());
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    useEffect(() => { getChallengeCatalog().then((r) => setCatalog(r.data.challenges || [])).catch(() => {}); }, []);

    const togglePick = (id) => setPicked((p) => {
        const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
    });

    const submit = async () => {
        setErr('');
        if (!title.trim()) return setErr('Give the competition a title.');
        if (picked.size === 0) return setErr('Select at least one challenge.');
        setSaving(true);
        try {
            await createOrgChallengeSet(orgId, {
                title: title.trim(), description: description.trim(),
                challenge_ids: [...picked], group_name: group.trim(),
            });
            onDone();
        } catch (e) {
            setErr(e?.response?.data?.detail || 'Could not create competition.');
            setSaving(false);
        }
    };

    return (
        <div>
            <button onClick={onCancel} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-4">
                <ChevronLeft size={14} /> Back
            </button>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
                {err && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</div>}
                <div>
                    <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Title</label>
                    <input value={title} onChange={(e) => setTitle(e.target.value)}
                        className="mt-1 w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/40"
                        placeholder="e.g., Week 1 Sprint" />
                </div>
                <div>
                    <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Description <span className="text-slate-600">(optional)</span></label>
                    <input value={description} onChange={(e) => setDescription(e.target.value)}
                        className="mt-1 w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/40"
                        placeholder="What's this competition about?" />
                </div>
                <div>
                    <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Group / cohort <span className="text-slate-600">(optional — blank = whole org)</span></label>
                    <input value={group} onChange={(e) => setGroup(e.target.value)}
                        className="mt-1 w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/40"
                        placeholder="e.g., Section-A" />
                </div>
                <div>
                    <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Challenges ({picked.size} selected)</label>
                    <div className="mt-2 max-h-72 overflow-y-auto space-y-2 pr-1">
                        {catalog.map((c) => (
                            <button key={c.id} type="button" onClick={() => togglePick(c.id)}
                                className={clsx('w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-3 transition-colors',
                                    picked.has(c.id) ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]')}>
                                <div className={clsx('w-5 h-5 rounded flex items-center justify-center shrink-0',
                                    picked.has(c.id) ? 'bg-cyan-500 text-white' : 'border border-white/20')}>
                                    {picked.has(c.id) && <Check size={12} />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-white truncate">{c.title}</p>
                                    <p className="text-[11px] text-slate-500">{c.difficulty} · {c.category} · {c.xp_reward} XP</p>
                                </div>
                            </button>
                        ))}
                        {catalog.length === 0 && <p className="text-xs text-slate-500 py-4 text-center">Loading challenges…</p>}
                    </div>
                </div>
                <button onClick={submit} disabled={saving}
                    className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-purple-600 to-cyan-500 hover:scale-[1.01] transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create competition
                </button>
            </div>
        </div>
    );
}

function SetLeaderboard({ orgId, set, meId, onBack }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        getChallengeSetLeaderboard(orgId, set.id)
            .then((r) => setData(r.data)).catch(() => setData({ leaderboard: [] }))
            .finally(() => setLoading(false));
    }, [orgId, set.id]);

    return (
        <div>
            <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-4">
                <ChevronLeft size={14} /> Back to competitions
            </button>
            <h2 className="text-lg font-bold text-white mb-1">{set.title}</h2>
            <p className="text-xs text-slate-500 mb-4">
                {set.challenge_count} challenges{set.group_name ? ` · ${set.group_name}` : ' · whole org'}
            </p>
            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-cyan-400" /></div>
            ) : (
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
                    {(data?.leaderboard || []).map((row) => (
                        <div key={row.user_id} className={clsx('flex items-center gap-3 px-4 py-3', row.user_id === meId && 'bg-cyan-500/[0.06]')}>
                            <div className="w-6 flex justify-center">{rankBadge(row.rank)}</div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-white truncate">
                                    {row.name}{row.user_id === meId && <span className="text-cyan-400"> (you)</span>}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-white">{row.solved}/{row.total}</p>
                                <p className="text-[10px] text-slate-500">{row.xp} XP</p>
                            </div>
                        </div>
                    ))}
                    {(!data?.leaderboard || data.leaderboard.length === 0) && (
                        <p className="text-center text-slate-500 text-sm py-10">No submissions yet — be the first to solve one.</p>
                    )}
                </div>
            )}
        </div>
    );
}

function OrgRanking({ orgId, meId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        getOrgLeaderboard(orgId)
            .then((r) => setData(r.data)).catch(() => setData({ leaderboard: [] }))
            .finally(() => setLoading(false));
    }, [orgId]);

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-cyan-400" /></div>;

    return (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
            {(data?.leaderboard || []).map((row) => (
                <div key={row.user_id} className={clsx('flex items-center gap-3 px-4 py-3', row.user_id === meId && 'bg-cyan-500/[0.06]')}>
                    <div className="w-6 flex justify-center">{rankBadge(row.rank)}</div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">
                            {row.name}{row.user_id === meId && <span className="text-cyan-400"> (you)</span>}
                        </p>
                        <p className="text-xs text-slate-500">{row.challenges} challenges · {row.streak}🔥</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-bold text-white">{row.xp}</p>
                        <p className="text-[10px] text-slate-500">XP</p>
                    </div>
                </div>
            ))}
            {(!data?.leaderboard || data.leaderboard.length === 0) && (
                <p className="text-center text-slate-500 text-sm py-10">No members ranked yet.</p>
            )}
        </div>
    );
}
