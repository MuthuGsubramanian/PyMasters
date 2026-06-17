import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { X } from 'lucide-react';
import { getAdminOrgDetail, adminSetOrgPlan, adminSetOrgType, adminDeleteOrg } from '../api';
import { safeErrorMsg } from '../utils/errorUtils';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Button } from './ui';

const PLANS = ['free', 'pro', 'enterprise'];
const TYPES = ['school', 'university', 'enterprise', 'other'];

export default function OrgAdminDrawer({ adminId, orgId, onClose, onChanged }) {
  const reduced = useReducedMotion();
  const [d, setD] = useState(null); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(''); const [confirmDel, setConfirmDel] = useState('');
  const panelRef = useRef(null);
  const load = useCallback(() => { setLoading(true); getAdminOrgDetail(adminId, orgId).then((r)=>setD(r.data)).catch((e)=>setError(safeErrorMsg(e,'Failed'))).finally(()=>setLoading(false)); }, [adminId, orgId]);
  useEffect(() => { load(); }, [load]);
  useEscapeKey(onClose);
  useFocusTrap(panelRef, true);
  const act = async (key, fn) => { setBusy(key); setError(''); try { await fn(); onChanged?.(); load(); return true; } catch (e) { setError(safeErrorMsg(e,'Failed')); return false; } finally { setBusy(''); } };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}>
        <motion.aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Organization admin" onClick={(e)=>e.stopPropagation()}
          initial={reduced?false:{x:'100%'}} animate={reduced?false:{x:0}} exit={reduced?undefined:{x:'100%'}} transition={{type:'spring',stiffness:400,damping:40}}
          className="w-full max-w-md h-full overflow-y-auto bg-bg-surface border-l border-border-default shadow-2xl focus:outline-none">
          {loading ? <div className="p-6"><div className="h-24 rounded-xl bg-bg-elevated animate-pulse" /></div> : d ? (
            <div>
              <div className="p-5 border-b border-border-default flex items-start justify-between">
                <div><h2 className="text-lg font-bold text-text-primary">{d.name}</h2><p className="text-xs text-text-muted">{d.member_count} members · {d.type} · {d.plan}</p></div>
                <button onClick={onClose} aria-label="Close" className="text-text-muted p-1"><X size={18} /></button>
              </div>
              {error ? <div className="px-5 py-2 text-xs text-red-500">{error}</div> : null}
              <div className="p-5 border-b border-border-default grid grid-cols-2 gap-2">
                <select disabled={busy==='plan'} value={d.plan} onChange={(e)=>act('plan',()=>adminSetOrgPlan(adminId,orgId,e.target.value))} className="input-neo py-2 text-sm">{PLANS.map(p=><option key={p} value={p}>{p}</option>)}</select>
                <select disabled={busy==='type'} value={d.type} onChange={(e)=>act('type',()=>adminSetOrgType(adminId,orgId,e.target.value))} className="input-neo py-2 text-sm">{TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>
                <div className="col-span-2">
                  {confirmDel === d.name ? (
                    <Button variant="danger" disabled={busy==='del'} onClick={async ()=>{ if (await act('del',()=>adminDeleteOrg(adminId,orgId))) onClose(); }} className="w-full py-2 text-sm">Confirm delete org</Button>
                  ) : <input className="input-neo w-full py-2 text-sm" aria-label={`Type the organization name "${d.name}" to confirm deletion`} placeholder={`Type "${d.name}" to delete`} value={confirmDel} onChange={(e)=>setConfirmDel(e.target.value)} />}
                </div>
              </div>
              <div className="p-5">
                <h3 className="text-sm font-bold text-text-secondary mb-2">Members</h3>
                <ul className="space-y-1">{(d.members||[]).map((m)=><li key={m.id} className="flex justify-between text-xs"><span className="text-text-secondary">{m.name}</span><span className="text-text-muted">{m.role}</span></li>)}</ul>
              </div>
            </div>
          ) : <div className="p-6 text-sm text-red-500">{error || 'Not found'}</div>}
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
