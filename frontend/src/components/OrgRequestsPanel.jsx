import { useCallback, useEffect, useState } from 'react';
import { Send, Loader2, CheckCircle2 } from 'lucide-react';
import { createOrgRequest, getOrgRequests } from '../api';
import { safeErrorMsg } from '../utils/errorUtils';
import { Badge, Button, Card, FormField, Select } from './ui';

const KIND_LABEL = {
    plan: 'Plan',
    enterprise: 'Enterprise access',
    seats: 'More seats',
    other: 'Other',
};

function summary(r) {
    if (r.kind === 'plan') return `Plan: ${r.payload?.plan || '?'}`;
    if (r.kind === 'seats') return `${r.payload?.seats || '?'} seats`;
    return KIND_LABEL[r.kind] || r.kind;
}

/**
 * Org-side capability requests: a school/org super_admin asks the platform for
 * something product-level (a plan, enterprise access, more seats). Only the
 * platform admin can grant it — this files the request and tracks its status.
 */
export default function OrgRequestsPanel({ orgId }) {
    const [rows, setRows] = useState(null);
    const [kind, setKind] = useState('enterprise');
    const [plan, setPlan] = useState('pro');
    const [seats, setSeats] = useState(10);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [ok, setOk] = useState('');

    const load = useCallback(() => {
        getOrgRequests(orgId).then((r) => setRows(r.data.requests || [])).catch(() => setRows([]));
    }, [orgId]);
    useEffect(() => { load(); }, [load]);

    const submit = async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true); setError(''); setOk('');
        try {
            const body = { kind, message: message.trim() };
            if (kind === 'plan') body.plan = plan;
            if (kind === 'seats') body.seats = Number(seats);
            const r = await createOrgRequest(orgId, body);
            setOk(r.data?.message || 'Request submitted — the PyMasters team will review it.');
            setMessage('');
            load();
        } catch (err) {
            setError(safeErrorMsg(err, 'Could not submit the request.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4 max-w-2xl">
            <Card className="p-4">
                <h3 className="text-sm font-bold text-text-primary mb-1">Request product-level access</h3>
                <p className="text-xs text-text-muted mb-3 leading-relaxed">
                    Plans, enterprise tracks and seats are granted by the PyMasters team. Tell us what your
                    organization needs and we'll review it — you'll get an email when it's decided.
                </p>
                <form onSubmit={submit} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <FormField label="What do you need?">
                            {(id) => (
                                <Select id={id} value={kind} onChange={(e) => setKind(e.target.value)}>
                                    <option value="enterprise">Enterprise access</option>
                                    <option value="plan">A specific plan</option>
                                    <option value="seats">More seats</option>
                                    <option value="other">Something else</option>
                                </Select>
                            )}
                        </FormField>
                        {kind === 'plan' && (
                            <FormField label="Plan">
                                {(id) => (
                                    <Select id={id} value={plan} onChange={(e) => setPlan(e.target.value)}>
                                        <option value="beginner">Beginner</option>
                                        <option value="pro">Pro</option>
                                        <option value="enterprise">Enterprise</option>
                                    </Select>
                                )}
                            </FormField>
                        )}
                        {kind === 'seats' && (
                            <FormField label="Seats">
                                {(id) => <input id={id} type="number" min={1} max={100000} value={seats}
                                    onChange={(e) => setSeats(e.target.value)} className="input-neo" />}
                            </FormField>
                        )}
                    </div>
                    <FormField label="Anything we should know? (optional)">
                        {(id) => <textarea id={id} value={message} onChange={(e) => setMessage(e.target.value)}
                            rows={2} maxLength={2000} className="input-neo resize-y"
                            placeholder="e.g. 40-student CS cohort, pilot for the fall term" />}
                    </FormField>
                    {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
                    {ok && <p className="text-xs text-emerald-600 flex items-center gap-1.5" role="status"><CheckCircle2 size={13} aria-hidden="true" /> {ok}</p>}
                    <Button type="submit" variant="primary" size="md" disabled={busy}>
                        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                        Submit request
                    </Button>
                </form>
            </Card>

            <div>
                <h3 className="text-sm font-bold text-text-secondary mb-2">Your requests</h3>
                {rows === null ? (
                    <div className="h-14 rounded-xl bg-bg-elevated animate-pulse" />
                ) : rows.length === 0 ? (
                    <p className="text-sm text-text-muted">No requests yet.</p>
                ) : (
                    <Card className="divide-y divide-border-default">
                        {rows.map((r) => (
                            <div key={r.id} className="p-3 flex items-center gap-2">
                                <span className="text-sm text-text-secondary flex-1">{summary(r)}</span>
                                <Badge variant={r.status === 'pending' ? 'warning' : r.status === 'approved' ? 'success' : 'danger'}>{r.status}</Badge>
                                {r.admin_note && <span className="text-[11px] text-text-muted italic max-w-[40%] truncate" title={r.admin_note}>{r.admin_note}</span>}
                            </div>
                        ))}
                    </Card>
                )}
            </div>
        </div>
    );
}
