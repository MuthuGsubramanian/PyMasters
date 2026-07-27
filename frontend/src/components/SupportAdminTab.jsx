import { useCallback, useEffect, useState } from 'react';
import {
    GraduationCap, Bug, CalendarClock, Loader2, RefreshCw, Eye,
    CheckCircle2, XCircle, Check, Mail, Plus, Trash2, Save, Building2,
} from 'lucide-react';
import {
    adminListSupportRequests, adminGetSupportAttachment, adminDecideSupportRequest,
    adminListTutorSessions, adminSetTutorSessionStatus,
    getNotificationEmails, setNotificationEmails,
    adminListOrgRequests, adminApproveOrgRequest, adminRejectOrgRequest, adminDismissOrgRequest,
} from '../api';
import { safeErrorMsg } from '../utils/errorUtils';
import { Badge, Button, Card, Input, Tabs } from './ui';

const REQ_BADGE = {
    new: 'warning', approved: 'info', granted: 'success', rejected: 'danger', resolved: 'success',
};
const SESSION_BADGE = {
    pending: 'warning', confirmed: 'success', completed: 'neutral', cancelled: 'danger',
};

function rel(ts) {
    if (!ts) return '—';
    let iso = String(ts).replace(' ', 'T');
    if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (isNaN(m)) return '—';
    if (m < 1) return 'now';
    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    return `${Math.floor(m / 1440)}d ago`;
}

// Fetches the (super-admin-only) student-ID blob with auth headers and shows it
// in-page — attachments never get public URLs.
function AttachmentPreview({ attachmentId, contentType }) {
    const [url, setUrl] = useState(null);
    const [err, setErr] = useState('');
    useEffect(() => {
        let objUrl;
        adminGetSupportAttachment(attachmentId)
            .then((r) => { objUrl = URL.createObjectURL(r.data); setUrl(objUrl); })
            .catch(() => setErr('Could not load the attachment.'));
        return () => { if (objUrl) URL.revokeObjectURL(objUrl); };
    }, [attachmentId]);
    if (err) return <p className="text-xs text-red-500">{err}</p>;
    if (!url) return <div className="h-40 rounded-xl bg-bg-elevated animate-pulse" />;
    if (contentType === 'application/pdf') {
        return <iframe title="Student ID (PDF)" src={url} className="w-full h-80 rounded-xl border border-border-default" />;
    }
    return <img src={url} alt="Uploaded student ID" className="max-h-80 rounded-xl border border-border-default object-contain" />;
}

function RequestRow({ r, onDecide, busy }) {
    const [showAttachment, setShowAttachment] = useState(false);
    const isAccess = r.kind === 'access';
    const open = r.status === 'new' || (isAccess && r.status === 'approved');
    return (
        <div className="rounded-xl border border-border-default bg-bg-elevated/50 p-3.5 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
                {isAccess
                    ? <GraduationCap size={14} className="text-emerald-500 shrink-0" aria-hidden="true" />
                    : <Bug size={14} className="text-amber-500 shrink-0" aria-hidden="true" />}
                <span className="text-sm font-semibold text-text-primary">{r.name || '—'}</span>
                <span className="text-xs text-text-muted">{r.email}</span>
                <Badge variant={REQ_BADGE[r.status] || 'neutral'}>{r.status}</Badge>
                {r.matched_username && (
                    <span className="text-[10px] text-text-muted">account: @{r.matched_username} ({r.matched_plan})</span>
                )}
                <span className="ml-auto text-[10px] text-text-muted">{rel(r.created_at)}</span>
            </div>
            {r.message && <p className="text-xs text-text-secondary whitespace-pre-wrap">{r.message}</p>}
            {r.page_url && <p className="text-[10px] text-text-muted truncate">From: {r.page_url}</p>}
            {r.admin_note && <p className="text-[11px] text-text-muted italic">Note: {r.admin_note}</p>}
            <div className="flex items-center gap-2 flex-wrap">
                {r.attachment_id && (
                    <Button variant="outline" size="sm" onClick={() => setShowAttachment((v) => !v)}>
                        <Eye size={12} aria-hidden="true" />
                        {showAttachment ? 'Hide' : 'View'} student ID
                        <span className="text-text-muted font-normal">({Math.max(1, Math.round((r.attachment_size || 0) / 1024))} KB)</span>
                    </Button>
                )}
                {open && isAccess && (
                    <>
                        <Button variant="primary" size="sm" disabled={busy === r.id} onClick={() => onDecide(r, 'approve')}>
                            {busy === r.id ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={12} aria-hidden="true" />}
                            Approve · 3 months free
                        </Button>
                        <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => onDecide(r, 'reject')}
                            className="border-red-200 text-red-500 hover:bg-red-50">
                            <XCircle size={12} aria-hidden="true" /> Reject
                        </Button>
                    </>
                )}
                {r.kind === 'issue' && r.status === 'new' && (
                    <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => onDecide(r, 'resolve')}>
                        {busy === r.id ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
                        Mark resolved
                    </Button>
                )}
            </div>
            {showAttachment && r.attachment_id && (
                <AttachmentPreview attachmentId={r.attachment_id} contentType={r.attachment_type} />
            )}
        </div>
    );
}

