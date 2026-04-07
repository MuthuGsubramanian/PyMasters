import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getOrg, getOrgMembers, inviteToOrg, bulkInviteToOrg,
  updateMemberRole, removeMember, getOrgAnalytics, getMyOrgs
} from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { safeErrorMsg } from '../utils/errorUtils';
import {
  Building2, Users, Mail, Send, Copy, Shield, Crown,
  UserX, BarChart3, TrendingUp, Trophy, Zap, Search,
  Plus, ChevronDown, ExternalLink, Check, AlertTriangle
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const TABS = [
  { key: 'overview', label: 'Overview', icon: Building2 },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'invites', label: 'Invites', icon: Mail },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
];

const ROLE_BADGES = {
  super_admin: { label: 'Super Admin', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Crown },
  admin: { label: 'Admin', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Shield },
  manager: { label: 'Manager', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Shield },
  member: { label: 'Member', color: 'bg-slate-100 text-slate-600 border-slate-200', icon: Users },
};

const TYPE_BADGES = {
  school: 'bg-green-100 text-green-700',
  university: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
  other: 'bg-slate-100 text-slate-600',
};

/* Helper: safely extract org id from activeOrg (handles all 3 shapes) */
function getOrgId(activeOrg) {
  if (!activeOrg) return null;
  return activeOrg.org_id || activeOrg.id || null;
}

/* Helper: safely extract org name from various shapes */
function getOrgName(org, activeOrg) {
  return String(org?.name || activeOrg?.org_name || activeOrg?.name || 'Organization');
}

/* Helper: safely extract org type */
function getOrgType(org, activeOrg) {
  return String(org?.type || activeOrg?.org_type || activeOrg?.type || 'other');
}

/* ------------------------------------------------------------------ */
/*  Sub-components (pure, no hooks)                                    */
/* ------------------------------------------------------------------ */
function StatCard({ icon: Icon, label, value, color = 'from-cyan-500 to-blue-500', sub }) {
  if (!Icon) return null;
  const displayValue = (value !== null && value !== undefined) ? String(value) : '--';
  return (
    <div className="bg-bg-surface backdrop-blur-xl rounded-2xl border border-border-default p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-sm`}>
          <Icon size={18} className="text-white" />
        </div>
        <span className="text-sm text-text-muted font-medium">{String(label || '')}</span>
      </div>
      <div className="text-2xl font-bold text-text-primary">{displayValue}</div>
      {sub && <div className="text-xs text-text-muted mt-1">{String(sub)}</div>}
    </div>
  );
}

