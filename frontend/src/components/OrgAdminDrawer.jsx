import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { X, ShieldCheck, ScrollText, Inbox } from 'lucide-react';
import {
  getAdminOrgDetail, adminSetOrgPlan, adminSetOrgType, adminDeleteOrg,
  adminSetUserRole, adminGetOrgAudit,
} from '../api';
import { safeErrorMsg } from '../utils/errorUtils';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Button, Badge } from './ui';

const PLANS = ['free', 'student', 'beginner', 'pro', 'enterprise'];
const TYPES = ['school', 'university', 'enterprise', 'other'];
const ORG_ROLES = ['super_admin', 'admin', 'manager', 'member'];

// What each org role may do — single source of truth for the console, mirrors
// the backend ROLE_LEVELS + require_org_role gates. Display-only.
const CAPABILITIES = [
  { cap: 'View lessons & analytics', roles: ['manager', 'admin', 'super_admin'] },
  { cap: 'Invite / bulk-invite members', roles: ['admin', 'super_admin'] },
  { cap: 'Tag members into groups', roles: ['admin', 'super_admin'] },
  { cap: 'Edit org name / type / logo', roles: ['admin', 'super_admin'] },
  { cap: 'Change member roles', roles: ['super_admin'] },
  { cap: 'Remove members', roles: ['admin', 'super_admin'] },
  { cap: 'Request a plan / enterprise', roles: ['super_admin'] },
  { cap: 'Delete the organization', roles: ['super_admin'] },
  { cap: 'Set the org plan (product-level)', roles: [] },  // platform admin only
];