function RequestsList({ kind }) {
    const [rows, setRows] = useState(null);
    const [busy, setBusy] = useState(null);
    const [err, setErr] = useState('');
    const load = useCallback(() => {
        adminListSupportRequests({ kind }).then((r) => setRows(r.data.requests || [])).catch((e) => { setRows([]); setErr(safeErrorMsg(e, 'Failed to load')); });
    }, [kind]);
    useEffect(() => { load(); }, [load]);

    const decide = async (r, action) => {
        let note = '';
        if (action === 'reject') {
            const raw = window.prompt('Optional note to include in the email to the requester:', '');
            if (raw === null) return;
            note = raw.trim();
        }
        setBusy(r.id); setErr('');
        try { await adminDecideSupportRequest(r.id, action, note); load(); }
        catch (e) { setErr(safeErrorMsg(e, 'Action failed')); }
        finally { setBusy(null); }
    };

    if (rows === null) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-accent-primary" size={20} /></div>;
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-xs text-text-muted">{rows.length} {kind === 'access' ? 'access requests' : 'reports'}</p>
                <button onClick={load} title="Refresh" className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors">
                    <RefreshCw size={13} aria-hidden="true" />
                </button>
            </div>
            {err && <p className="text-xs text-red-500" role="alert">{err}</p>}
            {rows.length === 0
                ? <p className="text-sm text-text-muted text-center py-8">Nothing here yet.</p>
                : rows.map((r) => <RequestRow key={r.id} r={r} onDecide={decide} busy={busy} />)}
        </div>
    );
}

function TutorSessionsList() {
    const [rows, setRows] = useState(null);
    const [busy, setBusy] = useState(null);
    const [err, setErr] = useState('');
    const load = useCallback(() => {
        adminListTutorSessions().then((r) => setRows(r.data.sessions || [])).catch((e) => { setRows([]); setErr(safeErrorMsg(e, 'Failed to load')); });
    }, []);
    useEffect(() => { load(); }, [load]);

    const setStatus = async (s, status) => {
        let note = '';
        if (status === 'confirmed') {
            const raw = window.prompt('Optional note for the confirmation email (e.g. meeting link, exact time):', '');
            if (raw === null) return;
            note = raw.trim();
        } else if (status === 'cancelled') {
            const raw = window.prompt('Optional note explaining the cancellation:', '');
            if (raw === null) return;
            note = raw.trim();
        }
        setBusy(s.id); setErr('');
        try { await adminSetTutorSessionStatus(s.id, status, note); load(); }
        catch (e) { setErr(safeErrorMsg(e, 'Action failed')); }
        finally { setBusy(null); }
    };

    if (rows === null) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-accent-primary" size={20} /></div>;
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-xs text-text-muted">{rows.length} session requests</p>
                <button onClick={load} title="Refresh" className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors">
                    <RefreshCw size={13} aria-hidden="true" />
                </button>
            </div>
            {err && <p className="text-xs text-red-500" role="alert">{err}</p>}
            {rows.length === 0
                ? <p className="text-sm text-text-muted text-center py-8">No tutor session requests yet.</p>
                : rows.map((s) => (
                    <div key={s.id} className="rounded-xl border border-border-default bg-bg-elevated/50 p-3.5 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <CalendarClock size={14} className="text-accent-primary shrink-0" aria-hidden="true" />
                            <span className="text-sm font-semibold text-text-primary">{s.name || '—'}</span>
                            <span className="text-xs text-text-muted">{s.email}</span>
                            <Badge variant={SESSION_BADGE[s.status] || 'neutral'}>{s.status}</Badge>
                            <span className="ml-auto text-[10px] text-text-muted">{rel(s.created_at)}</span>
                        </div>
                        <p className="text-xs text-text-secondary">
                            <span className="font-semibold">{s.topic}</span> · {s.preferred_at}{s.timezone ? ` (${s.timezone})` : ''} · {s.duration_minutes} min
                        </p>
                        {s.notes && <p className="text-xs text-text-muted whitespace-pre-wrap">{s.notes}</p>}
                        {s.admin_note && <p className="text-[11px] text-text-muted italic">Note: {s.admin_note}</p>}
                        {(s.status === 'pending' || s.status === 'confirmed') && (
                            <div className="flex items-center gap-2 pt-1">
                                {s.status === 'pending' && (
                                    <Button variant="primary" size="sm" disabled={busy === s.id} onClick={() => setStatus(s, 'confirmed')}>
                                        {busy === s.id ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={12} aria-hidden="true" />}
                                        Confirm
                                    </Button>
                                )}
                                {s.status === 'confirmed' && (
                                    <Button variant="outline" size="sm" disabled={busy === s.id} onClick={() => setStatus(s, 'completed')}>
                                        <Check size={12} aria-hidden="true" /> Mark completed
                                    </Button>
                                )}
                                <Button variant="outline" size="sm" disabled={busy === s.id} onClick={() => setStatus(s, 'cancelled')}
                                    className="border-red-200 text-red-500 hover:bg-red-50">
                                    <XCircle size={12} aria-hidden="true" /> Cancel
                                </Button>
                            </div>
                        )}
                    </div>
                ))}
        </div>
    );
}

