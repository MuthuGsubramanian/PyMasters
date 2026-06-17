import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { X, Shield, KeyRound, LogOut, Zap, Trophy, Eye } from 'lucide-react';
import {
  getAdminUserDetail, adminUpdateUser, adminDeleteUser, adminSetSuperAdmin,
  adminSetUserRole, adminResetPassword, adminRevokeSessions, adminBlockUser, adminSetPlan,
} from '../api';
import { safeErrorMsg } from '../utils/errorUtils';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Avatar, Badge, Button } from './ui';

const PLANS = ['free', 'pro', 'enterprise'];
const ROLES = ['member', 'manager', 'admin', 'super_admin'];

function relTime(ts) {
  if (!ts) return 'never';
  let iso = String(ts).replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const d = Math.floor((Date.now() - t) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d}d ago` : d < 365 ? `${Math.floor(d/30)}mo ago` : `${Math.floor(d/365)}y ago`;
}

export default function UserAdminDrawer({ adminId, targetId, onClose, onChanged, onViewAs }) {
  const reduced = useReducedMotion();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', account_type: 'individual' });
  const [confirmDel, setConfirmDel] = useState('');
  const panelRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminUserDetail(adminId, targetId)
      .then((r) => { setD(r.data); setForm({ name: r.data.name || '', email: r.data.email || '', account_type: r.data.account_type || 'individual' }); })
      .catch((e) => setError(safeErrorMsg(e, 'Failed to load user')))
      .finally(() => setLoading(false));
  }, [adminId, targetId]);
  useEffect(() => { load(); }, [load]);
  useEscapeKey(onClose);
  useFocusTrap(panelRef, true);

  const act = async (key, fn) => {
    setBusy(key); setError('');
    try { await fn(); onChanged?.(); load(); return true; }
    catch (e) { setError(safeErrorMsg(e, 'Action failed')); return false; }
    finally { setBusy(''); }
  };

  const name = String(d?.name || d?.username || '—');
  const isSuper = d?.is_super_admin || d?.break_glass;

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${name} admin`}
          onClick={(e) => e.stopPropagation()}
          initial={reduced ? false : { x: '100%' }} animate={reduced ? false : { x: 0 }} exit={reduced ? undefined : { x: '100%' }}
          transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          className="w-full max-w-md h-full overflow-y-auto bg-bg-surface border-l border-border-default shadow-2xl focus:outline-none">
          {loading ? (
            <div className="p-6 space-y-4">{[0,1,2].map(i => <div key={i} className="h-20 rounded-xl bg-bg-elevated animate-pulse" />)}</div>
          ) : error && !d ? (
            <div className="p-6"><button onClick={onClose} className="mb-3 text-text-muted"><X size={18} /></button><p className="text-sm text-red-500 mb-3">{String(error)}</p><Button variant="danger" size="sm" onClick={load}>Retry</Button></div>
          ) : d ? (
            <div>
              <div className="p-5 border-b border-border-default flex items-start gap-3">
                <Avatar name={name} size="lg" />
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-text-primary truncate">{name}</h2>
                  <p className="text-xs text-text-muted truncate">@{String(d.username)}{d.email ? ` · ${d.email}` : ' · no email on file'}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="warning">{d.plan}</Badge>
                    {d.is_blocked ? <Badge variant="danger">blocked</Badge> : null}
                    {isSuper ? <Badge variant="primary">{d.break_glass ? 'super-admin · env · locked' : 'super-admin'}</Badge> : null}
                    <Badge variant="neutral">{d.account_type}</Badge>
                  </div>
                </div>
                <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-secondary p-1"><X size={18} /></button>
              </div>

              {error ? <div className="px-5 py-2 text-xs text-red-500">{String(error)}</div> : null}

              <div className="p-5 grid grid-cols-3 gap-3 border-b border-border-default text-center">
                <div><Zap size={14} className="mx-auto text-cyan-500 mb-1" /><div className="text-lg font-bold text-text-primary">{d.points}</div><div className="text-[10px] text-text-muted uppercase">XP</div></div>
                <div><Trophy size={14} className="mx-auto text-amber-500 mb-1" /><div className="text-lg font-bold text-text-primary">{d.lessons_completed}</div><div className="text-[10px] text-text-muted uppercase">Lessons</div></div>
                <div><div className="text-sm font-bold text-text-primary mt-3">{relTime(d.last_active)}</div><div className="text-[10px] text-text-muted uppercase">Last active</div></div>
              </div>

              {editing ? (
                <div className="p-5 border-b border-border-default space-y-2">
                  <input className="input-neo w-full py-2 text-sm" aria-label="Name" placeholder="Name" value={form.name} onChange={(e)=>setForm(f=>({...f,name:e.target.value}))} />
                  <input className="input-neo w-full py-2 text-sm" aria-label="Email" placeholder="Email" value={form.email} onChange={(e)=>setForm(f=>({...f,email:e.target.value}))} />
                  <select className="input-neo w-full py-2 text-sm" aria-label="Account type" value={form.account_type} onChange={(e)=>setForm(f=>({...f,account_type:e.target.value}))}>
                    <option value="individual">individual</option><option value="organization">organization</option>
                  </select>
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" disabled={busy==='edit'} onClick={()=>act('edit',()=>adminUpdateUser(adminId,targetId,form)).then(()=>setEditing(false))}>Save</Button>
                    <Button variant="ghost" size="sm" onClick={()=>setEditing(false)}>Cancel</Button>
                  </div>
                </div>
              ) : null}

              {(d.orgs || []).length ? (
                <div className="p-5 border-b border-border-default">
                  <h3 className="text-sm font-bold text-text-secondary mb-2">Organizations</h3>
                  <div className="space-y-2">
                    {d.orgs.map((o) => (
                      <div key={o.org_id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-text-secondary truncate">{o.org_name}</span>
                        <select disabled={busy.startsWith('role')} value={o.role}
                          onChange={(e)=>act(`role-${o.org_id}`,()=>adminSetUserRole(adminId,targetId,o.org_id,e.target.value))}
                          className="text-xs input-neo py-1 px-2">
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="p-5 border-b border-border-default grid grid-cols-2 gap-2">
                <Button variant="ghost" size="sm" disabled={busy==='block'} onClick={()=>act('block',()=>adminBlockUser(targetId,adminId,!d.is_blocked))} className="py-2">{d.is_blocked ? 'Unblock' : 'Block'}</Button>
                <select disabled={busy==='plan'} value={d.plan} onChange={(e)=>act('plan',()=>adminSetPlan(targetId,adminId,e.target.value))} aria-label="Plan" className="input-neo py-2 text-sm">
                  {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <Button variant="ghost" size="sm" onClick={()=>setEditing(v=>!v)} className="py-2">Edit</Button>
                <Button variant="ghost" size="sm" onClick={()=>onViewAs?.(d)} className="py-2"><Eye size={14}/>View as</Button>
                <Button variant="ghost" size="sm" disabled={!d.has_email || busy==='reset'} title={d.has_email ? '' : 'No email on file — add one via Edit'} onClick={()=>act('reset',()=>adminResetPassword(adminId,targetId))} className="py-2"><KeyRound size={14}/>Reset pw</Button>
                <Button variant="ghost" size="sm" disabled={busy==='revoke'} onClick={()=>act('revoke',()=>adminRevokeSessions(adminId,targetId))} className="py-2"><LogOut size={14}/>Revoke</Button>
                {!d.break_glass ? (
                  <Button variant="ghost" size="sm" disabled={busy==='super'} onClick={()=>act('super',()=>adminSetSuperAdmin(adminId,targetId,!d.is_super_admin))} className="py-2"><Shield size={14}/>{d.is_super_admin ? 'Revoke admin' : 'Make admin'}</Button>
                ) : <div className="text-[10px] text-text-muted flex items-center justify-center">env admin · locked</div>}
                {!d.break_glass && d.id !== adminId ? (
                  <div className="col-span-2">
                    {confirmDel === d.username ? (
                      <Button variant="danger" disabled={busy==='del'} onClick={async ()=>{ if (await act('del',()=>adminDeleteUser(adminId,targetId))) onClose(); }} className="w-full py-2 text-sm">Confirm delete</Button>
                    ) : (
                      <input className="input-neo w-full py-2 text-sm" aria-label={`Type the username "${d.username}" to confirm deletion`} placeholder={`Type "${d.username}" to delete`} value={confirmDel} onChange={(e)=>setConfirmDel(e.target.value)} />
                    )}
                  </div>
                ) : null}
              </div>

              {(d.recent_audit || []).length ? (
                <div className="p-5">
                  <h3 className="text-sm font-bold text-text-secondary mb-2">Recent admin actions</h3>
                  <ul className="space-y-1.5">
                    {d.recent_audit.map((a, i) => (
                      <li key={i} className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary">{a.action} <span className="text-text-muted">by {a.actor_name}</span></span>
                        <span className="text-text-muted">{relTime(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
