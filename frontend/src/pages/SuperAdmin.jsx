import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    getAdminOverview, getAdminUsers, getAdminOrgs, getAdminUsage,
    adminBlockUser, adminSetPlan, getAdminUserViewAs, adminSetSuperAdmin, getAdminAudit,
} from '../api';
import { safeErrorMsg } from '../utils/errorUtils';
import UserAdminDrawer from '../components/UserAdminDrawer';
import OrgAdminDrawer from '../components/OrgAdminDrawer';
import {
    Badge, Card, StatCard, Button, Tabs,
    Table, THead, TH, TBody, TR, TD,
} from '../components/ui';
import {
    Shield, Users, Building2, GraduationCap, Activity, Sparkles, TrendingUp,
    Search, Ban, CheckCircle2, Loader2, School, Briefcase, BookOpen, Lock,
} from 'lucide-react';

const PLANS = ['free', 'pro', 'enterprise'];

function relTimeSA(ts) {
  if (!ts) return '—';
  let iso = String(ts).replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const d = Math.floor((Date.now() - t) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d}d ago` : `${Math.floor(d/30)}mo ago`;
}

// Dependency-free daily usage bars.
function UsageChart({ series }) {
    if (!series || series.length === 0) return null;
    const max = Math.max(1, ...series.map((d) => Math.max(d.signups, d.active)));
    return (
        <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-text-secondary">Activity — last {series.length} days</h3>
                <div className="flex items-center gap-3 text-[11px] text-text-muted">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-accent-primary" /> Signups</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-400" /> Active</span>
                </div>
            </div>
            <div className="flex items-end gap-[3px] h-32">
                {series.map((d) => (
                    <div key={d.date} className="flex-1 flex flex-col justify-end items-center gap-[2px] group relative" title={`${d.date}\nSignups: ${d.signups}\nActive: ${d.active}`}>
                        <div className="w-full bg-purple-400/70 rounded-sm" style={{ height: `${(d.active / max) * 100}%` }} />
                        <div className="w-full bg-accent-primary rounded-sm" style={{ height: `${(d.signups / max) * 100}%` }} />
                    </div>
                ))}
            </div>
        </Card>
    );
}

function ViewAsPanel({ adminId, target, onExit }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    getAdminUserViewAs(adminId, target.id)
      .then((r) => setData(r.data)).catch((e) => setErr(safeErrorMsg(e, 'Failed to load')));
  }, [adminId, target.id]);
  return (
    <div className="fixed inset-0 z-50 bg-bg-base overflow-y-auto">
      <div className="sticky top-0 z-10 bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm font-semibold">
        <span>Viewing {String(target.name || target.username)} · read-only</span>
        <button onClick={onExit} className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30">Exit</button>
      </div>
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        {err ? <p className="text-red-500 text-sm">{err}</p> : !data ? <p className="text-text-muted text-sm">Loading…</p> : (
          <>
            <h2 className="text-xl font-bold text-text-primary">{String(data.profile?.name || data.profile?.username)}</h2>
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-4 text-center"><div className="text-2xl font-bold text-text-primary">{data.summary?.xp ?? 0}</div><div className="text-xs text-text-muted">XP</div></Card>
              <Card className="p-4 text-center"><div className="text-2xl font-bold text-text-primary">{data.summary?.lessons_completed ?? 0}</div><div className="text-xs text-text-muted">Lessons</div></Card>
              <Card className="p-4 text-center"><div className="text-2xl font-bold text-text-primary">{data.summary?.signals_7d ?? 0}</div><div className="text-xs text-text-muted">Signals 7d</div></Card>
            </div>
            <Card className="p-4">
              <h3 className="text-sm font-bold text-text-secondary mb-2">Topic mastery</h3>
              {(data.mastery || []).length === 0 ? <p className="text-xs text-text-muted">No mastery data.</p> : data.mastery.map((m) => (
                <div key={m.topic} className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-text-secondary w-32 truncate">{m.topic}</span>
                  <div className="flex-1 h-2 bg-bg-elevated rounded-full overflow-hidden"><div className="h-full bg-accent-primary" style={{ width: `${Math.round((Number(m.mastery_level)||0)*100)}%` }} /></div>
                  <span className="text-[11px] text-text-muted w-9 text-right">{Math.round((Number(m.mastery_level)||0)*100)}%</span>
                </div>
              ))}
            </Card>
            <Card className="p-4">
              <h3 className="text-sm font-bold text-text-secondary mb-2">Recent lessons</h3>
              {(data.lessons || []).length === 0 ? <p className="text-xs text-text-muted">None yet.</p> : (
                <ul className="space-y-1">{data.lessons.map((l, i) => <li key={i} className="flex justify-between text-xs"><span className="text-text-secondary">{l.lesson_id}</span><span className="text-text-muted">+{l.xp_awarded||0} XP</span></li>)}</ul>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function AdminsList({ adminId }) {
  const [rows, setRows] = useState(null);
  const reload = useCallback(() => { getAdminUsers(adminId, '', 200, 0).then((r) => setRows((r.data.users || []).filter(u => u.is_super_admin))); }, [adminId]);
  useEffect(() => { reload(); }, [reload]);
  if (rows === null) return <div className="h-16 rounded-xl bg-bg-elevated animate-pulse" />;
  if (!rows.length) return <p className="text-sm text-text-muted">Only env break-glass admins exist. Promote someone below.</p>;
  return (
    <Card className="divide-y divide-border-default">
      {rows.map((u) => (
        <div key={u.id} className="flex items-center justify-between p-3">
          <span className="text-sm text-text-primary">{u.name || u.username} <span className="text-text-muted text-xs">@{u.username}</span></span>
          <button onClick={() => adminSetSuperAdmin(adminId, u.id, false).then(reload).catch(()=>{})} className="text-xs text-red-500 font-bold">Demote</button>
        </div>
      ))}
    </Card>
  );
}

function AdminPromote({ adminId, onChanged }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState([]); const [msg, setMsg] = useState('');
  const search = (e) => { e.preventDefault(); if (!q.trim()) return; getAdminUsers(adminId, q.trim(), 10, 0).then((r) => setRes(r.data.users || [])); };
  const promote = (u) => adminSetSuperAdmin(adminId, u.id, true).then(() => { setMsg(`Promoted ${u.username}`); setRes([]); setQ(''); onChanged?.(); }).catch(()=>setMsg('Failed'));
  return (
    <Card className="p-4 space-y-2">
      <form onSubmit={search} className="flex gap-2"><input className="input-neo flex-1 py-2 text-sm" placeholder="Search user to promote…" aria-label="Search user to promote" value={q} onChange={(e)=>setQ(e.target.value)} /><Button type="submit" variant="primary" size="sm" className="px-4 py-2">Search</Button></form>
      {res.map((u) => <div key={u.id} className="flex items-center justify-between text-sm"><span className="text-text-primary">{u.name || u.username} <span className="text-text-muted text-xs">@{u.username}</span></span><button onClick={()=>promote(u)} className="text-xs text-accent-primary font-bold">Make admin</button></div>)}
      {msg ? <p className="text-xs text-green-600">{msg}</p> : null}
    </Card>
  );
}

export default function SuperAdmin() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState('overview');
    const [overview, setOverview] = useState(null);
    const [usage, setUsage] = useState(null);
    const [users, setUsers] = useState(null);
    const [orgs, setOrgs] = useState(null);
    const [q, setQ] = useState('');
    const [denied, setDenied] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [openUserId, setOpenUserId] = useState(null);
    const [openOrgId, setOpenOrgId] = useState(null);
    const [viewAsUser, setViewAsUser] = useState(null);
    const [audit, setAudit] = useState(null);

    useEffect(() => { document.title = 'Super Admin — PyMasters'; }, []);

    const loadAll = useCallback(async () => {
        if (!user?.id) return;
        try {
            const [ov, us] = await Promise.all([getAdminOverview(user.id), getAdminUsage(user.id, 30)]);
            setOverview(ov.data);
            setUsage(us.data.series);
        } catch (e) {
            if (e?.response?.status === 403) setDenied(true);
        }
    }, [user]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const loadUsers = useCallback(async (query = '') => {
        if (!user?.id) return;
        try { setUsers((await getAdminUsers(user.id, query, 100, 0)).data); }
        catch (e) { if (e?.response?.status === 403) setDenied(true); }
    }, [user]);

    const loadOrgs = useCallback(async () => {
        if (!user?.id) return;
        try { setOrgs((await getAdminOrgs(user.id)).data.orgs); }
        catch (e) { if (e?.response?.status === 403) setDenied(true); }
    }, [user]);

    useEffect(() => { if (tab === 'users' && users === null) loadUsers(); }, [tab, users, loadUsers]);
    useEffect(() => { if (tab === 'orgs' && orgs === null) loadOrgs(); }, [tab, orgs, loadOrgs]);
    useEffect(() => { if (tab==='audit' && audit===null) getAdminAudit(user.id, { limit: 100 }).then((r)=>setAudit(r.data.audit)).catch(()=>setAudit([])); }, [tab, audit, user.id]);

    const toggleBlock = async (u) => {
        setBusyId(u.id);
        try {
            await adminBlockUser(u.id, user.id, !u.is_blocked);
            setUsers((prev) => ({ ...prev, users: prev.users.map((x) => x.id === u.id ? { ...x, is_blocked: u.is_blocked ? 0 : 1 } : x) }));
            loadAll();
        } catch { /* ignore */ } finally { setBusyId(null); }
    };

    const changePlan = async (u, plan) => {
        setBusyId(u.id);
        try {
            await adminSetPlan(u.id, user.id, plan);
            setUsers((prev) => ({ ...prev, users: prev.users.map((x) => x.id === u.id ? { ...x, plan } : x) }));
        } catch { /* ignore */ } finally { setBusyId(null); }
    };

    if (denied) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="panel rounded-2xl p-8 max-w-sm text-center space-y-3">
                    <Lock size={32} className="mx-auto text-text-muted" />
                    <h1 className="text-lg font-bold text-text-primary">Restricted</h1>
                    <p className="text-sm text-text-muted">This console is for platform super admins only.</p>
                    <Button variant="ghost" size="md" onClick={() => navigate('/dashboard')}>Back to dashboard</Button>
                </div>
            </div>
        );
    }

    const TABS = [{ key: 'overview', label: 'Overview', icon: TrendingUp }, { key: 'users', label: 'Users', icon: Users }, { key: 'orgs', label: 'Organizations', icon: Building2 }, { key: 'admins', label: 'Admins', icon: Shield }, { key: 'audit', label: 'Audit', icon: Activity }];

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                    <Shield size={22} className="text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">Super Admin</h1>
                    <p className="text-sm text-text-muted">Platform monitoring & access control</p>
                </div>
            </div>

            <Tabs tabs={TABS} active={tab} onChange={setTab} />

            {/* OVERVIEW */}
            {tab === 'overview' && (
                !overview ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-accent-primary" size={22} /></div> : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard icon={Users} label="Total Users" value={overview.total_users ?? '--'} hint={`+${overview.new_users_7d} this week`} />
                            <StatCard icon={GraduationCap} label="Individuals" value={overview.individuals ?? '--'} />
                            <StatCard icon={Building2} label="Organizations" value={overview.total_orgs ?? '--'} />
                            <StatCard icon={Activity} label="Active (7d)" value={overview.active_7d ?? '--'} hint={`${overview.active_30d} in 30d`} />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard icon={School} label="Schools" value={overview.schools ?? '--'} />
                            <StatCard icon={BookOpen} label="Universities" value={overview.universities ?? '--'} />
                            <StatCard icon={Briefcase} label="Enterprises" value={overview.enterprises ?? '--'} />
                            <StatCard icon={Ban} label="Blocked" value={overview.blocked_users ?? '--'} />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard icon={TrendingUp} label="Lessons Completed" value={overview.lessons_completed ?? '--'} />
                            <StatCard icon={Sparkles} label="AI Lessons Generated" value={overview.generated_lessons ?? '--'} />
                            <StatCard icon={Activity} label="Generation Jobs" value={overview.generation_jobs ?? '--'} />
                            <StatCard icon={GraduationCap} label="Training Pairs" value={overview.training_pairs ?? '--'} hint="for fine-tuning" />
                        </div>
                        <UsageChart series={usage} />
                    </div>
                )
            )}

            {/* USERS */}
            {tab === 'users' && (
                <div className="space-y-3">
                    <form onSubmit={(e) => { e.preventDefault(); setUsers(null); loadUsers(q); }} className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, username, or email… (Enter)" aria-label="Search users"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border-default bg-bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus" />
                    </form>
                    {users === null ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-accent-primary" size={22} /></div> : (
                        <Card className="overflow-hidden">
                            <div className="px-4 py-2 text-xs text-text-muted border-b border-border-default">{users.total} users</div>
                            <Table>
                                <THead>
                                    <TH>User</TH><TH>Type</TH><TH>Org</TH><TH>XP</TH><TH>Plan</TH><TH>Status</TH><TH>Access</TH>
                                </THead>
                                <TBody>
                                    {users.users.map((u) => (
                                        <TR key={u.id} onClick={() => setOpenUserId(u.id)} className={`hover:bg-bg-elevated/50 cursor-pointer ${u.is_blocked ? 'opacity-60' : ''}`}>
                                            <TD>
                                                <div className="font-semibold text-text-primary">{u.name || u.username || '—'}</div>
                                                <div className="text-xs text-text-muted">{u.email || u.username}</div>
                                            </TD>
                                            <TD><span className="text-xs text-text-secondary capitalize">{u.account_type}</span></TD>
                                            <TD className="text-xs text-text-muted">{u.org_name || '—'}</TD>
                                            <TD className="text-accent-primary font-semibold">{u.points || 0}</TD>
                                            <TD onClick={(e) => e.stopPropagation()}>
                                                <select value={u.plan} disabled={busyId === u.id} onChange={(e) => changePlan(u, e.target.value)} aria-label="Plan"
                                                    className="text-xs rounded-lg border border-border-default bg-bg-surface px-2 py-1 text-text-secondary">
                                                    {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                            </TD>
                                            <TD>
                                                {u.is_blocked
                                                    ? <Badge variant="danger">Blocked</Badge>
                                                    : <Badge variant="success">Active</Badge>}
                                            </TD>
                                            <TD onClick={(e) => e.stopPropagation()}>
                                                <Button onClick={() => toggleBlock(u)} disabled={busyId === u.id}
                                                    variant="outline" size="sm"
                                                    className={u.is_blocked ? 'border-green-200 text-green-600 hover:bg-green-50' : 'border-red-200 text-red-500 hover:bg-red-50'}>
                                                    {busyId === u.id ? <Loader2 size={12} className="animate-spin" /> : u.is_blocked ? <><CheckCircle2 size={12} /> Grant</> : <><Ban size={12} /> Block</>}
                                                </Button>
                                            </TD>
                                        </TR>
                                    ))}
                                </TBody>
                            </Table>
                        </Card>
                    )}
                </div>
            )}

            {openUserId && (
                <UserAdminDrawer
                    adminId={user.id}
                    targetId={openUserId}
                    onClose={() => setOpenUserId(null)}
                    onChanged={() => loadUsers(q)}
                    onViewAs={(u) => { setViewAsUser(u); setOpenUserId(null); }}
                />
            )}
            {viewAsUser && (
                <ViewAsPanel adminId={user.id} target={viewAsUser} onExit={() => setViewAsUser(null)} />
            )}

            {/* ORGS */}
            {tab === 'orgs' && (
                orgs === null ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-accent-primary" size={22} /></div> : (
                    <Card className="overflow-hidden">
                        <Table>
                            <THead>
                                <TH>Organization</TH><TH>Type</TH><TH>Members</TH><TH>Plan</TH><TH>Created</TH>
                            </THead>
                            <TBody>
                                {orgs.map((o) => (
                                    <TR key={o.id} onClick={() => setOpenOrgId(o.id)} className="hover:bg-bg-elevated/50 cursor-pointer">
                                        <TD className="font-semibold text-text-primary">{o.name}</TD>
                                        <TD><span className="text-xs capitalize text-text-secondary">{o.type}</span></TD>
                                        <TD className="text-text-secondary">{o.member_count}</TD>
                                        <TD><span className="text-xs capitalize text-text-muted">{o.plan}</span></TD>
                                        <TD className="text-xs text-text-muted">{o.created_at ? String(o.created_at).slice(0, 10) : '—'}</TD>
                                    </TR>
                                ))}
                                {orgs.length === 0 && <TR><TD colSpan={5} className="px-4 py-12 text-center text-text-muted text-sm">No organizations yet.</TD></TR>}
                            </TBody>
                        </Table>
                    </Card>
                )
            )}

            {openOrgId && (
                <OrgAdminDrawer adminId={user.id} orgId={openOrgId} onClose={() => setOpenOrgId(null)} onChanged={loadOrgs} />
            )}

            {/* ADMINS */}
            {tab === 'admins' && (
              <div className="space-y-4">
                <p className="text-sm text-text-muted">Super-admins have full platform control. Env break-glass admins are always active and can't be removed here.</p>
                <AdminPromote adminId={user.id} onChanged={() => { setUsers(null); }} />
                <AdminsList adminId={user.id} />
              </div>
            )}

            {/* AUDIT */}
            {tab === 'audit' && (
              <Card className="overflow-hidden">
                {audit === null ? <div className="p-6"><div className="h-10 bg-bg-elevated animate-pulse rounded" /></div> : audit.length === 0 ? <div className="p-6 text-sm text-text-muted">No admin actions yet.</div> : (
                  <Table>
                    <THead><TH className="py-3">When</TH><TH className="py-3">Actor</TH><TH className="py-3">Action</TH><TH className="py-3">Target</TH><TH className="py-3">Detail</TH></THead>
                    <TBody>
                      {audit.map((a) => (
                        <TR key={a.id} className="hover:bg-bg-elevated/50">
                          <TD className="py-2 text-text-muted whitespace-nowrap">{relTimeSA(a.created_at)}</TD>
                          <TD className="py-2 text-text-secondary">{a.actor_name}</TD>
                          <TD className="py-2"><Badge variant="neutral">{a.action}</Badge></TD>
                          <TD className="py-2 text-text-muted">{a.target_type ? `${a.target_type}:${String(a.target_id).slice(0,8)}` : '—'}</TD>
                          <TD className="py-2 text-text-muted truncate max-w-[200px]">{a.detail}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>
            )}
        </div>
    );
}
