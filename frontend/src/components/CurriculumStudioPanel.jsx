import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileSearch,
  GitBranch,
  Layers,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  createStudioCurriculum,
  createStudioVersion,
  getStudioCurricula,
  ingestCurriculumSyllabus,
  publishStudioDelta,
} from '../api';
import useI18n from '../hooks/useI18n';
import { safeErrorMsg } from '../utils/errorUtils';
import { Badge, Button, Card } from './ui';

/**
 * CurriculumStudioPanel — Enterprise & Training Center Studio for semantic
 * PDF/DOCX/CSV ingestion via local fastembed, Explainable Curriculum Alignment
 * Cards, and semantic versioning (`v1.0` -> `v1.1`) with non-destructive cohort
 * delta rollouts.
 */
export default function CurriculumStudioPanel({ orgId, groups = [] }) {
  const { t } = useI18n();
  const fileRef = useRef(null);

  const [title, setTitle] = useState('AI & Python Engineering Track');
  const [groupName, setGroupName] = useState('');
  const [topicsInput, setTopicsInput] = useState('Python Dictionaries\nFastAPI REST APIs\nVector Embeddings with Python');
  const [file, setFile] = useState(null);
  const [autoGenerateGaps, setAutoGenerateGaps] = useState(true);

  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState(null);
  const [curricula, setCurricula] = useState([]);
  const [creating, setCreating] = useState(false);

  const [newDeltaTopic, setNewDeltaTopic] = useState('');
  const [diffPreview, setDiffPreview] = useState(null);
  const [versionBusy, setVersionBusy] = useState(null);
  const [banner, setBanner] = useState(null);

  const loadCurricula = useCallback(async () => {
    try {
      const res = await getStudioCurricula(orgId);
      setCurricula(res.data?.curricula || []);
    } catch {
      setCurricula([]);
    }
  }, [orgId]);

  useEffect(() => {
    loadCurricula();
  }, [loadCurricula]);

  const handleIngest = async (e) => {
    e.preventDefault();
    if (ingesting) return;
    setIngesting(true);
    setBanner(null);
    try {
      let res;
      if (file) {
        const fd = new FormData();
        fd.append('title', title.trim() || file.name);
        fd.append('auto_generate_gaps', String(autoGenerateGaps));
        fd.append('file', file);
        res = await ingestCurriculumSyllabus(orgId, fd);
      } else {
        const topics = topicsInput.split('\n').map((s) => s.trim()).filter(Boolean);
        res = await ingestCurriculumSyllabus(orgId, {
          title: title.trim() || 'Enterprise Syllabus',
          topics,
          auto_generate_gaps: autoGenerateGaps,
        });
      }
      setIngestResult(res.data);
      setBanner({
        type: 'ok',
        text: `${res.data.matched_count} matched via fastembed · ${res.data.gap_count} queued/gaps`,
      });
    } catch (err) {
      setBanner({ type: 'err', text: safeErrorMsg(err, 'Syllabus ingestion failed.') });
    } finally {
      setIngesting(false);
    }
  };

  const handleCreateCurriculum = async () => {
    if (!ingestResult?.matches?.length || creating) return;
    setCreating(true);
    setBanner(null);
    try {
      const modules = ingestResult.matches.map((m, idx) => {
        const topMatch = m.matches?.[0];
        return {
          order: idx + 1,
          topic: m.topic,
          lesson_id: topMatch?.id || `pending:${m.queued_job_id || idx + 1}`,
          title: topMatch?.title || m.topic,
          score: m.best_score,
          status: m.status,
          source: m.status === 'matched' ? topMatch?.source_type || 'matched' : 'generated',
          required: true,
        };
      });
      await createStudioCurriculum(orgId, {
        title: title.trim() || 'Enterprise Curriculum',
        group_name: groupName,
        modules,
        changelog: 'Initial v1.0 curriculum blueprint',
      });
      setBanner({ type: 'ok', text: 'Curriculum v1.0 created with Explainable Alignment Blueprint.' });
      await loadCurricula();
    } catch (err) {
      setBanner({ type: 'err', text: safeErrorMsg(err, 'Could not create versioned curriculum.') });
    } finally {
      setCreating(false);
    }
  };

  const handleBumpVersion = async (curr, publishNow = false) => {
    const addition = newDeltaTopic.trim();
    if (!addition || versionBusy) return;
    setVersionBusy(curr.id);
    setBanner(null);
    try {
      const updatedModules = [
        ...(curr.modules || []),
        {
          order: (curr.modules?.length || 0) + 1,
          topic: addition,
          lesson_id: `delta_${Date.now()}`,
          title: addition,
          source: 'generated',
          status: 'gap_queued',
          required: true,
        },
      ];
      const res = await createStudioVersion(orgId, curr.id, {
        bump: 'minor',
        modules: updatedModules,
        changelog: `Added delta module: ${addition}`,
        publish_delta: publishNow,
      });
      setDiffPreview({ curriculumId: curr.id, ...res.data });
      setNewDeltaTopic('');
      setBanner({
        type: 'ok',
        text: publishNow
          ? `Published ${res.data.version} delta to ${res.data.assignment?.target_learners ?? 0} learners.`
          : `Staged ${res.data.from_version} -> ${res.data.version} Impact Diff ready to publish.`,
      });
      await loadCurricula();
    } catch (err) {
      setBanner({ type: 'err', text: safeErrorMsg(err, 'Version bump failed.') });
    } finally {
      setVersionBusy(null);
    }
  };

  const handlePublishDelta = async (curr, version) => {
    if (versionBusy) return;
    setVersionBusy(curr.id);
    setBanner(null);
    try {
      const res = await publishStudioDelta(orgId, curr.id, { version });
      setBanner({
        type: 'ok',
        text: `Rolled out ${res.data.active_version} delta (${res.data.assignment?.new_assignments_created || 0} new assignments). XP, streaks & credentials preserved.`,
      });
      setDiffPreview(null);
      await loadCurricula();
    } catch (err) {
      setBanner({ type: 'err', text: safeErrorMsg(err, 'Delta publish failed.') });
    } finally {
      setVersionBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
              <FileSearch size={17} className="text-accent-primary" aria-hidden="true" />
              {t('studio.title', 'Enterprise Curriculum Studio')}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              {t(
                'studio.subtitle',
                'Upload PDF, DOCX, CSV, or topics to match existing lessons via fastembed, queue missing gaps, and manage v1.0 -> v1.1 delta rollouts.',
              )}
            </p>
          </div>
          <Badge variant="primary">fastembed Vector Studio</Badge>
        </div>

        {banner && (
          <div
            role="status"
            className={`mb-3 rounded-xl px-3.5 py-2.5 text-xs font-medium border ${
              banner.type === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
            }`}
          >
            {banner.text}
          </div>
        )}

        <form onSubmit={handleIngest} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-text-secondary">
              {t('studio.trackTitle', 'Curriculum Title')}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-label="Curriculum Title"
                className="input-neo mt-1 w-full px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-semibold text-text-secondary">
              {t('studio.targetCohort', 'Target Cohort / Group')}
              <select
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                aria-label="Target Cohort"
                className="input-neo mt-1 w-full px-3 py-2 text-sm"
              >
                <option value="">All Org Learners</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!file && (
            <label className="block text-xs font-semibold text-text-secondary">
              {t('studio.topicsInput', 'Syllabus Topics / Skills (one per line)')}
              <textarea
                rows={3}
                value={topicsInput}
                onChange={(e) => setTopicsInput(e.target.value)}
                className="input-neo mt-1 w-full font-mono text-xs"
              />
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.csv,.txt,.md"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="min-h-10 px-3 py-1.5 rounded-xl border border-border-default bg-bg-elevated text-xs font-semibold text-text-secondary hover:text-text-primary inline-flex items-center gap-1.5"
              >
                <Upload size={14} aria-hidden="true" />
                {file ? file.name : t('studio.uploadDoc', 'Upload PDF / DOCX / CSV')}
              </button>

              <label className="inline-flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoGenerateGaps}
                  onChange={(e) => setAutoGenerateGaps(e.target.checked)}
                />
                {t('studio.autoQueueGaps', 'Auto-generate missing gaps via LearnAnything')}
              </label>
            </div>

            <Button type="submit" variant="primary" size="md" disabled={ingesting}>
              {ingesting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {t('studio.analyzeMatch', 'Analyze & Semantic Match')}
            </Button>
          </div>
        </form>

        {ingestResult && (
          <div className="mt-4 pt-4 border-t border-border-default space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-text-primary">
                Semantic Match Results ({ingestResult.matched_count}/{ingestResult.topics_count} matched)
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleCreateCurriculum}
                disabled={creating}
              >
                {creating ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />}
                {t('studio.buildBlueprint', 'Build v1.0 Alignment Blueprint')}
              </Button>
            </div>
            <div className="space-y-2">
              {ingestResult.matches.map((m) => {
                const top = m.matches?.[0];
                const pct = Math.round((m.best_score || 0) * 100);
                return (
                  <div
                    key={m.topic}
                    className="rounded-xl border border-border-default bg-bg-elevated px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-text-primary">{m.topic}</p>
                      <p className="text-xs text-text-muted truncate">
                        {top
                          ? `Best match: ${top.title} (${top.source_type})`
                          : 'No catalog match above threshold'}
                      </p>
                    </div>
                    <Badge variant={m.status === 'matched' ? 'success' : 'warning'}>
                      {m.status === 'matched' ? `${pct}% match` : 'Gap Queued'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Active Versioned Curricula + Explainable Alignment Blueprint + Impact Diff */}
      {curricula.map((curr) => {
        const bp = curr.blueprint || {};
        const latestVer = curr.versions?.[curr.versions.length - 1];
        const hasPendingStaged = latestVer && latestVer.version !== curr.active_version;
        return (
          <Card key={curr.id} className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <GitBranch size={15} className="text-accent-primary" aria-hidden="true" />
                  {curr.title}
                </h4>
                <p className="text-xs text-text-muted">
                  Active {curr.active_version} · {curr.group_name ? `Cohort: ${curr.group_name}` : 'Whole Org'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(curr.versions || []).map((v) => (
                  <Badge
                    key={v.id}
                    variant={v.version === curr.active_version ? 'success' : 'neutral'}
                  >
                    {v.version}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Explainable Curriculum Alignment Card */}
            <div className="rounded-2xl border border-border-default bg-bg-elevated p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-accent-primary">
                  {t('studio.alignmentCard', 'Explainable Curriculum Alignment Card')}
                </span>
                <div className="flex items-center gap-3 text-xs text-text-secondary">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={13} aria-hidden="true" /> {bp.estimated_hours ?? 0} hrs
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 size={13} className="text-emerald-500" aria-hidden="true" />
                    {bp.hands_on_lab_coverage_pct ?? 0}% hands-on labs
                  </span>
                </div>
              </div>
              {bp.summary && <p className="text-xs text-text-secondary">{bp.summary}</p>}
              {Array.isArray(bp.target_competencies) && bp.target_competencies.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {bp.target_competencies.map((comp) => (
                    <span
                      key={comp}
                      className="text-xs px-2.5 py-0.5 rounded-full bg-bg-surface border border-border-default text-text-secondary"
                    >
                      {comp}
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-1.5">
                {(bp.module_rationales || []).map((mr) => (
                  <div key={`${mr.order}-${mr.topic}`} className="text-xs text-text-secondary">
                    <span className="font-bold text-text-primary">{mr.order}. {mr.topic}:</span>{' '}
                    {mr.why_included}
                  </div>
                ))}
              </div>
            </div>

            {/* Semantic Version Bump + Impact Diff */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newDeltaTopic}
                onChange={(e) => setNewDeltaTopic(e.target.value)}
                placeholder={t('studio.addDeltaPlaceholder', 'Add new module topic for next version (e.g. v1.1)')}
                aria-label="New delta module topic"
                className="input-neo flex-1 px-3 py-2 text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={versionBusy === curr.id || !newDeltaTopic.trim()}
                onClick={() => handleBumpVersion(curr, false)}
              >
                <Plus size={13} aria-hidden="true" /> Stage Next Version
              </Button>
            </div>

            {diffPreview && diffPreview.curriculumId === curr.id && (
              <div className="rounded-xl border border-accent-primary/40 bg-accent-subtle/40 p-3.5 space-y-2 text-xs">
                <div className="font-bold text-text-primary flex items-center justify-between gap-2">
                  <span>
                    Impact Diff: {diffPreview.from_version} -&gt; {diffPreview.version}
                  </span>
                  <span>{diffPreview.impact_diff?.affected_learners ?? 0} cohort learners</span>
                </div>
                <p className="text-text-secondary">
                  Only added modules (+{diffPreview.impact_diff?.added_modules?.length || 0}) will be assigned.
                  Existing completions, XP, streaks, and verifiable credentials remain untouched.
                </p>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-semibold">
                    <ShieldCheck size={13} /> XP · Streaks · Credentials Preserved
                  </span>
                  {!diffPreview.published && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={versionBusy === curr.id}
                      onClick={() => handlePublishDelta(curr, diffPreview.version)}
                    >
                      Publish Delta ({diffPreview.version})
                    </Button>
                  )}
                </div>
              </div>
            )}

            {hasPendingStaged && !diffPreview && (
              <div className="flex items-center justify-between rounded-xl border border-border-default bg-bg-elevated px-3.5 py-2.5 text-xs">
                <span>Staged version {latestVer.version} pending cohort delta rollout</span>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={versionBusy === curr.id}
                  onClick={() => handlePublishDelta(curr, latestVer.version)}
                >
                  Publish Delta ({latestVer.version})
                </Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
