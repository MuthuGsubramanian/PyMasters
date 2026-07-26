import { useEffect, useRef, useState } from 'react';
import { GraduationCap, Bug, Upload, CheckCircle2, Loader2, FileText, X } from 'lucide-react';
import { Modal, Button, Input, FormField, Tabs } from './ui';
import { submitAccessRequest, submitIssueReport } from '../api';
import { safeErrorMsg } from '../utils/errorUtils';
import useI18n from '../hooks/useI18n';

const MAX_FILE_MB = 5;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/**
 * Public support entry point (launched from the homepage): request free
 * 3-month student access with a student-ID upload, or report an issue/bug.
 * Works logged-out — both endpoints are public and rate-limited server-side.
 */
export default function SupportModal({ open, onClose, initialTab = 'access', user = null }) {
    const { t } = useI18n();
    const [tab, setTab] = useState(initialTab);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState('');

    // Student access form
    const [accName, setAccName] = useState(user?.name || '');
    const [accEmail, setAccEmail] = useState(user?.email || '');
    const [accMessage, setAccMessage] = useState('');
    const [file, setFile] = useState(null);
    const fileRef = useRef(null);

    // Issue form
    const [issName, setIssName] = useState(user?.name || '');
    const [issEmail, setIssEmail] = useState(user?.email || '');
    const [issSubject, setIssSubject] = useState('');
    const [issMessage, setIssMessage] = useState('');

    // The launcher can request either tab ("Get free student access" vs the
    // nav's "Support") — re-sync on every open, not just first mount.
    useEffect(() => { if (open) { setTab(initialTab); setError(''); setDone(''); } }, [open, initialTab]);

    const reset = () => { setError(''); setDone(''); setBusy(false); };
    const close = () => { reset(); setFile(null); onClose(); };
    const switchTab = (k) => { reset(); setTab(k); };

    const pickFile = (f) => {
        setError('');
        if (!f) { setFile(null); return; }
        if (!ACCEPTED.includes(f.type)) {
            setError(t('support.file_type', 'Student ID must be a JPG, PNG, WebP image or a PDF.'));
            return;
        }
        if (f.size > MAX_FILE_MB * 1024 * 1024) {
            setError(t('support.file_size', `File is too large — max ${MAX_FILE_MB} MB.`));
            return;
        }
        setFile(f);
    };

    const submitAccess = async (e) => {
        e.preventDefault();
        if (busy) return;
        if (!file) { setError(t('support.file_required', 'Please attach a photo or PDF of your student ID.')); return; }
        setBusy(true); setError('');
        try {
            const fd = new FormData();
            fd.append('name', accName.trim());
            fd.append('email', accEmail.trim());
            fd.append('message', accMessage.trim());
            fd.append('student_id', file);
            const r = await submitAccessRequest(fd);
            setDone(r.data?.message || t('support.access_done', 'Request received! We review student IDs manually and you\'ll hear from us by email.'));
        } catch (err) {
            setError(safeErrorMsg(err, t('support.submit_failed', 'Could not submit — please try again.')));
        } finally {
            setBusy(false);
        }
    };

    const submitIssue = async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true); setError('');
        try {
            const r = await submitIssueReport({
                name: issName.trim(),
                email: issEmail.trim(),
                subject: issSubject.trim(),
                message: issMessage.trim(),
                page_url: window.location.href,
            });
            setDone(r.data?.message || t('support.issue_done', 'Thanks for the report — we\'re on it.'));
        } catch (err) {
            setError(safeErrorMsg(err, t('support.submit_failed', 'Could not submit — please try again.')));
        } finally {
            setBusy(false);
        }
    };

    const TABS = [
        { key: 'access', label: t('support.tab_access', 'Student Access'), icon: GraduationCap },
        { key: 'issue', label: t('support.tab_issue', 'Report an Issue'), icon: Bug },
    ];

    return (
        <Modal open={open} onClose={close} title={t('support.title', 'Support')} className="p-5">
            {done ? (
                <div className="text-center py-8 space-y-3">
                    <CheckCircle2 size={40} className="mx-auto text-emerald-500" aria-hidden="true" />
                    <p className="text-sm text-text-secondary leading-relaxed max-w-sm mx-auto">{done}</p>
                    <Button variant="ghost" size="md" onClick={close}>{t('common.close', 'Close')}</Button>
                </div>
            ) : (
                <div className="space-y-4">
                    <Tabs tabs={TABS} active={tab} onChange={switchTab} className="w-full [&>button]:flex-1" />

                    {tab === 'access' && (
                        <form onSubmit={submitAccess} className="space-y-3">
                            <p className="text-xs text-text-muted leading-relaxed">
                                {t('support.access_intro',
                                    'Students get PyMasters completely free for 3 months. Upload a photo or PDF of your valid student ID — we verify it manually and reply by email, usually within a day.')}
                            </p>
                            <FormField label={t('support.name', 'Your name')}>
                                {(id) => <Input id={id} value={accName} onChange={(e) => setAccName(e.target.value)} maxLength={120} placeholder={t('support.name_ph', 'Full name')} />}
                            </FormField>
                            <FormField label={t('support.email', 'Email')} hint={t('support.email_hint', 'Use the email you\'ll sign up with — access is granted to this address.')}>
                                {(id) => <Input id={id} type="email" required value={accEmail} onChange={(e) => setAccEmail(e.target.value)} placeholder="you@university.edu" />}
                            </FormField>
                            <FormField label={t('support.student_id', 'Student ID')} hint={t('support.student_id_hint', 'JPG, PNG, WebP or PDF · max 5 MB')}>
                                {(id) => (
                                    <div>
                                        <input
                                            id={id} ref={fileRef} type="file"
                                            accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                                            className="sr-only"
                                            onChange={(e) => pickFile(e.target.files?.[0] || null)}
                                        />
                                        {file ? (
                                            <div className="flex items-center gap-2 rounded-xl border border-border-strong bg-bg-elevated px-3 py-2.5">
                                                <FileText size={16} className="text-accent-primary shrink-0" aria-hidden="true" />
                                                <span className="text-xs text-text-secondary truncate flex-1">{file.name}</span>
                                                <span className="text-[10px] text-text-muted shrink-0">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                                                <button type="button" aria-label={t('support.remove_file', 'Remove file')}
                                                    onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                                                    className="p-1 rounded-md text-text-muted hover:text-red-500 hover:bg-bg-surface">
                                                    <X size={13} aria-hidden="true" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button type="button" onClick={() => fileRef.current?.click()}
                                                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-bg-elevated/50 px-3 py-4 text-xs font-semibold text-text-muted hover:text-text-secondary hover:border-accent-primary transition-colors">
                                                <Upload size={15} aria-hidden="true" />
                                                {t('support.upload_cta', 'Upload student ID')}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </FormField>
                            <FormField label={t('support.message_opt', 'Anything else? (optional)')}>
                                {(id) => <textarea id={id} value={accMessage} onChange={(e) => setAccMessage(e.target.value)} rows={2} maxLength={2000} className="input-neo resize-y" placeholder={t('support.access_msg_ph', 'School / course, or anything we should know')} />}
                            </FormField>
                            {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
                            <Button type="submit" variant="primary" size="md" className="w-full" disabled={busy}>
                                {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <GraduationCap size={15} aria-hidden="true" />}
                                {t('support.access_submit', 'Request free access')}
                            </Button>
                        </form>
                    )}

                    {tab === 'issue' && (
                        <form onSubmit={submitIssue} className="space-y-3">
                            <p className="text-xs text-text-muted leading-relaxed">
                                {t('support.issue_intro', 'Found a bug, hit a problem, or need help with anything? Tell us — we read every report.')}
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <FormField label={t('support.name', 'Your name')}>
                                    {(id) => <Input id={id} value={issName} onChange={(e) => setIssName(e.target.value)} maxLength={120} placeholder={t('support.name_ph', 'Full name')} />}
                                </FormField>
                                <FormField label={t('support.email', 'Email')}>
                                    {(id) => <Input id={id} type="email" required value={issEmail} onChange={(e) => setIssEmail(e.target.value)} placeholder="you@example.com" />}
                                </FormField>
                            </div>
                            <FormField label={t('support.subject_opt', 'Subject (optional)')}>
                                {(id) => <Input id={id} value={issSubject} onChange={(e) => setIssSubject(e.target.value)} maxLength={200} placeholder={t('support.subject_ph', 'e.g. Lesson won\'t load')} />}
                            </FormField>
                            <FormField label={t('support.message', 'What happened?')}>
                                {(id) => <textarea id={id} required minLength={10} value={issMessage} onChange={(e) => setIssMessage(e.target.value)} rows={4} maxLength={4000} className="input-neo resize-y" placeholder={t('support.issue_msg_ph', 'What did you do, what did you expect, and what happened instead?')} />}
                            </FormField>
                            {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
                            <Button type="submit" variant="primary" size="md" className="w-full" disabled={busy}>
                                {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Bug size={15} aria-hidden="true" />}
                                {t('support.issue_submit', 'Send report')}
                            </Button>
                        </form>
                    )}
                </div>
            )}
        </Modal>
    );
}
