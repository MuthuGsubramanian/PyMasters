import { useCallback, useEffect, useRef, useState } from 'react';
import {
    BookPlus, Loader2, RefreshCw, Upload, FileText, X, CheckCircle2,
    Eye, EyeOff, Trash2, Send,
} from 'lucide-react';
import {
    createOrgLessonSet, uploadOrgLessonSet, getOrgLessonSets,
    publishOrgLessonItem, unpublishOrgLessonItem, deleteOrgLessonSet,
} from '../api';
import { safeErrorMsg } from '../utils/errorUtils';
import { Badge, Button, Card, FormField, Input } from './ui';

const ITEM_BADGE = {
    generating: 'warning',
    generated: 'info',
    published: 'success',
    failed: 'danger',
};

/**
 * Org/school admin curriculum authoring: type topics (or upload a text/CSV
 * syllabus), watch them generate into lessons, review each, and publish to the
 * whole org or a specific group. Published lessons appear in members' classrooms.
 */
export default function OrgCurriculumPanel({ orgId, groups = [] }) {
    const [sets, setSets] = useState(null);
    const [title, setTitle] = useState('');
    const [topicsText, setTopicsText] = useState('');
    const [groupName, setGroupName] = useState('');
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [itemBusy, setItemBusy] = useState(null);
    const [error, setError] = useState('');
    const [ok, setOk] = useState('');
    const fileRef = useRef(null);

    const load = useCallback(() => {
        getOrgLessonSets(orgId).then((r) => setSets(r.data.sets || [])).catch(() => setSets([]));
    }, [orgId]);
    useEffect(() => { load(); }, [load]);

    // Poll while anything is still generating so statuses update live.
    useEffect(() => {
        if (!sets || !sets.some((s) => s.status === 'generating')) return;
        const t = setInterval(load, 8000);
        return () => clearInterval(t);
    }, [sets, load]);

    const reset = () => { setTitle(''); setTopicsText(''); setFile(null); if (fileRef.current) fileRef.current.value = ''; };

    const submit = async (e) => {
        e.preventDefault();
        if (busy) return;
        if (!title.trim()) { setError('Give the set a title.'); return; }
        setBusy(true); setError(''); setOk('');
        try {
            if (file) {
                const fd = new FormData();
                fd.append('title', title.trim());
                fd.append('group_name', groupName);
                fd.append('file', file);
                await uploadOrgLessonSet(orgId, fd);
            } else {
                const topics = topicsText.split('\n').map((t) => t.trim()).filter(Boolean);
                if (topics.length === 0) { setError('Add at least one topic (one per line) or upload a file.'); setBusy(false); return; }
                await createOrgLessonSet(orgId, { title: title.trim(), group_name: groupName, topics });
            }
            setOk('Lessons are generating — review and publish them once ready.');
            reset();
            load();
        } catch (err) {
            setError(safeErrorMsg(err, 'Could not create the set.'));
        } finally {
            setBusy(false);
        }
    };

    const itemAction = async (setId, item, action) => {
        setItemBusy(item.id); setError('');
        try {
            if (action === 'publish') await publishOrgLessonItem(orgId, setId, item.id);
            else await unpublishOrgLessonItem(orgId, setId, item.id);
            load();
        } catch (err) { setError(safeErrorMsg(err, 'Action failed')); }
        finally { setItemBusy(null); }
    };

    const removeSet = async (s) => {
        if (!window.confirm(`Delete "${s.title}" and its lessons? Published lessons stop showing for members.`)) return;
        setItemBusy(s.id); setError('');
        try { await deleteOrgLessonSet(orgId, s.id); load(); }
        catch (err) { setError(safeErrorMsg(err, 'Could not delete')); }
        finally { setItemBusy(null); }
    };

    return (
        <div className="space-y-5 max-w-3xl">
            <Card className="p-4">
                <h3 className="text-sm font-bold text-text-primary mb-1 flex items-center gap-2">
                    <BookPlus size={15} className="text-accent-primary" aria-hidden="true" /> New curriculum set
                </h3>
                <p className="text-xs text-text-muted mb-3 leading-relaxed">
                    Enter up to 10 topics (one per line) or upload a text/CSV syllabus. Each becomes a lesson via
                    Vaathiyaar. You review each lesson and publish the ones you want — published lessons appear in
                    your members' classrooms.
                </p>
                <form onSubmit={submit} className="space-y-3">
                    <FormField label="Set title">
                        {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Week 1 — Python Basics" />}
                    </FormField>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <FormField label="Assign to" hint="Whole organization, or one group.">
                            {(id) => (
                                <select id={id} value={groupName} onChange={(e) => setGroupName(e.target.value)} className="input-neo">
                                    <option value="">Whole organization</option>
                                    {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                                </select>
                            )}
                        </FormField>
                    </div>
                    {!file && (
                        <FormField label="Topics (one per line, max 10)">
                            {(id) => <textarea id={id} value={topicsText} onChange={(e) => setTopicsText(e.target.value)} rows={4} className="input-neo resize-y font-mono text-sm" placeholder={"Recursion\nDictionaries & sets\nList comprehensions"} />}
                        </FormField>
                    )}
                    <div>
                        <input ref={fileRef} type="file" accept=".txt,.csv,text/plain,text/csv" className="sr-only"
                            onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        {file ? (
                            <div className="flex items-center gap-2 rounded-xl border border-border-strong bg-bg-elevated px-3 py-2.5">
                                <FileText size={15} className="text-accent-primary shrink-0" aria-hidden="true" />
                                <span className="text-xs text-text-secondary truncate flex-1">{file.name}</span>
                                <button type="button" aria-label="Remove file" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                                    className="p-1 rounded-md text-text-muted hover:text-red-500"><X size={13} aria-hidden="true" /></button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => fileRef.current?.click()}
                                className="inline-flex items-center gap-2 text-xs font-semibold text-text-muted hover:text-text-secondary">
                                <Upload size={14} aria-hidden="true" /> or upload a .txt / .csv syllabus
                            </button>
                        )}
                    </div>
                    {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
                    {ok && <p className="text-xs text-emerald-600 flex items-center gap-1.5" role="status"><CheckCircle2 size={13} aria-hidden="true" /> {ok}</p>}
                    <Button type="submit" variant="primary" size="md" disabled={busy}>
                        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                        Generate lessons
                    </Button>
                </form>
            </Card>

            <div>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-text-secondary">Curriculum sets</h3>
                    <button onClick={load} title="Refresh" className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors">
                        <RefreshCw size={13} aria-hidden="true" />
                    </button>
                </div>
                {sets === null ? (
                    <div className="h-16 rounded-xl bg-bg-elevated animate-pulse" />
                ) : sets.length === 0 ? (
                    <p className="text-sm text-text-muted">No sets yet — create one above.</p>
                ) : (
                    <div className="space-y-3">
                        {sets.map((s) => (
                            <Card key={s.id} className="p-4">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <span className="text-sm font-bold text-text-primary">{s.title}</span>
                                    <Badge variant={s.status === 'ready' ? 'success' : 'warning'}>{s.status}</Badge>
                                    <span className="text-[11px] text-text-muted">{s.group_name ? `Group: ${s.group_name}` : 'Whole org'} · {s.published_count}/{s.items.length} published</span>
                                    <button disabled={itemBusy === s.id} onClick={() => removeSet(s)}
                                        className="ml-auto p-1 rounded-md text-text-muted hover:text-red-500 disabled:opacity-40" aria-label="Delete set">
                                        <Trash2 size={13} aria-hidden="true" />
                                    </button>
                                </div>
                                <ul className="divide-y divide-border-default">
                                    {s.items.map((it) => (
                                        <li key={it.id} className="flex items-center gap-2 py-2">
                                            <span className="text-xs text-text-secondary flex-1 truncate">{it.topic}</span>
                                            <Badge variant={ITEM_BADGE[it.status] || 'neutral'}>{it.status}</Badge>
                                            {it.status === 'generated' && (
                                                <Button variant="primary" size="sm" disabled={itemBusy === it.id} onClick={() => itemAction(s.id, it, 'publish')}>
                                                    {itemBusy === it.id ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : <Eye size={11} aria-hidden="true" />} Publish
                                                </Button>
                                            )}
                                            {it.status === 'published' && (
                                                <Button variant="outline" size="sm" disabled={itemBusy === it.id} onClick={() => itemAction(s.id, it, 'unpublish')}>
                                                    <EyeOff size={11} aria-hidden="true" /> Unpublish
                                                </Button>
                                            )}
                                            {it.status === 'failed' && (
                                                <span className="text-[10px] text-red-500 max-w-[45%] truncate" title={it.error}>
                                                    {it.error || 'Generation failed — try again'}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
