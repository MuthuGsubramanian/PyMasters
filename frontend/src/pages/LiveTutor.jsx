import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2, CheckCircle2, Send, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createTutorSession, getMyTutorSessions, cancelTutorSession } from '../api';
import { safeErrorMsg } from '../utils/errorUtils';
import { Badge, Button, Card, FormField, Input, Select } from '../components/ui';
import useI18n from '../hooks/useI18n';

const STATUS_BADGE = {
    pending: 'warning',
    confirmed: 'success',
    completed: 'neutral',
    cancelled: 'danger',
};

function fmtWhen(iso, tz) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        if (!isNaN(d.getTime())) {
            return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) + (tz ? ` (${tz})` : '');
        }
    } catch { /* fall through */ }
    return `${iso}${tz ? ` (${tz})` : ''}`;
}

/**
 * Live 1-on-1 tutor sessions: request a slot (topic + preferred time) and track
 * its status. The team is notified by email and confirms from the admin
 * console; the learner gets a confirmation email back.
 */
export default function LiveTutor() {
    const { user } = useAuth();
    const { t } = useI18n();
    const [topic, setTopic] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [duration, setDuration] = useState(30);
    const [notes, setNotes] = useState('');
    const [email, setEmail] = useState(user?.email || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');
    const [sessions, setSessions] = useState(null);
    const [cancelBusy, setCancelBusy] = useState(null);

    const tz = (() => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
    })();

    useEffect(() => { document.title = 'Live Tutor — PyMasters'; }, []);

    const load = useCallback(() => {
        getMyTutorSessions().then((r) => setSessions(r.data.sessions || [])).catch(() => setSessions([]));
    }, []);
    useEffect(() => { load(); }, [load]);

    const submit = async (e) => {
        e.preventDefault();
        if (busy) return;
        setError(''); setOkMsg('');
        if (!date || !time) {
            setError(t('tutor.pick_time', 'Please pick a date and a time.'));
            return;
        }
        setBusy(true);
        try {
            const r = await createTutorSession({
                topic: topic.trim(),
                preferred_at: `${date}T${time}`,
                timezone: tz,
                duration_minutes: Number(duration),
                notes: notes.trim(),
                email: email.trim(),
            });
            setOkMsg(r.data?.message || t('tutor.requested', 'Request received! You\'ll get a confirmation email once we schedule it.'));
            setTopic(''); setNotes('');
            load();
        } catch (err) {
            setError(safeErrorMsg(err, t('tutor.request_failed', 'Could not submit the request — please try again.')));
        } finally {
            setBusy(false);
        }
    };

    const cancel = async (s) => {
        setCancelBusy(s.id);
        try { await cancelTutorSession(s.id); load(); }
        catch { /* keep list as-is */ }
        finally { setCancelBusy(null); }
    };

    const todayStr = new Date().toISOString().slice(0, 10);

    return (
        <div className="space-y-5 max-w-3xl">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
                    <CalendarClock size={22} className="text-white" aria-hidden="true" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">{t('tutor.title', 'Live Tutor Sessions')}</h1>
                    <p className="text-sm text-text-muted">{t('tutor.subtitle', '1-on-1 time with a real tutor — pick a topic and a slot, we confirm by email.')}</p>
                </div>
            </div>

            <Card className="p-5">
                <form onSubmit={submit} className="space-y-3">
                    <FormField label={t('tutor.topic', 'What do you want to work on?')}>
                        {(id) => <Input id={id} required minLength={3} maxLength={300} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('tutor.topic_ph', 'e.g. Debugging my decorators lesson, or planning an ML learning path')} />}
                    </FormField>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <FormField label={t('tutor.date', 'Date')}>
                            {(id) => <Input id={id} type="date" required min={todayStr} value={date} onChange={(e) => setDate(e.target.value)} />}
                        </FormField>
                        <FormField label={t('tutor.time', 'Time')} hint={tz ? t('tutor.tz_hint', 'Your timezone: {tz}').replace('{tz}', tz) : undefined}>
                            {(id) => <Input id={id} type="time" required value={time} onChange={(e) => setTime(e.target.value)} />}
                        </FormField>
                        <FormField label={t('tutor.duration', 'Duration')}>
                            {(id) => (
                                <Select id={id} value={duration} onChange={(e) => setDuration(e.target.value)}>
                                    <option value={30}>30 min</option>
                                    <option value={45}>45 min</option>
                                    <option value={60}>60 min</option>
                                </Select>
                            )}
                        </FormField>
                    </div>
                    <FormField label={t('tutor.email', 'Email for coordination')} hint={t('tutor.email_hint', 'We confirm the session at this address.')}>
                        {(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />}
                    </FormField>
                    <FormField label={t('tutor.notes', 'Notes (optional)')}>
                        {(id) => <textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} className="input-neo resize-y" placeholder={t('tutor.notes_ph', 'Anything that helps us prepare — your level, specific errors, goals')} />}
                    </FormField>
                    {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
                    {okMsg && (
                        <p className="text-xs text-emerald-600 flex items-center gap-1.5" role="status">
                            <CheckCircle2 size={14} aria-hidden="true" /> {okMsg}
                        </p>
                    )}
                    <Button type="submit" variant="primary" size="md" disabled={busy}>
                        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                        {t('tutor.submit', 'Request session')}
                    </Button>
                </form>
            </Card>

            <div>
                <h2 className="text-sm font-bold text-text-secondary mb-2">{t('tutor.mine', 'Your sessions')}</h2>
                {sessions === null ? (
                    <div className="h-16 rounded-xl bg-bg-elevated animate-pulse" />
                ) : sessions.length === 0 ? (
                    <p className="text-sm text-text-muted">{t('tutor.none', 'No sessions yet — request your first one above.')}</p>
                ) : (
                    <Card className="divide-y divide-border-default">
                        {sessions.map((s) => (
                            <div key={s.id} className="p-3.5 flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold text-text-primary truncate">{s.topic}</span>
                                        <Badge variant={STATUS_BADGE[s.status] || 'neutral'}>{s.status}</Badge>
                                    </div>
                                    <p className="text-xs text-text-muted mt-0.5">
                                        {fmtWhen(s.preferred_at, s.timezone)} · {s.duration_minutes} min
                                    </p>
                                    {s.admin_note && <p className="text-xs text-text-secondary mt-1">{t('tutor.team_note', 'Team note:')} {s.admin_note}</p>}
                                </div>
                                {(s.status === 'pending' || s.status === 'confirmed') && (
                                    <Button variant="outline" size="sm" disabled={cancelBusy === s.id} onClick={() => cancel(s)}
                                        className="border-red-200 text-red-500 hover:bg-red-50 shrink-0">
                                        {cancelBusy === s.id ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <XCircle size={12} aria-hidden="true" />}
                                        {t('common.cancel', 'Cancel')}
                                    </Button>
                                )}
                            </div>
                        ))}
                    </Card>
                )}
            </div>
        </div>
    );
}