function RoleBadge({ role }) {
  const cfg = ROLE_BADGES[role] || ROLE_BADGES.member;
  const BadgeIcon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.color}`}>
      <BadgeIcon size={10} /> {cfg.label}
    </span>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    try { navigator.clipboard.writeText(String(text || '')); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-cyan-600 transition-colors" title="Copy">
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function OrgDashboard() {
  const { user, activeOrg, setOrg } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('overview');
  const [org, setOrgData] = useState(null);
  const [members, setMembers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Invites state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkRole, setBulkRole] = useState('member');
  const [inviteResult, setInviteResult] = useState(null);
  const [inviting, setInviting] = useState(false);

  // Member actions
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  /* ---- Derived (safe) ---- */
  const userId = user?.id || null;

  // Always-safe members array
  const safeMembers = Array.isArray(members) ? members : [];

  const myRole = useMemo(() => {
    if (org?.my_role) return String(org.my_role);
    const match = safeMembers.find((m) => (m.user_id || m.id) === userId);
    if (match?.role) return String(match.role);
    if (activeOrg?.role) return String(activeOrg.role);
    return 'member';
  }, [org, safeMembers, userId, activeOrg]);

  const isAdmin = myRole === 'super_admin' || myRole === 'admin';

  /* ---- Data loading ---- */
  const loadOrg = useCallback(async () => {
    const orgId = getOrgId(activeOrg);
    // Read user id fresh from user object to avoid stale closures
    const uid = user?.id || userId;
    if (!orgId || !uid) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');

      console.log('[OrgDashboard] loadOrg called with orgId=', orgId, 'uid=', uid);
      const [orgResult, membersResult] = await Promise.allSettled([
        getOrg(orgId, uid),
        getOrgMembers(orgId, uid),
      ]);
      console.log('[OrgDashboard] orgResult:', orgResult.status, orgResult.status === 'rejected' ? orgResult.reason?.response?.status : 'ok');
      console.log('[OrgDashboard] membersResult:', membersResult.status);

      if (orgResult.status === 'rejected') {
        const errMsg = safeErrorMsg(orgResult.reason, 'Failed to load organization');
        console.log('[OrgDashboard] Setting error (string check):', typeof errMsg, errMsg);
        setError(errMsg);
        setLoading(false);
        return;
      }

      const orgData = orgResult.value?.data || null;
      setOrgData(orgData);

      let membersList = [];
      if (membersResult.status === 'fulfilled') {
        const raw = membersResult.value?.data;
        membersList = raw?.members || (Array.isArray(raw) ? raw : []);
      }
      setMembers(membersList);

      // Analytics (requires manager+)
      const currentRole =
        orgData?.my_role ||
        membersList.find((m) => (m.user_id || m.id) === uid)?.role ||
        activeOrg?.role ||
        'member';

      if (['super_admin', 'admin', 'manager'].includes(currentRole)) {
        try {
          const analyticsRes = await getOrgAnalytics(orgId, uid);
          setAnalytics(analyticsRes?.data || null);
        } catch {
          /* analytics non-critical */
        }
      }
    } catch (err) {
      setError(safeErrorMsg(err, 'Failed to load organization'));
    } finally {
      setLoading(false);
    }
  }, [activeOrg, userId, user]);

  useEffect(() => { loadOrg(); }, [loadOrg]);

  // Auto-fetch user's orgs if none active
  useEffect(() => {
    if (!activeOrg && userId) {
      getMyOrgs(userId)
        .then((res) => {
          const orgs = res?.data?.organizations || (Array.isArray(res?.data) ? res.data : []);
          if (orgs.length > 0) setOrg(orgs[0]);
        })
        .catch(() => {});
    }
  }, [activeOrg, userId, setOrg]);

  /* ---- Event handlers (all with null guards) ---- */
  const handleInvite = async () => {
    if (!inviteEmail.trim() || !userId || !activeOrg) return;
    const orgId = getOrgId(activeOrg);
    if (!orgId) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await inviteToOrg(orgId, { email: inviteEmail.trim(), role: inviteRole, user_id: userId });
      setInviteResult({ success: true, data: res?.data });
      setInviteEmail('');
    } catch (err) {
      setInviteResult({ success: false, message: safeErrorMsg(err, 'Failed to send invite') });
    } finally {
      setInviting(false);
    }
  };

  const handleBulkInvite = async () => {
    const emails = bulkEmails.split(/[,\n]+/).map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0 || !userId || !activeOrg) return;
    const orgId = getOrgId(activeOrg);
    if (!orgId) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await bulkInviteToOrg(orgId, { emails, role: bulkRole, user_id: userId });
      setInviteResult({ success: true, data: res?.data, bulk: true });
      setBulkEmails('');
    } catch (err) {
      setInviteResult({ success: false, message: safeErrorMsg(err, 'Failed to send invites') });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId, newRole) => {
    if (!userId || !activeOrg) return;
    const orgId = getOrgId(activeOrg);
    if (!orgId) return;
    setActionLoading(memberId);
    try {
      await updateMemberRole(orgId, memberId, { new_role: newRole, user_id: userId });
      setMembers((prev) => (Array.isArray(prev) ? prev : []).map((m) => ((m.user_id || m.id) === memberId ? { ...m, role: newRole } : m)));
    } catch (err) {
      setError(safeErrorMsg(err, 'Failed to update role'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (memberId) => {
    if (!userId || !activeOrg) return;
    const orgId = getOrgId(activeOrg);
    if (!orgId) return;
    setActionLoading(memberId);
    try {
      await removeMember(orgId, memberId, userId);
      setMembers((prev) => (Array.isArray(prev) ? prev : []).filter((m) => (m.user_id || m.id) !== memberId));
      setConfirmRemove(null);
    } catch (err) {
      setError(safeErrorMsg(err, 'Failed to remove member'));
    } finally {
      setActionLoading(null);
    }
  };

  /* ================================================================ */
  /*  RENDER — early returns first                                     */
  /* ================================================================ */

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-cyan-200 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  // No org state
  if (!activeOrg && !org) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-bg-surface backdrop-blur-xl rounded-2xl border border-border-default p-4 max-w-md text-center shadow-sm"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 flex items-center justify-center mx-auto mb-5">
            <Building2 size={32} className="text-purple-500" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">No Organization Yet</h2>
          <p className="text-sm text-text-muted mb-6">Create an organization to manage your team, track progress, and collaborate.</p>
          <button
            onClick={() => navigate('/dashboard/org/setup')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-bold text-sm shadow-md shadow-purple-500/25 hover:shadow-lg hover:shadow-purple-500/30 transition-all"
          >
            <Plus size={16} /> Create Organization
          </button>
        </motion.div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center max-w-md">
          <AlertTriangle size={24} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-600 mb-4">{String(error)}</p>
          <button
            onClick={() => { setError(''); loadOrg(); }}
            className="px-4 py-2 rounded-xl bg-red-100 text-red-600 text-xs font-bold hover:bg-red-200 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  /* ---- Computed values for the main render ---- */
  const filteredMembers = safeMembers.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(m.name || '').toLowerCase().includes(q) ||
      String(m.username || '').toLowerCase().includes(q) ||
      String(m.email || '').toLowerCase().includes(q)
    );
  });

  const deptDistribution = {};
  safeMembers.forEach((m) => {
    const dept = String(m.department || 'Unassigned');
    deptDistribution[dept] = (deptDistribution[dept] || 0) + 1;
  });
  const deptValues = Object.values(deptDistribution);
  const maxDeptCount = deptValues.length > 0 ? Math.max(...deptValues) : 1;

  const roleDistribution = {};
  safeMembers.forEach((m) => {
    const role = String(m.role || 'member');
    roleDistribution[role] = (roleDistribution[role] || 0) + 1;
  });

  const orgName = getOrgName(org, activeOrg);
  const orgType = getOrgType(org, activeOrg);
  const invites = Array.isArray(org?.pending_invites) ? org.pending_invites : [];

  /* ---- Stat helpers (safe math) ---- */
  const memberCount = safeMembers.length;
  const avgXp = memberCount > 0
    ? Math.round(safeMembers.reduce((a, m) => a + (Number(m.xp || m.points) || 0), 0) / memberCount)
    : 0;
  const topXp = memberCount > 0
    ? Math.max(0, ...safeMembers.map((m) => Number(m.xp || m.points) || 0))
    : 0;
  const activeLearners = typeof analytics?.active_7d === 'number'
    ? analytics.active_7d
    : safeMembers.filter((m) => m.last_active_days !== undefined && m.last_active_days <= 7).length;
  const lessonsCompleted = typeof analytics?.lessons_completed === 'number'
    ? analytics.lessons_completed
    : safeMembers.reduce((a, m) => a + (Number(m.lessons_completed) || 0), 0);

  /* ================================================================ */
  /*  Main dashboard render                                            */
  /* ================================================================ */
  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          {org?.logo_url ? (
            <img src={String(org.logo_url)} alt="" className="w-12 h-12 rounded-xl object-cover border border-black/[0.05]" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Building2 size={24} className="text-white" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-text-primary">{orgName}</h1>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${TYPE_BADGES[orgType] || TYPE_BADGES.other}`}>
                {orgType}
              </span>
              {org?.plan && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {String(org.plan)}
                </span>
              )}
            </div>
            <p className="text-sm text-text-muted">{org?.description ? String(org.description) : `${memberCount} members`}</p>
          </div>
        </div>
        <RoleBadge role={myRole} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-bg-surface backdrop-blur-xl rounded-xl p-1 border border-border-default w-fit">
        {TABS.map((t) => {
          if (t.key === 'analytics' && !isAdmin) return null;
          const isActive = tab === t.key;
          const TabIcon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive ? 'text-cyan-700' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="org-tab-indicator"
                  className="absolute inset-0 bg-bg-surface rounded-lg shadow-sm border border-border-default"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <TabIcon size={16} /> {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {/* ========== OVERVIEW TAB ========== */}
          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Users} label="Total Members" value={memberCount} />
                <StatCard icon={Zap} label="Avg XP" value={avgXp} color="from-purple-500 to-pink-500" />
                <StatCard icon={TrendingUp} label="Active Learners (7d)" value={activeLearners} color="from-green-500 to-emerald-500" />
                <StatCard icon={Trophy} label="Lessons Completed" value={lessonsCompleted} color="from-amber-500 to-orange-500" />
              </div>

              {/* Department Distribution */}
              {Object.keys(deptDistribution).length > 0 && (
                <div className="bg-bg-surface backdrop-blur-xl rounded-2xl border border-border-default p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-text-secondary mb-4">Department Distribution</h3>
                  <div className="space-y-3">
                    {Object.entries(deptDistribution)
                      .sort((a, b) => b[1] - a[1])
                      .map(([dept, count]) => (
                        <div key={dept} className="flex items-center gap-3">
                          <span className="text-xs text-text-muted w-24 truncate">{dept}</span>
                          <div className="flex-1 h-6 bg-bg-elevated rounded-lg overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(count / maxDeptCount) * 100}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                              className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-lg"
                            />
                          </div>
                          <span className="text-xs font-bold text-text-secondary w-8 text-right">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========== MEMBERS TAB ========== */}
          {tab === 'members' && (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, username, or email..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/[0.08] bg-white/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 text-sm text-text-primary placeholder:text-text-muted transition-all"
                />
              </div>

              {/* Members List */}
              <div className="space-y-2">
                {filteredMembers.map((m) => {
                  const memberId = m.user_id || m.id || '';
                  const displayName = String(m.name || m.username || '??');
                  const initials = displayName.substring(0, 2).toUpperCase();
                  return (
                    <div key={memberId || Math.random()} className="bg-bg-surface backdrop-blur-xl rounded-2xl border border-border-default p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {initials}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-text-primary">{displayName}</span>
                          {m.username && m.name && (
                            <span className="text-xs text-text-muted">@{String(m.username)}</span>
                          )}
                          <RoleBadge role={m.role || 'member'} />
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {m.email && <span className="text-xs text-text-muted">{String(m.email)}</span>}
                          {m.department && <span className="text-xs text-text-muted">| {String(m.department)}</span>}
                          <span className="text-xs text-cyan-600 font-medium">{Number(m.xp || m.points) || 0} XP</span>
                        </div>
                      </div>

                      {/* Links */}
                      <div className="flex items-center gap-2">
                        {m.linkedin_url && (
                          <a href={String(m.linkedin_url)} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-blue-600 transition-colors">
                            <ExternalLink size={14} />
                          </a>
                        )}
                        {m.github_url && (
                          <a href={String(m.github_url)} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-text-secondary transition-colors">
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>

                      {/* Admin Controls */}
                      {myRole === 'super_admin' && memberId !== userId && (
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <select
                              value={m.role || 'member'}
                              onChange={(e) => handleRoleChange(memberId, e.target.value)}
                              disabled={actionLoading === memberId}
                              className="text-xs pl-2 pr-6 py-1.5 rounded-lg border border-black/[0.08] bg-bg-surface text-text-secondary focus:outline-none appearance-none"
                            >
                              <option value="member">Member</option>
                              <option value="manager">Manager</option>
                              <option value="admin">Admin</option>
                              <option value="super_admin">Super Admin</option>
                            </select>
                            <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                          </div>
                          {confirmRemove === memberId ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleRemove(memberId)}
                                disabled={actionLoading === memberId}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-red-500 text-white hover:bg-red-600 transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmRemove(null)}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-bg-elevated text-text-muted hover:bg-bg-elevated transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmRemove(memberId)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors"
                              title="Remove member"
                            >
                              <UserX size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredMembers.length === 0 && (
                  <div className="text-center py-12 text-text-muted text-sm">
                    {searchQuery ? 'No members match your search.' : 'No members found.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========== INVITES TAB ========== */}
          {tab === 'invites' && (
            <div className="space-y-4">
              {/* Single Invite */}
              <div className="bg-bg-surface backdrop-blur-xl rounded-2xl border border-border-default p-4 shadow-sm">
                <h3 className="text-sm font-bold text-text-secondary mb-4 flex items-center gap-2">
                  <Send size={14} className="text-cyan-500" /> Invite a Member
                </h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                    placeholder="member@example.com"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-black/[0.08] bg-white/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 text-sm text-text-primary placeholder:text-text-muted transition-all"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-black/[0.08] bg-bg-surface text-sm text-text-secondary focus:outline-none"
                  >
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={handleInvite}
                    disabled={inviting || !inviteEmail.trim()}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold text-sm hover:shadow-md hover:shadow-cyan-500/25 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    <Send size={14} /> Send Invite
                  </button>
                </div>
              </div>

              {/* Bulk Invite */}
              <div className="bg-bg-surface backdrop-blur-xl rounded-2xl border border-border-default p-4 shadow-sm">
                <h3 className="text-sm font-bold text-text-secondary mb-4 flex items-center gap-2">
                  <Mail size={14} className="text-purple-500" /> Bulk Invite
                </h3>
                <textarea
                  value={bulkEmails}
                  onChange={(e) => setBulkEmails(e.target.value)}
                  placeholder={"Paste emails separated by commas or newlines\nalice@example.com, bob@example.com"}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-black/[0.08] bg-white/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 text-sm text-text-primary placeholder:text-text-muted transition-all resize-none mb-3"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={bulkRole}
                    onChange={(e) => setBulkRole(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-black/[0.08] bg-bg-surface text-sm text-text-secondary focus:outline-none"
                  >
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={handleBulkInvite}
                    disabled={inviting || !bulkEmails.trim()}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-sm hover:shadow-md hover:shadow-purple-500/25 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    <Send size={14} /> Send All
                  </button>
                </div>
              </div>

              {/* Invite Result */}
              {inviteResult && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-2xl border p-4 ${
                    inviteResult.success
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-red-50 border-red-200 text-red-600'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {inviteResult.success ? <Check size={16} /> : <AlertTriangle size={16} />}
                    {inviteResult.success
                      ? inviteResult.bulk
                        ? 'Invites sent successfully!'
                        : 'Invite sent successfully!'
                      : String(inviteResult.message || 'Failed')}
                  </div>
                  {inviteResult.success && inviteResult.data?.token && (
                    <div className="mt-2 flex items-center gap-2 bg-white/60 rounded-lg px-3 py-2">
                      <span className="text-xs text-text-secondary truncate flex-1 font-mono">{String(inviteResult.data.token)}</span>
                      <CopyButton text={inviteResult.data.token} />
                    </div>
                  )}
                  {inviteResult.success && Array.isArray(inviteResult.data?.invites) && (
                    <div className="mt-2 space-y-1">
                      {inviteResult.data.invites.map((inv, i) => (
                        <div key={i} className="flex items-center gap-2 bg-white/60 rounded-lg px-3 py-2">
                          <span className="text-xs text-text-secondary flex-1">{String(inv?.email || '')}</span>
                          {inv?.token && <CopyButton text={inv.token} />}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Pending Invites */}
              {invites.length > 0 && (
                <div className="bg-bg-surface backdrop-blur-xl rounded-2xl border border-border-default p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-text-secondary mb-4">Pending Invites</h3>
                  <div className="space-y-2">
                    {invites.map((inv, i) => (
                      <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 rounded-xl bg-bg-elevated border border-border-default">
                        <Mail size={14} className="text-text-muted shrink-0" />
                        <span className="text-sm text-text-secondary flex-1">{String(inv?.email || '')}</span>
                        <RoleBadge role={inv?.role || 'member'} />
                        {inv?.token && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-mono text-text-muted truncate max-w-[120px]">{String(inv.token)}</span>
                            <CopyButton text={inv.token} />
                          </div>
                        )}
                        {inv?.expires_at && (
                          <span className="text-[10px] text-text-muted">
                            Exp: {new Date(inv.expires_at).toLocaleDateString()}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          inv?.status === 'accepted' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'
                        }`}>
                          {String(inv?.status || 'pending')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========== ANALYTICS TAB ========== */}
          {tab === 'analytics' && isAdmin && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard icon={Users} label="Members" value={typeof analytics?.total_members === 'number' ? analytics.total_members : memberCount} />
                <StatCard icon={Zap} label="Avg XP" value={typeof analytics?.avg_xp === 'number' ? analytics.avg_xp : avgXp} color="from-purple-500 to-pink-500" />
                <StatCard icon={Trophy} label="Top XP" value={typeof analytics?.top_xp === 'number' ? analytics.top_xp : topXp} color="from-amber-500 to-orange-500" />
                <StatCard icon={TrendingUp} label="Active (7d)" value={typeof analytics?.active_7d === 'number' ? analytics.active_7d : '--'} color="from-green-500 to-emerald-500" />
                <StatCard icon={BarChart3} label="Lessons Done" value={typeof analytics?.lessons_completed === 'number' ? analytics.lessons_completed : '--'} color="from-blue-500 to-indigo-500" />
              </div>

              {/* Role Distribution */}
              <div className="bg-bg-surface backdrop-blur-xl rounded-2xl border border-border-default p-4 shadow-sm">
                <h3 className="text-sm font-bold text-text-secondary mb-4">Role Distribution</h3>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(roleDistribution).map(([role, count]) => {
                    const cfg = ROLE_BADGES[role] || ROLE_BADGES.member;
                    const RoleIcon = cfg.icon;
                    return (
                      <div key={role} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${cfg.color}`}>
                        <RoleIcon size={14} />
                        <span className="text-sm font-semibold">{cfg.label}</span>
                        <span className="text-xs font-bold bg-white/60 px-1.5 py-0.5 rounded-full">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Department Breakdown */}
              {Object.keys(deptDistribution).length > 0 && (
                <div className="bg-bg-surface backdrop-blur-xl rounded-2xl border border-border-default p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-text-secondary mb-4">Department Breakdown</h3>
                  <div className="space-y-3">
                    {Object.entries(deptDistribution)
                      .sort((a, b) => b[1] - a[1])
                      .map(([dept, count]) => (
                        <div key={dept} className="flex items-center gap-3">
                          <span className="text-xs text-text-muted w-28 truncate">{dept}</span>
                          <div className="flex-1 h-7 bg-bg-elevated rounded-lg overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(count / maxDeptCount) * 100}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                              className="h-full bg-gradient-to-r from-purple-400 to-cyan-400 rounded-lg flex items-center justify-end pr-2"
                            >
                              <span className="text-[10px] font-bold text-white">{count}</span>
                            </motion.div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
