import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getOrg, getOrgMembers, inviteToOrg, bulkInviteToOrg,
  updateMemberRole, removeMember, getOrgAnalytics, getMyOrgs
} from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Users, Mail, Send, Copy, Shield, Crown,
  UserX, BarChart3, TrendingUp, Trophy, Zap, Search,
  Plus, ChevronDown, ExternalLink, Check, AlertTriangle
} from 'lucide-react';

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

function StatCard({ icon: Icon, label, value, color = 'from-cyan-500 to-blue-500', sub }) {
  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-black/[0.05] p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-sm`}>
          <Icon size={18} className="text-white" />
        </div>
        <span className="text-sm text-slate-500 font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value ?? '--'}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function RoleBadge({ role }) {
  const cfg = ROLE_BADGES[role] || ROLE_BADGES.member;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.color}`}>
      <Icon size={10} /> {cfg.label}
    </span>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-cyan-600 transition-colors" title="Copy">
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
}

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

  const myRole = org?.my_role || (members.find((m) => m.user_id === user?.user_id)?.role) || 'member';
  const isAdmin = ['super_admin', 'admin'].includes(myRole);

  const loadOrg = useCallback(async () => {
    if (!activeOrg) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const orgId = activeOrg.org_id || activeOrg.id;
      const [orgRes, membersRes] = await Promise.all([
        getOrg(orgId, user.user_id),
        getOrgMembers(orgId, user.user_id),
      ]);
      setOrgData(orgRes.data);
      setMembers(Array.isArray(membersRes.data) ? membersRes.data : membersRes.data?.members || []);

      if (isAdmin || myRole === 'super_admin') {
        try {
          const analyticsRes = await getOrgAnalytics(orgId, user.user_id);
          setAnalytics(analyticsRes.data);
        } catch {
          // analytics may not be available
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load organization');
    } finally {
      setLoading(false);
    }
  }, [activeOrg, user?.user_id]);

  useEffect(() => {
    loadOrg();
  }, [loadOrg]);

  // If no org, try to fetch user orgs
  useEffect(() => {
    if (!activeOrg && user?.user_id) {
      getMyOrgs(user.user_id)
        .then((res) => {
          const orgs = res.data?.organizations || res.data || [];
          if (orgs.length > 0) {
            setOrg(orgs[0]);
          }
        })
        .catch(() => {});
    }
  }, [activeOrg, user?.user_id, setOrg]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const orgId = activeOrg.org_id || activeOrg.id;
      const res = await inviteToOrg(orgId, {
        email: inviteEmail.trim(),
        role: inviteRole,
        invited_by: user.user_id,
      });
      setInviteResult({ success: true, data: res.data });
      setInviteEmail('');
    } catch (err) {
      setInviteResult({ success: false, message: err.response?.data?.detail || 'Failed to send invite' });
    } finally {
      setInviting(false);
    }
  };

  const handleBulkInvite = async () => {
    const emails = bulkEmails.split(/[,\n]+/).map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const orgId = activeOrg.org_id || activeOrg.id;
      const res = await bulkInviteToOrg(orgId, {
        emails,
        role: bulkRole,
        invited_by: user.user_id,
      });
      setInviteResult({ success: true, data: res.data, bulk: true });
      setBulkEmails('');
    } catch (err) {
      setInviteResult({ success: false, message: err.response?.data?.detail || 'Failed to send invites' });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId, newRole) => {
    setActionLoading(memberId);
    try {
      const orgId = activeOrg.org_id || activeOrg.id;
      await updateMemberRole(orgId, memberId, { role: newRole, updated_by: user.user_id });
      setMembers(members.map((m) => ((m.user_id || m.id) === memberId ? { ...m, role: newRole } : m)));
    } catch {
      // silently fail
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (memberId) => {
    setActionLoading(memberId);
    try {
      const orgId = activeOrg.org_id || activeOrg.id;
      await removeMember(orgId, memberId, user.user_id);
      setMembers(members.filter((m) => (m.user_id || m.id) !== memberId));
      setConfirmRemove(null);
    } catch {
      // silently fail
    } finally {
      setActionLoading(null);
    }
  };

  // No org state
  if (!loading && !activeOrg && !org) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white/80 backdrop-blur-xl rounded-2xl border border-black/[0.05] p-8 max-w-md text-center shadow-sm"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 flex items-center justify-center mx-auto mb-5">
            <Building2 size={32} className="text-purple-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">No Organization Yet</h2>
          <p className="text-sm text-slate-500 mb-6">Create an organization to manage your team, track progress, and collaborate.</p>
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-3 border-cyan-200 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center max-w-md">
          <AlertTriangle size={24} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  const filteredMembers = members.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (m.name || '').toLowerCase().includes(q) ||
      (m.username || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q)
    );
  });

  const deptDistribution = {};
  members.forEach((m) => {
    const dept = m.department || 'Unassigned';
    deptDistribution[dept] = (deptDistribution[dept] || 0) + 1;
  });
  const maxDeptCount = Math.max(...Object.values(deptDistribution), 1);

  const roleDistribution = {};
  members.forEach((m) => {
    roleDistribution[m.role || 'member'] = (roleDistribution[m.role || 'member'] || 0) + 1;
  });

  const orgName = org?.name || activeOrg?.name || 'Organization';
  const orgType = org?.org_type || activeOrg?.org_type || 'other';

  const invites = org?.pending_invites || analytics?.pending_invites || [];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          {org?.logo_url ? (
            <img src={org.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-black/[0.05]" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Building2 size={24} className="text-white" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{orgName}</h1>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${TYPE_BADGES[orgType] || TYPE_BADGES.other}`}>
                {orgType}
              </span>
              {org?.plan && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {org.plan}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">{org?.description || `${members.length} members`}</p>
          </div>
        </div>
        <RoleBadge role={myRole} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/60 backdrop-blur-xl rounded-xl p-1 border border-black/[0.05] w-fit">
        {TABS.map((t) => {
          if (t.key === 'analytics' && !isAdmin) return null;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive ? 'text-cyan-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="org-tab"
                  className="absolute inset-0 bg-white rounded-lg shadow-sm border border-black/[0.05]"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <t.icon size={16} /> {t.label}
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
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Users} label="Total Members" value={members.length} />
                <StatCard
                  icon={Zap}
                  label="Avg XP"
                  value={members.length ? Math.round(members.reduce((a, m) => a + (m.xp || m.points || 0), 0) / members.length) : 0}
                  color="from-purple-500 to-pink-500"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Active Learners (7d)"
                  value={analytics?.active_7d ?? members.filter((m) => m.last_active_days !== undefined && m.last_active_days <= 7).length}
                  color="from-green-500 to-emerald-500"
                />
                <StatCard
                  icon={Trophy}
                  label="Lessons Completed"
                  value={analytics?.lessons_completed ?? members.reduce((a, m) => a + (m.lessons_completed || 0), 0)}
                  color="from-amber-500 to-orange-500"
                />
              </div>

              {/* Department Distribution */}
              {Object.keys(deptDistribution).length > 0 && (
                <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-black/[0.05] p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-4">Department Distribution</h3>
                  <div className="space-y-3">
                    {Object.entries(deptDistribution)
                      .sort((a, b) => b[1] - a[1])
                      .map(([dept, count]) => (
                        <div key={dept} className="flex items-center gap-3">
                          <span className="text-xs text-slate-500 w-24 truncate">{dept}</span>
                          <div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(count / maxDeptCount) * 100}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                              className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-lg"
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-600 w-8 text-right">{count}</span>
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
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, username, or email..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/[0.08] bg-white/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 text-sm text-slate-800 placeholder:text-slate-300 transition-all"
                />
              </div>

              {/* Members List */}
              <div className="space-y-2">
                {filteredMembers.map((m) => {
                  const memberId = m.user_id || m.id;
                  const initials = (m.name || m.username || '??').substring(0, 2).toUpperCase();
                  return (
                    <div key={memberId} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-black/[0.05] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {initials}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-900">{m.name || m.username}</span>
                          {m.username && m.name && (
                            <span className="text-xs text-slate-400">@{m.username}</span>
                          )}
                          <RoleBadge role={m.role || 'member'} />
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {m.email && <span className="text-xs text-slate-400">{m.email}</span>}
                          {m.department && <span className="text-xs text-slate-400">| {m.department}</span>}
                          <span className="text-xs text-cyan-600 font-medium">{m.xp || m.points || 0} XP</span>
                        </div>
                      </div>

                      {/* Links */}
                      <div className="flex items-center gap-2">
                        {m.linkedin && (
                          <a href={m.linkedin} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors">
                            <ExternalLink size={14} />
                          </a>
                        )}
                        {m.github && (
                          <a href={m.github} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>

                      {/* Admin Controls */}
                      {myRole === 'super_admin' && memberId !== user.user_id && (
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <select
                              value={m.role || 'member'}
                              onChange={(e) => handleRoleChange(memberId, e.target.value)}
                              disabled={actionLoading === memberId}
                              className="text-xs pl-2 pr-6 py-1.5 rounded-lg border border-black/[0.08] bg-white text-slate-600 focus:outline-none appearance-none"
                            >
                              <option value="member">Member</option>
                              <option value="manager">Manager</option>
                              <option value="admin">Admin</option>
                              <option value="super_admin">Super Admin</option>
                            </select>
                            <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
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
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmRemove(memberId)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
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
                  <div className="text-center py-12 text-slate-400 text-sm">
                    {searchQuery ? 'No members match your search.' : 'No members found.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========== INVITES TAB ========== */}
          {tab === 'invites' && (
            <div className="space-y-6">
              {/* Single Invite */}
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-black/[0.05] p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <Send size={14} className="text-cyan-500" /> Invite a Member
                </h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                    placeholder="member@example.com"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-black/[0.08] bg-white/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 text-sm text-slate-800 placeholder:text-slate-300 transition-all"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-black/[0.08] bg-white text-sm text-slate-600 focus:outline-none"
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
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-black/[0.05] p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <Mail size={14} className="text-purple-500" /> Bulk Invite
                </h3>
                <textarea
                  value={bulkEmails}
                  onChange={(e) => setBulkEmails(e.target.value)}
                  placeholder={"Paste emails separated by commas or newlines\nalice@example.com, bob@example.com"}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-black/[0.08] bg-white/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 text-sm text-slate-800 placeholder:text-slate-300 transition-all resize-none mb-3"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={bulkRole}
                    onChange={(e) => setBulkRole(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-black/[0.08] bg-white text-sm text-slate-600 focus:outline-none"
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
                      : inviteResult.message}
                  </div>
                  {inviteResult.success && inviteResult.data?.invite_link && (
                    <div className="mt-2 flex items-center gap-2 bg-white/60 rounded-lg px-3 py-2">
                      <span className="text-xs text-slate-600 truncate flex-1 font-mono">{inviteResult.data.invite_link}</span>
                      <CopyButton text={inviteResult.data.invite_link} />
                    </div>
                  )}
                  {inviteResult.success && inviteResult.data?.invites && (
                    <div className="mt-2 space-y-1">
                      {inviteResult.data.invites.map((inv, i) => (
                        <div key={i} className="flex items-center gap-2 bg-white/60 rounded-lg px-3 py-2">
                          <span className="text-xs text-slate-600 flex-1">{inv.email}</span>
                          {inv.invite_link && <CopyButton text={inv.invite_link} />}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Pending Invites */}
              {Array.isArray(invites) && invites.length > 0 && (
                <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-black/[0.05] p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-4">Pending Invites</h3>
                  <div className="space-y-2">
                    {invites.map((inv, i) => (
                      <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 rounded-xl bg-slate-50/80 border border-black/[0.04]">
                        <Mail size={14} className="text-slate-400 shrink-0" />
                        <span className="text-sm text-slate-700 flex-1">{inv.email}</span>
                        <RoleBadge role={inv.role || 'member'} />
                        {inv.token && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-mono text-slate-400 truncate max-w-[120px]">{inv.token}</span>
                            <CopyButton text={inv.token} />
                          </div>
                        )}
                        {inv.expires_at && (
                          <span className="text-[10px] text-slate-400">
                            Exp: {new Date(inv.expires_at).toLocaleDateString()}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          inv.status === 'accepted' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'
                        }`}>
                          {inv.status || 'pending'}
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
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard icon={Users} label="Members" value={analytics?.total_members ?? members.length} />
                <StatCard
                  icon={Zap}
                  label="Avg XP"
                  value={analytics?.avg_xp ?? (members.length ? Math.round(members.reduce((a, m) => a + (m.xp || m.points || 0), 0) / members.length) : 0)}
                  color="from-purple-500 to-pink-500"
                />
                <StatCard
                  icon={Trophy}
                  label="Top XP"
                  value={analytics?.top_xp ?? Math.max(0, ...members.map((m) => m.xp || m.points || 0))}
                  color="from-amber-500 to-orange-500"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Active (7d)"
                  value={analytics?.active_7d ?? '--'}
                  color="from-green-500 to-emerald-500"
                />
                <StatCard
                  icon={BarChart3}
                  label="Lessons Done"
                  value={analytics?.lessons_completed ?? '--'}
                  color="from-blue-500 to-indigo-500"
                />
              </div>

              {/* Role Distribution */}
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-black/[0.05] p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-4">Role Distribution</h3>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(roleDistribution).map(([role, count]) => {
                    const cfg = ROLE_BADGES[role] || ROLE_BADGES.member;
                    return (
                      <div key={role} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${cfg.color}`}>
                        <cfg.icon size={14} />
                        <span className="text-sm font-semibold">{cfg.label}</span>
                        <span className="text-xs font-bold bg-white/60 px-1.5 py-0.5 rounded-full">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Department Breakdown */}
              {Object.keys(deptDistribution).length > 0 && (
                <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-black/[0.05] p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-4">Department Breakdown</h3>
                  <div className="space-y-3">
                    {Object.entries(deptDistribution)
                      .sort((a, b) => b[1] - a[1])
                      .map(([dept, count]) => (
                        <div key={dept} className="flex items-center gap-3">
                          <span className="text-xs text-slate-500 w-28 truncate">{dept}</span>
                          <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden">
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
