import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, CheckCircle2, Send, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createTutorSession, getMyTutorSessions, cancelTutorSession } from '../api';
import { safeErrorMsg } from '../utils/errorUtils';
import { Badge, Button, Card, FormField, Input } from '../components/ui';
import { cn } from '../lib/cn';
import useI18n from '../hooks/useI18n';

/*
 * Live Tutor booking (redesign 2026-11-03, after UXKIN references for time picking — e.g. Structured's
 * "When? / How long?" flow): pick a day from the next two weeks (or any later date), tap a 30-minute
 * slot, pick a length, and read the exact slot back in your own timezone before requesting it.
 * Requests go to the team's console; the learner gets a confirmation email.
 */

const STATUS_BADGE = {
    pending: 'warning',
    confirmed: 'success',
    completed: 'neutral',
    cancelled: 'danger',
};
const DURATIONS = [30, 45, 60];
const DAYS_AHEAD = 14;
const FIRST_SLOT = 7 * 60;          // 07:00
const LAST_SLOT = 21 * 60 + 30;     // 21:30
const LEAD_MINUTES = 60;            // today's slots start at least an hour from now

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const slotDate = (day, minutes) => new Date(`${day}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
const fmtTime = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function fmtWhen(iso, tz) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        if (!isNaN(d.getTime())) {
            return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
                + (tz ? ` (${tz})` : '');
        }
    } catch { /* fall through */ }
    return `${iso}${tz ? ` (${tz})` : ''}`;
}

/* A row of choice chips with radio semantics (arrow keys move, one tab stop). */
function ChoiceGroup({ label, options, value, onChange, className = '', itemClassName = '' }) {
    const onKey = (e) => {
        const i = options.findIndex((o) => o.value === value);
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = options[(Math.max(i, 0) + step + options.length) % options.length];
        onChange(next.value);
        e.currentTarget.querySelector(`[data-value="${next.value}"]`)?.focus();
    };
    const renderOption = (o, idx) => {
                const checked = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        data-value={o.value}
                        tabIndex={checked || (value == null && idx === 0) ? 0 : -1}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            'min-h-11 rounded-xl border text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60',
                            checked
                                ? 'border-accent-primary bg-accent-primary text-white shadow-sm'
                                : 'border-border-default text-text-secondary hover:border-accent-primary/50 hover:text-text-primary',
                            itemClassName,
                        )}
                    >
                        {o.label}
                    </button>
                );
    };
    return (
        <div role="radiogroup" aria-label={label} onKeyDown={onKey} className={className}>
            {options.map(renderOption)}
        </div>
    );
}

export default function LiveTutor() {
    const { user } = useAuth();
    const { t } = useI18n();
    const [topic, setTopic] = useState('');
    const [day, setDay] = useState(null);           // 'YYYY-MM-DD'
    const [slot, setSlot] = useState(null);         // minutes from midnight
    const [duration, setDuration] = useState(45);
    const [notes, setNotes] = useState('');
    const [email, setEmail] = useState(user?.email || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');
    const [sessions, setSessions] = useState(null);
    const [cancelBusy, setCancelBusy] = useState(null);
    const [confirmCancel, setConfirmCancel] = useState(null);
    const [now, setNow] = useState(() => new Date());

    const tz = (() => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
    })();
    // "India Standard Time" reads better than "Asia/Calcutta"; the IANA name is still what we send.
    const tzName = (() => {
        try {
            return new Intl.DateTimeFormat(undefined, { timeZoneName: 'long' }).formatToParts(new Date())
                .find((p) => p.type === 'timeZoneName')?.value || tz;
        } catch { return tz; }
    })();
    const [period, setPeriod] = useState(null);

    useEffect(() => { document.title = 'Live Tutor — PyMasters'; }, []);
    useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);

    const load = useCallback(() => {
        getMyTutorSessions().then((r) => setSessions(r.data.sessions || [])).catch(() => setSessions([]));
    }, []);
    useEffect(() => { load(); }, [load]);

    const todayStr = isoDate(now);
    const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        const label = i === 0 ? t('tutor.today', 'Today') : i === 1 ? t('tutor.tomorrow', 'Tomorrow')
            : d.toLocaleDateString(undefined, { weekday: 'short' });
        return {
            value: isoDate(d),
            label: (
                <span className="flex flex-col items-center leading-tight">
                    <span className="text-xs">{label}</span>
                    <span className="font-semibold">{d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                </span>
            ),
        };
    }), [now, t]);

    const slots = useMemo(() => {
        if (!day) return [];
        const out = [];
        for (let m = FIRST_SLOT; m <= LAST_SLOT; m += 30) {
            const start = slotDate(day, m);
            if (start.getTime() - now.getTime() < LEAD_MINUTES * 60000) continue;
            out.push({ value: m, label: fmtTime(start), period: m < 12 * 60 ? 'morning' : m < 17 * 60 ? 'afternoon' : 'evening' });
        }
        return out;
    }, [day, now]);
    // Ten slots at a time (morning / afternoon / evening) instead of one long wall of thirty.
    const periods = [
        { value: 'morning', label: t('tutor.morning', 'Morning') },
        { value: 'afternoon', label: t('tutor.afternoon', 'Afternoon') },
        { value: 'evening', label: t('tutor.evening', 'Evening') },
    ].filter((p) => slots.some((s) => s.period === p.value));
    const activePeriod = periods.some((p) => p.value === period) ? period : periods[0]?.value;
    const visibleSlots = slots.filter((s) => s.period === activePeriod);

    // A chosen slot that has since passed (or a day change) clears the time.
    useEffect(() => { if (slot != null && !slots.some((s) => s.value === slot)) setSlot(null); }, [slots, slot]);

    const start = day && slot != null ? slotDate(day, slot) : null;
    const end = start ? new Date(start.getTime() + duration * 60000) : null;
    const summary = start
        ? `${start.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · ${fmtTime(start)}–${fmtTime(end)}${tzName ? ` (${tzName})` : ''}`
        : null;
    const pickedOtherDate = day && !days.some((d) => d.value === day);

    const submit = async (e) => {
        e.preventDefault();
        if (busy) return;
        setError(''); setOkMsg('');
        if (topic.trim().length < 3) {
            setError(t('tutor.need_topic', 'Tell us what you want to work on (at least 3 characters).'));
            return;
        }
        if (!start) {
            setError(t('tutor.pick_time', 'Please pick a day and a time.'));
            return;
        }
        if (start.getTime() <= Date.now()) {
            setError(t('tutor.pick_future', 'Please pick a future date and time.'));
            return;
        }
        setBusy(true);
        try {
            const r = await createTutorSession({
                topic: topic.trim(),
                preferred_at: start.toISOString(),    // absolute instant: the server compares in UTC
                timezone: tz,
                duration_minutes: Number(duration),
                notes: notes.trim(),
                email: email.trim(),
            });
            setOkMsg(r.data?.message || t('tutor.requested', 'Request received! You\'ll get a confirmation email once we schedule it.'));
            setTopic(''); setNotes(''); setSlot(null);
            load();
        } catch (err) {
            setError(safeErrorMsg(err, t('tutor.request_failed', 'Could not submit the request — please try again.')));
        } finally {
            setBusy(false);
        }
    };

    const cancel = async (s) => {
        setCancelBusy(s.id);
        try { await cancelTutorSession(s.id); setConfirmCancel(null); load(); }
        catch { /* keep list as-is */ }
        finally { setCancelBusy(null); }
    };

    const upcoming = (sessions || []).filter((s) => s.status === 'pending' || s.status === 'confirmed');
    const past = (sessions || []).filter((s) => !(s.status === 'pending' || s.status === 'confirmed'));

    const SessionRow = ({ s }) => (
        <div className="p-3.5 flex items-start gap-3">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text-primary break-words">{s.topic}</span>
                    <Badge variant={STATUS_BADGE[s.status] || 'neutral'}>{s.status}</Badge>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                    {fmtWhen(s.preferred_at, s.timezone)} · {s.duration_minutes} min
                </p>
                {s.admin_note && <p className="text-xs text-text-secondary mt-1">{t('tutor.team_note', 'Team note:')} {s.admin_note}</p>}
            </div>
            {(s.status === 'pending' || s.status === 'confirmed') && (
                confirmCancel === s.id ? (
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-text-secondary">{t('tutor.cancel_q', 'Cancel this session?')}</span>
                        <Button variant="outline" size="sm" disabled={cancelBusy === s.id} onClick={() => cancel(s)}
                            className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
                            {cancelBusy === s.id ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : null}
                            {t('tutor.cancel_yes', 'Yes, cancel')}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(null)}>{t('tutor.cancel_keep', 'Keep')}</Button>
                    </div>
                ) : (
                    <Button variant="outline" size="sm" onClick={() => setConfirmCancel(s.id)}
                        className="border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 shrink-0">
                        <XCircle size={12} aria-hidden="true" />
                        {t('common.cancel', 'Cancel')}
                    </Button>
                )
            )}
        </div>
    );

    return (
        <div className="space-y-5 max-w-3xl">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
                    <CalendarClock size={22} className="text-white" aria-hidden="true" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">{t('tutor.title', 'Live Tutor Sessions')}</h1>
                    <p className="text-sm text-text-muted">{t('tutor.subtitle2', 'Book 1-on-1 time with a real tutor. Pick a slot, we confirm it by email.')}</p>
                </div>
            </div>

            <Card className="p-5">
                <form onSubmit={submit} className="space-y-5" noValidate>
                    <FormField label={t('tutor.topic', 'What do you want to work on?')}>
                        {(id) => (
                            <div className="space-y-2.5">
                                <Input id={id} minLength={3} maxLength={300} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('tutor.topic_ph', 'e.g. Debugging my decorators lesson, or planning an ML learning path')} />
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs text-text-muted mr-1">Quick pick:</span>
                                    {[
                                        '🌱 School (Class 6–12): Python Basics & Exam Doubt Clearing',
                                        '🎓 College: DSA & Coding Placement Mock Interview',
                                        '🚀 Pro: FastAPI / Async / Python Architecture Review',
                                        '🤖 AI & ML: RAG, LLM Agents & Project Mentoring',
                                    ].map((suggestion) => (
                                        <button
                                            key={suggestion}
                                            type="button"
                                            onClick={() => setTopic(suggestion)}
                                            className="px-2.5 py-1 rounded-lg border border-border-default bg-bg-elevated text-xs text-text-secondary hover:border-accent-primary/50 hover:text-text-primary transition-colors text-left"
                                        >
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </FormField>

                    <section aria-labelledby="tutor-when" className="space-y-3">
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <h2 id="tutor-when" className="text-sm font-semibold text-text-primary">{t('tutor.when', 'When?')}</h2>
                            {tzName && <span className="text-xs text-text-muted">{t('tutor.tz_hint', 'Your timezone: {tz}').replace('{tz}', tzName)}</span>}
                        </div>
                        <ChoiceGroup
                            label={t('tutor.day', 'Day')}
                            options={days}
                            value={pickedOtherDate ? null : day}
                            onChange={setDay}
                            className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
                            itemClassName="min-w-[4.5rem] px-2 py-1.5 shrink-0"
                        />
                        <FormField label={t('tutor.other_date', 'Or another date')}>
                            {(id) => (
                                <Input id={id} type="date" min={todayStr} value={pickedOtherDate ? day : ''}
                                    onChange={(e) => setDay(e.target.value || null)} className="max-w-[12rem]" />
                            )}
                        </FormField>
                        {day && (slots.length ? (
                            <div className="space-y-2">
                                {periods.length > 1 && (
                                    <ChoiceGroup
                                        label={t('tutor.part_of_day', 'Part of the day')}
                                        options={periods}
                                        value={activePeriod}
                                        onChange={setPeriod}
                                        className="inline-flex gap-1 rounded-xl bg-bg-elevated p-1"
                                        itemClassName="min-h-9 px-3 border-transparent"
                                    />
                                )}
                                <ChoiceGroup
                                    label={t('tutor.start_time', 'Start time')}
                                    options={visibleSlots}
                                    value={slot}
                                    onChange={setSlot}
                                    className="grid grid-cols-2 sm:grid-cols-5 gap-2"
                                    itemClassName="px-2"
                                />
                            </div>
                        ) : (
                            <p className="text-sm text-text-muted">{t('tutor.no_slots', 'No times left today — pick another day.')}</p>
                        ))}
                    </section>

                    <section aria-labelledby="tutor-length" className="space-y-2">
                        <h2 id="tutor-length" className="text-sm font-semibold text-text-primary">{t('tutor.how_long', 'How long?')}</h2>
                        <ChoiceGroup
                            label={t('tutor.duration', 'Duration')}
                            options={DURATIONS.map((m) => ({ value: m, label: `${m} min` }))}
                            value={duration}
                            onChange={setDuration}
                            className="inline-flex gap-2"
                            itemClassName="px-4"
                        />
                    </section>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField label={t('tutor.email', 'Email for coordination')} hint={t('tutor.email_hint_optional', 'We confirm the session at this address. Leave blank to use your account email.')}>
                            {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />}
                        </FormField>
                        <FormField label={t('tutor.notes', 'Notes (optional)')}>
                            {(id) => <textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} className="input-neo resize-y" placeholder={t('tutor.notes_ph', 'Anything that helps us prepare — your level, specific errors, goals')} />}
                        </FormField>
                    </div>

                    <div className="rounded-xl border border-border-default bg-bg-elevated p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                        <p className="flex-1 text-sm" aria-live="polite">
                            {summary
                                ? <><span className="text-text-muted">{t('tutor.your_slot', 'Your slot:')} </span><span className="font-semibold text-text-primary">{summary}</span></>
                                : <span className="text-text-muted">{t('tutor.pick_prompt', 'Pick a day and a start time to see your slot here.')}</span>}
                        </p>
                        <Button type="submit" variant="primary" size="md" disabled={busy} className="shrink-0">
                            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                            {t('tutor.submit_slot', 'Request this slot')}
                        </Button>
                    </div>
                    {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
                    {okMsg && (
                        <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5" role="status">
                            <CheckCircle2 size={15} aria-hidden="true" /> {okMsg}
                        </p>
                    )}
                </form>
            </Card>

            <section aria-labelledby="tutor-mine" className="space-y-2">
                <h2 id="tutor-mine" className="text-sm font-bold text-text-secondary">{t('tutor.upcoming', 'Upcoming sessions')}</h2>
                {sessions === null ? (
                    <div className="h-16 rounded-xl bg-bg-elevated animate-pulse" />
                ) : upcoming.length === 0 ? (
                    <p className="text-sm text-text-muted">{t('tutor.none_upcoming', 'Nothing booked yet — request your first slot above.')}</p>
                ) : (
                    <Card className="divide-y divide-border-default">{upcoming.map((s) => <SessionRow key={s.id} s={s} />)}</Card>
                )}
                {past.length > 0 && (
                    <details className="pt-2">
                        <summary className="text-sm font-semibold text-text-secondary cursor-pointer">{t('tutor.past', 'Past and cancelled')} ({past.length})</summary>
                        <Card className="divide-y divide-border-default mt-2">{past.map((s) => <SessionRow key={s.id} s={s} />)}</Card>
                    </details>
                )}
            </section>
        </div>
    );
}