function orgReqSummary(r) {
    if (r.kind === 'plan') return `Plan: ${r.payload?.plan || '?'}`;
    if (r.kind === 'seats') return `${r.payload?.seats || '?'} seats`;
    return r.kind;
}

function OrgRequestsList() {
    const [rows, setRows] = useState(null);
    const [busy, setBusy] = useState(null);
    const [err, setErr] = useState('');
    const load = useCallback(() => {
        adminListOrgRequests().then((r) => setRows(r.data.requests || [])).catch((e) => { setRows([]); setErr(safeErrorMsg(e, 'Failed to load')); });
    }, []);
    useEffect(() => { load(); }, [load]);

    const decide = async (r, approve) => {
        let note = '';
        if (!approve) {
            const raw = window.prompt('Optional note to the org (emailed to the requester):', '');
            if (raw === null) return;
            note = raw.trim();
        } else {
            const raw = window.prompt(`Approve "${orgReqSummary(r)}" for ${r.org_name}? Optional note for the email:`, '');
            if (raw === null) return;
            note = raw.trim();
        }
        setBusy(r.id); setErr('');
        try {
            if (approve) await adminApproveOrgRequest(r.id, { note });
            else await adminRejectOrgRequest(r.id, note);
            load();
        } catch (e) { setErr(safeErrorMsg(e, 'Action failed')); }
        finally { setBusy(null); }
    };

    // Remove a HANDLED (approved/rejected) request from the queue. Grants stay;
    // this only clears the row (e.g. an orphan whose org was deleted).
    const dismiss = async (r) => {
        setBusy(r.id); setErr('');
        try { await adminDismissOrgRequest(r.id); load(); }
        catch (e) { setErr(safeErrorMsg(e, 'Could not dismiss')); }
        finally { setBusy(null); }
    };

    if (rows === null) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-accent-primary" size={20} /></div>;
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-xs text-text-muted">{rows.length} requests</p>
                <button onClick={load} title="Refresh" className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors">
                    <RefreshCw size={13} aria-hidden="true" />
                </button>
            </div>
            {err && <p className="text-xs text-red-500" role="alert">{err}</p>}
            {rows.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-8">No organization requests yet.</p>
            ) : rows.map((r) => (
                <div key={r.id} className="rounded-xl border border-border-default bg-bg-elevated/50 p-3.5 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Building2 size={14} className="text-accent-primary shrink-0" aria-hidden="true" />
                        <span className="text-sm font-semibold text-text-primary">{r.org_name || 'Unknown org'}</span>
                        <Badge variant={r.status === 'pending' ? 'warning' : r.status === 'approved' ? 'success' : 'danger'}>{r.status}</Badge>
                        <span className="text-xs text-text-muted">{orgReqSummary(r)}</span>
                        <span className="ml-auto text-[10px] text-text-muted">{rel(r.created_at)}</span>
                    </div>
                    {r.requester && <p className="text-[11px] text-text-muted">by {r.requester}</p>}
                    {r.message && <p className="text-xs text-text-secondary whitespace-pre-wrap">{r.message}</p>}
                    {r.admin_note && <p className="text-[11px] text-text-muted italic">Note: {r.admin_note}</p>}
                    {r.status === 'pending' && (
                        <div className="flex items-center gap-2 pt-1">
                            <Button variant="primary" size="sm" disabled={busy === r.id} onClick={() => decide(r, true)}>
                                {busy === r.id ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={12} aria-hidden="true" />}
                                Approve & grant
                            </Button>
                            <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => decide(r, false)}
                                className="border-red-200 text-red-500 hover:bg-red-50">
                                <XCircle size={12} aria-hidden="true" /> Reject
                            </Button>
                        </div>
                    )}
                    {r.status !== 'pending' && (
                        <div className="pt-1">
                            <button disabled={busy === r.id} onClick={() => dismiss(r)}
                                title="Remove this handled request from the queue"
                                className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-red-500 disabled:opacity-40 transition-colors">
                                {busy === r.id ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : <Trash2 size={11} aria-hidden="true" />}
                                Dismiss
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

/** Support inbox: student access requests, issue reports, tutor sessions, org requests. */
export function SupportAdminTab() {
    const [sub, setSub] = useState('access');
    const SUBS = [
        { key: 'access', label: 'Access Requests', icon: GraduationCap },
        { key: 'issues', label: 'Issues', icon: Bug },
        { key: 'tutoring', label: 'Tutor Sessions', icon: CalendarClock },
        { key: 'org_requests', label: 'Org Requests', icon: Building2 },
    ];
    return (
        <div className="space-y-4">
            <Tabs tabs={SUBS} active={sub} onChange={setSub} />
            {sub === 'access' && <RequestsList kind="access" />}
            {sub === 'issues' && <RequestsList kind="issue" />}
            {sub === 'tutoring' && <TutorSessionsList />}
            {sub === 'org_requests' && <OrgRequestsList />}
        </div>
    );
}

/** Platform settings: support/tutor notification recipients. */
export function SettingsAdminTab() {
    const [emails, setEmails] = useState(null);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');

    useEffect(() => {
        getNotificationEmails().then((r) => setEmails(r.data.emails || [])).catch((e) => { setEmails([]); setErr(safeErrorMsg(e, 'Failed to load')); });
    }, []);

    const save = async (next) => {
        setSaving(true); setErr(''); setMsg('');
        try {
            const r = await setNotificationEmails(next);
            setEmails(r.data.emails);
            setMsg('Saved.');
        } catch (e) {
            setErr(safeErrorMsg(e, 'Could not save'));
        } finally {
            setSaving(false);
        }
    };

    const add = (e) => {
        e.preventDefault();
        const v = draft.trim();
        if (!v || emails.includes(v)) return;
        setDraft('');
        save([...emails, v]);
    };

    if (emails === null) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-accent-primary" size={20} /></div>;
    return (
        <Card className="p-4 max-w-xl space-y-3">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Mail size={15} className="text-accent-primary" aria-hidden="true" />
                Notification recipients
            </h2>
            <p className="text-xs text-text-muted leading-relaxed">
                Support requests, issue reports and tutor session requests are emailed to every address below.
            </p>
            <ul className="space-y-1.5">
                {emails.map((e) => (
                    <li key={e} className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-elevated/50 px-3 py-2">
                        <span className="text-sm text-text-secondary flex-1 truncate">{e}</span>
                        <button
                            aria-label={`Remove ${e}`}
                            disabled={saving || emails.length <= 1}
                            onClick={() => save(emails.filter((x) => x !== e))}
                            className="p-1 rounded-md text-text-muted hover:text-red-500 hover:bg-bg-surface disabled:opacity-40"
                            title={emails.length <= 1 ? 'At least one recipient is required' : 'Remove'}
                        >
                            <Trash2 size={13} aria-hidden="true" />
                        </button>
                    </li>
                ))}
            </ul>
            <form onSubmit={add} className="flex gap-2">
                <Input type="email" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="add@example.com" aria-label="Add recipient email" className="flex-1" />
                <Button type="submit" variant="primary" size="sm" disabled={saving || !draft.trim()}>
                    {saving ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
                    Add
                </Button>
            </form>
            {msg && <p className="text-xs text-emerald-600" role="status"><Save size={11} className="inline mr-1" aria-hidden="true" />{msg}</p>}
            {err && <p className="text-xs text-red-500" role="alert">{err}</p>}
        </Card>
    );
}
