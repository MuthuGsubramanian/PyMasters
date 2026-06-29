import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getOrg, getOrgMembers, inviteToOrg, bulkInviteToOrg,
  updateMemberRole, removeMember, getOrgAnalytics, getOrgProgress, getMyOrgs, deleteOrg,
  getOrgGroups, updateOrg
} from '../api';
import StudentDrawer from '../components/StudentDrawer';
import { motion, AnimatePresence } from 'framer-motion';
import { safeErrorMsg } from '../utils/errorUtils';
import {
  Badge, Card, StatCard, Button, Avatar, Tabs,
  Table, THead, TH, TBody, TR, TD, FormField,
} from '../components/ui';
import {
  Building2, Users, Mail, Send, Copy, Shield, Crown,
  UserX, BarChart3, TrendingUp, Trophy, Zap, Search,
  Plus, ChevronDown, ExternalLink, Check, AlertTriangle,
  Upload, Rocket, X, Loader2, GraduationCap, Activity
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const TABS = [
  { key: 'overview', label: 'Overview', icon: Building2 },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'students', label: 'Students', icon: GraduationCap },
  { key: 'invites', label: 'Invites', icon: Mail },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
];

/* Relative time from a UTC-ish timestamp string (SQLite "YYYY-MM-DD HH:MM:SS" or ISO). */
function relTime(ts) {
  if (!ts) return 'never';
  let iso = String(ts).replace(' ', 'T');
  if (!/[zZ]|[+\-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '—';
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/* Derive a learner status from progress fields. Returns a Badge variant. */
function studentStatus(s) {
  if ((s.struggle_count || 0) >= 3) return { label: 'At risk', variant: 'danger' };
  if ((s.signals_7d || 0) > 0) return { label: 'Active', variant: 'success' };
  if (s.last_active) {
    let iso = String(s.last_active).replace(' ', 'T');
    if (!/[zZ]|[+\-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
    const then = new Date(iso).getTime();
    if (!isNaN(then) && (Date.now() - then) < 30 * 86400000) return { label: 'Idle', variant: 'warning' };
  }
  return { label: 'Inactive', variant: 'neutral' };
}

const ROLE_BADGES = {
  super_admin: { label: 'Super Admin', variant: 'warning', icon: Crown },
  admin: { label: 'Admin', variant: 'primary', icon: Shield },
  manager: { label: 'Manager', variant: 'info', icon: Shield },
  member: { label: 'Member', variant: 'neutral', icon: Users },
};

const TYPE_BADGES = {
  school: 'success',
  university: 'info',
  enterprise: 'primary',
  other: 'neutral',
};

/* Helper: parse emails from uploaded file */
async function parseEmailFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const emails = [];

  if (ext === 'xlsx' || ext === 'xls') {
    const { read, utils } = await import('xlsx');  // load the heavy parser only on demand
    const data = await file.arrayBuffer();
    const wb = read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = utils.sheet_to_json(ws, { header: 1 });
    for (let i = 0; i < rows.length; i++) {
      const cell = String(rows[i]?.[0] || '').trim();
      if (!cell) continue;
      if (i === 0 && /^(email|mail|name|e-mail)/i.test(cell)) continue;
      if (cell.includes('@')) emails.push(cell);
    }
  } else {
    const text = await file.text();
    const lines = text.split(/[\n,;]+/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && trimmed.includes('@')) emails.push(trimmed);
    }
  }

  return [...new Set(emails)];
}

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
function RoleBadge({ role }) {
  const cfg = ROLE_BADGES[role] || ROLE_BADGES.member;
  const BadgeIcon = cfg.icon;
  return (
    <Badge variant={cfg.variant}>
      <BadgeIcon size={10} /> {cfg.label}
    </Badge>
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
    <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-accent-primary transition-colors" title="Copy">
      {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  InvitePromptCard — shown when org has only 1 member               */
/* ------------------------------------------------------------------ */
function InvitePromptCard({ orgId, userId, onInviteSent }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(`pm_invite_prompt_dismissed_${orgId}`) === '1'; } catch { return false; }
  });
  const [fileEmails, setFileEmails] = useState([]);
  const [fileRole, setFileRole] = useState('member');
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const fileInputRef = useRef(null);

  if (dismissed) return null;

  const handleSingleInvite = async () => {
    if (!email.trim() || sending) return;
    setSending(true);
    setResult(null);
    try {
      await inviteToOrg(orgId, { email: email.trim(), role, user_id: userId });
      setResult({ ok: true, msg: `Invited ${email.trim()}` });
      setEmail('');
      onInviteSent?.();
    } catch (err) {
      setResult({ ok: false, msg: safeErrorMsg(err, 'Failed to send invite') });
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const emails = await parseEmailFile(file);
    setFileEmails(emails);
    setBulkResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBulkSend = async () => {
    if (fileEmails.length === 0 || bulkSending) return;
    setBulkSending(true);
    setBulkResult(null);
    try {
      const invites = fileEmails.map(em => ({ email: em, role: fileRole }));
      await bulkInviteToOrg(orgId, { invites, user_id: userId });
      setBulkResult({ ok: true, msg: `Sent ${fileEmails.length} invites` });
      setFileEmails([]);
      onInviteSent?.();
    } catch (err) {
      setBulkResult({ ok: false, msg: safeErrorMsg(err, 'Bulk invite failed') });
    } finally {
      setBulkSending(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(`pm_invite_prompt_dismissed_${orgId}`, '1'); } catch {}
  };

  return (
    <Card className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-text-primary font-bold text-base flex items-center gap-2">
            <Rocket size={18} className="text-accent-primary" /> Get your team started
          </h3>
          <p className="text-text-muted text-sm mt-1">Invite learners to start their Python journey with your organization.</p>
        </div>
        <button onClick={handleDismiss} className="text-text-muted hover:text-text-secondary p-1" title="Dismiss">
          <X size={16} />
        </button>
      </div>

      <div className="flex gap-2 items-center">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          aria-label="Email address"
          className="input-neo flex-1 py-2 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && handleSingleInvite()}
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Invite role" className="input-neo w-28 py-2 text-sm">
          <option value="member">Member</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
        <Button onClick={handleSingleInvite} disabled={sending || !email.trim()} variant="primary" size="sm" className="py-2 px-4">
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </Button>
      </div>
      {result && (
        <p className={`text-xs ${result.ok ? 'text-emerald-600' : 'text-red-500'}`}>{result.msg}</p>
      )}

      <div className="border-t border-border-default pt-3">
        <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer hover:text-text-secondary transition-colors">
          <Upload size={14} />
          <span>Upload file (.csv, .xlsx, .txt)</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {fileEmails.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary font-medium">{fileEmails.length} emails found</p>
              <select value={fileRole} onChange={(e) => setFileRole(e.target.value)} aria-label="Bulk invite role" className="input-neo w-28 py-1 text-xs">
                <option value="member">Member</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="max-h-32 overflow-y-auto bg-bg-inset rounded-lg p-2 text-xs text-text-muted space-y-0.5">
              {fileEmails.map((em, i) => <div key={i}>{em}</div>)}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleBulkSend} disabled={bulkSending} variant="primary" size="sm" className="py-1.5 px-4">
                {bulkSending ? 'Sending...' : `Invite all ${fileEmails.length}`}
              </Button>
              <Button onClick={() => setFileEmails([])} variant="ghost" size="sm" className="py-1.5 px-4">
                Clear
              </Button>
            </div>
            {bulkResult && (
              <p className={`text-xs ${bulkResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>{bulkResult.msg}</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  DeleteOrgModal                                                      */
/* ------------------------------------------------------------------ */
function DeleteOrgModal({ orgName, orgId, userId, onDeleted, onClose }) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const canDelete = confirmText === orgName;

  const handleDelete = async () => {
    if (!canDelete || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await deleteOrg(orgId, userId);
      onDeleted();
    } catch (err) {
      setError(safeErrorMsg(err, 'Failed to delete organization'));
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <Card className="p-6 max-w-md w-full space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-text-primary font-bold">Delete Organization</h3>
            <p className="text-text-muted text-xs">This action cannot be undone</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary">
          This will permanently delete <strong>{orgName}</strong>, remove all members, and cancel all pending invites. Member accounts will not be deleted.
        </p>

        <FormField label={`Type "${orgName}" to confirm`}>
          {(id) => (
            <input
              id={id}
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="input-neo py-2 text-sm"
              placeholder={orgName}
            />
          )}
        </FormField>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 justify-end">
          <Button onClick={onClose} variant="ghost" size="sm" className="py-2 px-4">Cancel</Button>
          <Button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            variant="danger"
            size="sm"
            className="py-2 px-4"
          >
            {deleting ? 'Deleting...' : 'Delete Organization'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function OrgDashboard() {
  useEffect(() => { document.title = 'Admin Console — PyMasters'; }, []);
  const { user, activeOrg, setOrg } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('overview');
  const [org, setOrgData] = useState(null);
  const [members, setMembers] = useState([]);
  const [showDeleteOrg, setShowDeleteOrg] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [progress, setProgress] = useState(null);
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

  // Groups / drawer state
  const [groups, setGroups] = useState([]);          // [{name, count}]
  const [ungrouped, setUngrouped] = useState(0);
  const [groupLabel, setGroupLabel] = useState('Group');
  const [groupFilter, setGroupFilter] = useState(null); // null = all; '__ungrouped__' = untagged
  const [openStudentId, setOpenStudentId] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

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
  const canViewProgress = isAdmin || myRole === 'manager';

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

  const loadGroups = useCallback(async () => {
    const orgId = getOrgId(activeOrg);
    const uid = user?.id;
    if (!orgId || !uid) return;
    try {
      const res = await getOrgGroups(orgId, uid);
      setGroups(res?.data?.groups || []);
      setUngrouped(res?.data?.ungrouped || 0);
      setGroupLabel(res?.data?.group_label || 'Group');
    } catch { /* groups non-critical */ }
  }, [activeOrg, user]);

  useEffect(() => { if (canViewProgress) loadGroups(); }, [canViewProgress, loadGroups]);

  useEffect(() => {
    const orgId = getOrgId(activeOrg);
    const uid = user?.id;
    if (!orgId || !uid || !canViewProgress) return;
    let cancelled = false;
    getOrgProgress(orgId, uid, groupFilter)
      .then((res) => { if (!cancelled) setProgress(res?.data?.students || []); })
      .catch(() => { /* keep prior progress */ });
    return () => { cancelled = true; };
  }, [groupFilter, refreshTick, activeOrg, user, canViewProgress]);

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
        <Card
          as={motion.div}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="p-4 max-w-md text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 flex items-center justify-center mx-auto mb-5">
            <Building2 size={32} className="text-accent-primary" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">No Organization Yet</h2>
          <p className="text-sm text-text-muted mb-6">Create an organization to manage your team, track progress, and collaborate.</p>
          <Button
            onClick={() => navigate('/dashboard/org/setup')}
            variant="primary"
            size="lg"
            className="inline-flex"
          >
            <Plus size={16} /> Create Organization
          </Button>
        </Card>
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

  const maxGroupCount = groups.length ? Math.max(1, ...groups.map((g) => g.count)) : 1;

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
            <img src={String(org.logo_url)} alt="" className="w-12 h-12 rounded-xl object-cover border border-border-default" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <Building2 size={24} className="text-white" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-text-primary">{orgName}</h1>
              <Badge variant={TYPE_BADGES[orgType] || TYPE_BADGES.other} className="uppercase">
                {orgType}
              </Badge>
              {org?.plan && (
                <Badge variant="warning" className="uppercase">
                  {String(org.plan)}
                </Badge>
              )}
            </div>
            <p className="text-sm text-text-muted">{org?.description ? String(org.description) : `${memberCount} members`}</p>
          </div>
        </div>
        <RoleBadge role={myRole} />
      </div>

      {/* Tabs */}
      <Tabs
        className="mb-4"
        tabs={TABS.filter((t) => {
          if (t.key === 'analytics' && !isAdmin) return false;
          if (t.key === 'invites' && !isAdmin) return false;
          if (t.key === 'students' && !canViewProgress) return false;
          return true;
        })}
        active={tab}
        onChange={setTab}
      />

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
              {members.length <= 1 && (
                <InvitePromptCard
                  orgId={getOrgId(activeOrg)}
                  userId={user?.id}
                  onInviteSent={() => loadOrg()}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Users} label="Total Members" value={memberCount} />
                <StatCard icon={Zap} label="Avg XP" value={avgXp} />
                <StatCard icon={TrendingUp} label="Active Learners (7d)" value={activeLearners} />
                <StatCard icon={Trophy} label="Lessons Completed" value={lessonsCompleted} />
              </div>

              {groups.length > 0 && (
                <Card className="p-4">
                  <h3 className="text-sm font-bold text-text-secondary mb-4">{groupLabel} Distribution</h3>
                  <div className="space-y-3">
                    {groups.map((g) => (
                      <div key={g.name} className="flex items-center gap-3">
                        <span className="text-xs text-text-muted w-24 truncate">{g.name}</span>
                        <div className="flex-1 h-6 bg-bg-elevated rounded-lg overflow-hidden">
                          <div className="h-full bg-gradient-primary rounded-lg" style={{ width: `${(g.count / maxGroupCount) * 100}%` }} />
                        </div>
                        <span className="text-xs font-bold text-text-secondary w-8 text-right">{g.count}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {isAdmin && (
                <Card className="p-4 flex items-center gap-3 flex-wrap">
                  <label htmlFor="org-group-label" className="text-sm font-bold text-text-secondary">Group label</label>
                  <input
                    id="org-group-label"
                    key={getOrgId(activeOrg)}
                    defaultValue={groupLabel}
                    onBlur={async (e) => {
                      const v = e.target.value.trim().slice(0, 30);
                      if (v && v !== groupLabel) {
                        try { await updateOrg(getOrgId(activeOrg), { group_label: v, user_id: user?.id }); setGroupLabel(v); loadGroups(); } catch { /* ignore */ }
                      }
                    }}
                    className="input-neo py-1.5 px-3 text-sm w-40"
                    placeholder="Group"
                  />
                  <span className="text-xs text-text-muted">What a group is called for your org (e.g. Class, Batch, Team).</span>
                </Card>
              )}

              {activeOrg?.role === 'super_admin' && (
                <div className="border-t border-border-default pt-4 mt-4">
                  <Button
                    onClick={() => setShowDeleteOrg(true)}
                    variant="link"
                    size="sm"
                    className="text-xs text-red-500 hover:text-red-600 px-0"
                  >
                    Delete Organization
                  </Button>
                </div>
              )}

              {showDeleteOrg && (
                <DeleteOrgModal
                  orgName={getOrgName(org, activeOrg)}
                  orgId={getOrgId(activeOrg)}
                  userId={user?.id}
                  onDeleted={() => {
                    setOrg(null);
                    navigate('/dashboard');
                  }}
                  onClose={() => setShowDeleteOrg(false)}
                />
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
                  aria-label="Search members"
                  className="input-neo w-full pl-10 pr-4 py-2.5 text-sm"
                />
              </div>

              {/* Members List */}
              <div className="space-y-2">
                {filteredMembers.map((m) => {
                  const memberId = m.user_id || m.id || '';
                  const displayName = String(m.name || m.username || '??');
                  return (
                    <Card key={memberId || Math.random()} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Avatar */}
                      <Avatar name={displayName} size="md" />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-text-primary truncate">{displayName}</span>
                          {m.username && m.name && (
                            <span className="text-xs text-text-muted shrink-0">@{String(m.username)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted min-w-0">
                          {m.email && <span className="truncate">{String(m.email)}</span>}
                          {m.department && <span className="text-text-disabled shrink-0">· {String(m.department)}</span>}
                        </div>
                      </div>

                      {/* Meta: role + XP (right-aligned) */}
                      <div className="flex items-center gap-3 shrink-0 sm:ml-auto">
                        <RoleBadge role={m.role || 'member'} />
                        <span className="text-xs text-accent-primary font-semibold whitespace-nowrap">{Number(m.xp || m.points) || 0} XP</span>
                      </div>

                      {/* Links */}
                      <div className="flex items-center gap-2">
                        {m.linkedin_url && (
                          <a href={String(m.linkedin_url)} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-accent-primary transition-colors">
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
                              aria-label={`Change role for ${displayName}`}
                              className="text-xs pl-2 pr-6 py-1.5 rounded-lg border border-border-default bg-bg-surface text-text-secondary focus:outline-none appearance-none"
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
                              <Button
                                onClick={() => handleRemove(memberId)}
                                disabled={actionLoading === memberId}
                                variant="danger"
                                size="sm"
                                className="px-2 py-1 text-[10px]"
                              >
                                Confirm
                              </Button>
                              <Button
                                onClick={() => setConfirmRemove(null)}
                                variant="ghost"
                                size="sm"
                                className="px-2 py-1 text-[10px]"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmRemove(memberId)}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-500 transition-colors"
                              title="Remove member"
                            >
                              <UserX size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </Card>
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
              <Card className="p-4">
                <h3 className="text-sm font-bold text-text-secondary mb-4 flex items-center gap-2">
                  <Send size={14} className="text-accent-primary" /> Invite a Member
                </h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                    placeholder="member@example.com"
                    aria-label="Member email to invite"
                    className="input-neo flex-1 min-w-0 px-4 py-2.5 text-sm"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    aria-label="Invite role"
                    className="input-neo w-full sm:w-32 px-3 py-2.5 text-sm"
                  >
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button
                    onClick={handleInvite}
                    disabled={inviting || !inviteEmail.trim()}
                    variant="primary"
                    className="px-5 py-2.5"
                  >
                    <Send size={14} /> Send Invite
                  </Button>
                </div>
              </Card>

              {/* Bulk Invite */}
              <Card className="p-4">
                <h3 className="text-sm font-bold text-text-secondary mb-4 flex items-center gap-2">
                  <Mail size={14} className="text-accent-primary" /> Bulk Invite
                </h3>
                <textarea
                  value={bulkEmails}
                  onChange={(e) => setBulkEmails(e.target.value)}
                  placeholder={"Paste emails separated by commas or newlines\nalice@example.com, bob@example.com"}
                  rows={3}
                  aria-label="Bulk invite emails"
                  className="input-neo w-full px-4 py-3 text-sm resize-none mb-3"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={bulkRole}
                    onChange={(e) => setBulkRole(e.target.value)}
                    aria-label="Bulk invite role"
                    className="input-neo px-3 py-2 text-sm"
                  >
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button
                    onClick={handleBulkInvite}
                    disabled={inviting || !bulkEmails.trim()}
                    variant="primary"
                    className="px-5 py-2"
                  >
                    <Send size={14} /> Send All
                  </Button>
                </div>
              </Card>

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
                    <div className="mt-2 flex items-center gap-2 bg-bg-surface rounded-lg px-3 py-2">
                      <span className="text-xs text-text-secondary truncate flex-1 font-mono">{String(inviteResult.data.token)}</span>
                      <CopyButton text={inviteResult.data.token} />
                    </div>
                  )}
                  {inviteResult.success && Array.isArray(inviteResult.data?.invites) && (
                    <div className="mt-2 space-y-1">
                      {inviteResult.data.invites.map((inv, i) => (
                        <div key={i} className="flex items-center gap-2 bg-bg-surface rounded-lg px-3 py-2">
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
                <Card className="p-4">
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
                        <Badge variant={inv?.status === 'accepted' ? 'success' : 'warning'}>
                          {String(inv?.status || 'pending')}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ========== STUDENTS TAB ========== */}
          {tab === 'students' && canViewProgress && (
            <div className="space-y-4">
              {(groups.length > 0 || ungrouped > 0) && (
                <div className="flex flex-wrap gap-2" role="group" aria-label={`Filter by ${groupLabel}`}>
                  <button
                    onClick={() => setGroupFilter(null)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                      groupFilter === null
                        ? 'bg-gradient-primary text-white border-transparent shadow-glow'
                        : 'bg-bg-surface text-text-secondary border-border-default hover:bg-bg-elevated'
                    }`}
                  >
                    All
                  </button>
                  {groups.map((g) => (
                    <button
                      key={g.name}
                      onClick={() => setGroupFilter(g.name)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                        groupFilter === g.name
                          ? 'bg-gradient-primary text-white border-transparent shadow-glow'
                          : 'bg-bg-surface text-text-secondary border-border-default hover:bg-bg-elevated'
                      }`}
                    >
                      {g.name} <span className="opacity-70">({g.count})</span>
                    </button>
                  ))}
                  {ungrouped > 0 && (
                    <button
                      onClick={() => setGroupFilter('__ungrouped__')}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                        groupFilter === '__ungrouped__'
                          ? 'bg-gradient-primary text-white border-transparent shadow-glow'
                          : 'bg-bg-surface text-text-secondary border-border-default hover:bg-bg-elevated'
                      }`}
                    >
                      Ungrouped <span className="opacity-70">({ungrouped})</span>
                    </button>
                  )}
                </div>
              )}
              {progress === null ? (
                <div className="space-y-2">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-bg-elevated animate-pulse" />)}
                </div>
              ) : progress.length === 0 ? (
                <div className="text-center py-12 text-text-muted text-sm">
                  No students yet — invite learners and their progress will appear here.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatCard icon={Users} label="Students" value={progress.length} />
                    <StatCard icon={Activity} label="Active (7d)" value={progress.filter((s) => (s.signals_7d || 0) > 0).length} />
                    <StatCard icon={Trophy} label="Lessons Done" value={progress.reduce((a, s) => a + (s.lessons_completed || 0), 0)} />
                    <StatCard icon={AlertTriangle} label="At Risk" value={progress.filter((s) => (s.struggle_count || 0) >= 3).length} />
                  </div>

                  <Card className="overflow-hidden">
                    <Table>
                      <caption className="sr-only">Per-student progress</caption>
                      <THead>
                        <TH>Student</TH>
                        <TH>XP</TH>
                        <TH>Lessons</TH>
                        <TH>Last active</TH>
                        <TH>{groupLabel}s</TH>
                        <TH>Status</TH>
                      </THead>
                      <TBody>
                        {progress.map((s) => {
                          const st = studentStatus(s);
                          const name = String(s.name || s.username || '—');
                          return (
                            <TR
                              key={s.id}
                              onClick={() => setOpenStudentId(s.id)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenStudentId(s.id); } }}
                              tabIndex={0}
                              role="button"
                              aria-label={`Open ${name} detail`}
                              className="hover:bg-bg-elevated/50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-primary/40"
                            >
                              <TD>
                                <div className="flex items-center gap-2.5">
                                  <Avatar name={name} size="sm" />
                                  <div className="min-w-0">
                                    <div className="font-semibold text-text-primary truncate">{name}</div>
                                    {s.email && <div className="text-xs text-text-muted truncate">{String(s.email)}</div>}
                                  </div>
                                </div>
                              </TD>
                              <TD className="text-accent-primary font-semibold">{s.xp || 0}</TD>
                              <TD className="text-text-secondary">{s.lessons_completed || 0}</TD>
                              <TD className="text-text-muted">{relTime(s.last_active)}</TD>
                              <TD>
                                <div className="flex flex-wrap gap-1">
                                  {(s.groups || []).slice(0, 3).map((g) => (
                                    <Badge key={g} variant="primary">{g}</Badge>
                                  ))}
                                  {(s.groups || []).length > 3 && (
                                    <span className="text-[10px] text-text-muted">+{s.groups.length - 3}</span>
                                  )}
                                </div>
                              </TD>
                              <TD>
                                <Badge variant={st.variant}>{st.label}</Badge>
                              </TD>
                            </TR>
                          );
                        })}
                      </TBody>
                    </Table>
                  </Card>
                </>
              )}
              {openStudentId && (
                <StudentDrawer
                  orgId={getOrgId(activeOrg)}
                  userId={user?.id}
                  studentId={openStudentId}
                  canEdit={isAdmin}
                  groupLabel={groupLabel}
                  onClose={() => setOpenStudentId(null)}
                  onGroupsChanged={() => { loadGroups(); setRefreshTick((t) => t + 1); }}
                />
              )}
            </div>
          )}

          {/* ========== ANALYTICS TAB ========== */}
          {tab === 'analytics' && isAdmin && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard icon={Users} label="Members" value={typeof analytics?.total_members === 'number' ? analytics.total_members : memberCount} />
                <StatCard icon={Zap} label="Avg XP" value={typeof analytics?.avg_xp === 'number' ? analytics.avg_xp : avgXp} />
                <StatCard icon={Trophy} label="Top XP" value={typeof analytics?.top_xp === 'number' ? analytics.top_xp : topXp} />
                <StatCard icon={TrendingUp} label="Active (7d)" value={typeof analytics?.active_7d === 'number' ? analytics.active_7d : '--'} />
                <StatCard icon={BarChart3} label="Lessons Done" value={typeof analytics?.lessons_completed === 'number' ? analytics.lessons_completed : '--'} />
              </div>

              {/* Role Distribution */}
              <Card className="p-4">
                <h3 className="text-sm font-bold text-text-secondary mb-4">Role Distribution</h3>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(roleDistribution).map(([role, count]) => {
                    const cfg = ROLE_BADGES[role] || ROLE_BADGES.member;
                    const RoleIcon = cfg.icon;
                    return (
                      <Badge key={role} variant={cfg.variant} className="text-sm px-3 py-2 gap-2">
                        <RoleIcon size={14} />
                        <span className="font-semibold">{cfg.label}</span>
                        <span className="text-xs font-bold bg-bg-surface px-1.5 py-0.5 rounded-full">{count}</span>
                      </Badge>
                    );
                  })}
                </div>
              </Card>

              {/* Department Breakdown */}
              {Object.keys(deptDistribution).length > 0 && (
                <Card className="p-4">
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
                              className="h-full bg-gradient-primary rounded-lg flex items-center justify-end pr-2"
                            >
                              <span className="text-[10px] font-bold text-white">{count}</span>
                            </motion.div>
                          </div>
                        </div>
                      ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