function rel(ts) {
  if (!ts) return '';
  let iso = String(ts).replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (isNaN(m)) return '';
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

export default function OrgAdminDrawer({ adminId, orgId, onClose, onChanged }) {
  const reduced = useReducedMotion();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmDel, setConfirmDel] = useState('');
  const [tab, setTab] = useState('manage');
  const [audit, setAudit] = useState(null);
  const panelRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    getAdminOrgDetail(adminId, orgId)
      .then((r) => setD(r.data))
      .catch((e) => setError(safeErrorMsg(e, 'Failed')))
      .finally(() => setLoading(false));
  }, [adminId, orgId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab === 'audit' && audit === null) {
      adminGetOrgAudit(orgId).then((r) => setAudit(r.data.audit || [])).catch(() => setAudit([]));
    }
  }, [tab, audit, orgId]);

  useEscapeKey(onClose);
  useFocusTrap(panelRef, true);

  const act = async (key, fn) => {
    setBusy(key); setError('');
    try { await fn(); onChanged?.(); load(); return true; }
    catch (e) { setError(safeErrorMsg(e, 'Failed')); return false; }
    finally { setBusy(''); }
  };

  const superAdminCount = (d?.members || []).filter((m) => m.role === 'super_admin').length;

  const TABS = [
    { key: 'manage', label: 'Manage', icon: ShieldCheck },
    { key: 'caps', label: 'Roles', icon: Inbox },
    { key: 'audit', label: 'Audit', icon: ScrollText },
  ];

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Organization admin"
          onClick={(e) => e.stopPropagation()}
          initial={reduced ? false : { x: '100%' }} animate={reduced ? false : { x: 0 }}
          exit={reduced ? undefined : { x: '100%' }} transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          className="w-full max-w-md h-full overflow-y-auto bg-bg-surface border-l border-border-default shadow-2xl focus:outline-none">
          {loading ? (
            <div className="p-6"><div className="h-24 rounded-xl bg-bg-elevated animate-pulse" /></div>
          ) : d ? (
            <div>
              <div className="p-5 border-b border-border-default flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-text-primary">{d.name}</h2>
                  <p className="text-xs text-text-muted">{d.member_count} members · {d.type} · plan: {d.plan}</p>
                </div>
                <button onClick={onClose} aria-label="Close" className="text-text-muted p-1"><X size={18} /></button>
              </div>

              <div className="px-5 pt-3 flex gap-1">
                {TABS.map((t) => (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.key ? 'bg-accent-subtle text-accent-primary' : 'text-text-muted hover:text-text-secondary'}`}>
                    <t.icon size={13} aria-hidden="true" /> {t.label}
                  </button>
                ))}
              </div>

              {error ? <div className="px-5 py-2 text-xs text-red-500" role="alert">{error}</div> : null}

              {/* MANAGE: product-level plan/type (platform-only), members + roles */}
              {tab === 'manage' && (
                <div>
                  <div className="p-5 border-b border-border-default">
                    <p className="text-[11px] text-text-muted mb-2">
                      Product-level — platform admin only. Org admins cannot change these.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[11px] text-text-muted">Plan
                        <select disabled={busy === 'plan'} value={d.plan}
                          onChange={(e) => act('plan', () => adminSetOrgPlan(adminId, orgId, e.target.value))}
                          className="input-neo py-2 text-sm mt-0.5">
                          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </label>
                      <label className="text-[11px] text-text-muted">Type
                        <select disabled={busy === 'type'} value={d.type}
                          onChange={(e) => act('type', () => adminSetOrgType(adminId, orgId, e.target.value))}
                          className="input-neo py-2 text-sm mt-0.5">
                          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="mt-2">
                      {confirmDel === d.name ? (
                        <Button variant="danger" disabled={busy === 'del'}
                          onClick={async () => { if (await act('del', () => adminDeleteOrg(adminId, orgId))) onClose(); }}
                          className="w-full py-2 text-sm">Confirm delete org</Button>
                      ) : (
                        <input className="input-neo w-full py-2 text-sm"
                          aria-label={`Type the organization name "${d.name}" to confirm deletion`}
                          placeholder={`Type "${d.name}" to delete`} value={confirmDel}
                          onChange={(e) => setConfirmDel(e.target.value)} />
                      )}
                    </div>
                  </div>

                  <div className="p-5">
                    <h3 className="text-sm font-bold text-text-secondary mb-2">Members & roles</h3>
                    <ul className="space-y-2">
                      {(d.members || []).map((m) => {
                        const isLastSuper = m.role === 'super_admin' && superAdminCount <= 1;
                        return (
                          <li key={m.id} className="flex items-center gap-2">
                            <span className="text-xs text-text-secondary flex-1 truncate">{m.name}</span>
                            <select
                              aria-label={`Role for ${m.name}`}
                              value={m.role}
                              disabled={busy === `role-${m.id}` || isLastSuper}
                              title={isLastSuper ? "Can't demote the org's only super admin" : undefined}
                              onChange={(e) => act(`role-${m.id}`, () => adminSetUserRole(adminId, m.id, orgId, e.target.value))}
                              className="input-neo py-1 text-xs w-32">
                              {ORG_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </li>
                        );
                      })}
                      {(d.members || []).length === 0 && <li className="text-xs text-text-muted">No members.</li>}
                    </ul>
                  </div>
                </div>
              )}

              {/* CAPABILITIES matrix */}
              {tab === 'caps' && (
                <div className="p-5">
                  <p className="text-[11px] text-text-muted mb-3">
                    What each org role may do. The last row is reserved to the platform admin —
                    org admins can only <em>request</em> it.
                  </p>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-text-muted">
                        <th className="text-left font-semibold pb-2">Capability</th>
                        {ORG_ROLES.map((r) => <th key={r} className="pb-2 font-semibold">{r.replace('_', ' ')}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {CAPABILITIES.map((c) => (
                        <tr key={c.cap} className="border-t border-border-default">
                          <td className="py-1.5 text-text-secondary pr-2">{c.cap}</td>
                          {ORG_ROLES.map((r) => (
                            <td key={r} className="py-1.5 text-center">
                              {c.roles.includes(r)
                                ? <ShieldCheck size={13} className="inline text-emerald-500" aria-label="allowed" />
                                : <span className="text-text-disabled" aria-label="not allowed">·</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* AUDIT log */}
              {tab === 'audit' && (
                <div className="p-5">
                  <h3 className="text-sm font-bold text-text-secondary mb-2">Org activity</h3>
                  {audit === null ? (
                    <div className="h-16 rounded-xl bg-bg-elevated animate-pulse" />
                  ) : audit.length === 0 ? (
                    <p className="text-xs text-text-muted">No recorded actions yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {audit.map((a) => (
                        <li key={a.id} className="flex items-center gap-2 text-[11px]">
                          <Badge variant="neutral">{a.action}</Badge>
                          <span className="text-text-secondary truncate flex-1">{a.actor_name}</span>
                          <span className="text-text-muted shrink-0">{rel(a.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : <div className="p-6 text-sm text-red-500">{error || 'Not found'}</div>}
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
