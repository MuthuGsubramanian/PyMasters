import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Code2,
  GraduationCap,
  Layers,
  Loader2,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  getOrgCohorts,
  getSchoolConfig,
  getSchoolTemplates,
  provisionCohortSyllabus,
  updateSchoolConfig,
} from '../api';
import useI18n from '../hooks/useI18n';

const BOARDS = ['CBSE', 'ICSE', 'STATE', 'IB'];
const GRADES = [6, 7, 8, 9, 10, 11, 12];

/**
 * SchoolProvisioningWizard — Enables school admins to pick Board -> Grade ->
 * "Load All Subjects" or individual subject toggles for a cohort, set strict
 * school-track scoping + SSO domain defaults, and monitor cohort mastery.
 */
export default function SchoolProvisioningWizard({
  orgId,
  orgType = 'school',
  teachers = [],
  onProvisioned,
}) {
  const { t } = useI18n();
  const [board, setBoard] = useState('CBSE');
  const [grade, setGrade] = useState(8);
  const [cohortName, setCohortName] = useState('Grade 8 - Section A');
  const [loadAllSubjects, setLoadAllSubjects] = useState(true);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [hidePublicTracks, setHidePublicTracks] = useState(true);
  const [assignTeacherIds, setAssignTeacherIds] = useState([]);

  const [ssoProvider, setSsoProvider] = useState('');
  const [ssoDomain, setSsoDomain] = useState('');
  const [seatLimit, setSeatLimit] = useState(250);

  const [templates, setTemplates] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingSso, setSavingSso] = useState(false);
  const [banner, setBanner] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, cohRes, cfgRes] = await Promise.all([
        getSchoolTemplates({ board, grade }),
        getOrgCohorts(orgId),
        getSchoolConfig(orgId).catch(() => ({ data: null })),
      ]);
      const tpls = tplRes.data?.templates || [];
      setTemplates(tpls);
      if (tpls[0]?.subjects) {
        setSelectedCodes(tpls[0].subjects.map((s) => s.subject_code));
      }
      setCohorts(cohRes.data?.cohorts || []);
      if (cfgRes.data?.config) {
        setSsoProvider(cfgRes.data.config.sso_provider || '');
        setSsoDomain(cfgRes.data.config.sso_domain || '');
        setSeatLimit(cfgRes.data.config.seat_limit || 250);
      }
    } catch {
      // Non-fatal in non-school org contexts
    } finally {
      setLoading(false);
    }
  }, [orgId, board, grade]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const activeTemplate = templates[0] || null;
  const subjects = activeTemplate?.subjects || [];

  const handleGradeChange = (g) => {
    const next = Number(g);
    setGrade(next);
    setCohortName(`Grade ${next} - Section A`);
  };

  const toggleSubject = (code) => {
    setLoadAllSubjects(false);
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const toggleTeacher = (id) => {
    setAssignTeacherIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSaveSchoolConfig = async () => {
    setSavingSso(true);
    setBanner(null);
    try {
      await updateSchoolConfig(orgId, {
        board,
        academic_year: '2026-27',
        sso_provider: ssoProvider,
        sso_domain: ssoDomain,
        hide_public_tracks: hidePublicTracks,
        seat_limit: Number(seatLimit) || 250,
      });
      setBanner({ type: 'ok', text: t('school.configSaved', 'School board & SSO settings saved.') });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err?.response?.data?.detail || 'Failed to save school configuration.',
      });
    } finally {
      setSavingSso(false);
    }
  };

  const handleProvision = async (e) => {
    e.preventDefault();
    if (!cohortName.trim()) return;
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await provisionCohortSyllabus(orgId, {
        cohort_name: cohortName.trim(),
        board,
        grade,
        load_all_subjects: loadAllSubjects,
        subject_codes: loadAllSubjects ? [] : selectedCodes,
        hide_public_tracks: hidePublicTracks,
        assign_teacher_ids: assignTeacherIds,
      });
      const cnt = res.data?.modules?.length || 0;
      const subCnt = res.data?.subjects?.length || 0;
      setBanner({
        type: 'ok',
        text: `Provisioned ${cohortName.trim()} (${board} Grade ${grade}) with ${subCnt} subjects and ${cnt} term modules.`,
      });
      await loadAll();
      if (onProvisioned) onProvisioned();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err?.response?.data?.detail || 'Could not provision cohort syllabus.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 mb-6">
      <div className="panel p-5 border border-border-default bg-bg-surface rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
              <GraduationCap size={18} className="text-accent-primary" />
              {t('school.wizardTitle', 'School Syllabus & Cohort Provisioning')}
              {orgType === 'school' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent-subtle text-accent-primary font-semibold">
                  K-12 Ready
                </span>
              )}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              {t(
                'school.wizardSubtitle',
                'Select board and grade, load all subjects or customize, and scope student dashboards automatically.',
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveSchoolConfig}
            disabled={savingSso}
            className="min-h-10 px-3 py-1.5 rounded-xl border border-border-default bg-bg-elevated hover:border-border-strong text-xs font-semibold text-text-primary flex items-center gap-1.5"
          >
            {savingSso ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} className="text-emerald-500" />}
            {t('school.saveConfig', 'Save Board & SSO Policy')}
          </button>
        </div>

        {banner && (
          <div
            role="status"
            className={`mb-4 rounded-xl px-3.5 py-2.5 text-xs font-medium border ${
              banner.type === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
            }`}
          >
            {banner.text}
          </div>
        )}

        <form onSubmit={handleProvision} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block text-xs font-semibold text-text-secondary">
              {t('school.boardLabel', 'Educational Board')}
              <select
                value={board}
                onChange={(e) => setBoard(e.target.value)}
                aria-label="Educational Board"
                className="input-neo mt-1 w-full px-3 py-2 text-sm"
              >
                {BOARDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-text-secondary">
              {t('school.gradeLabel', 'Grade / Class')}
              <select
                value={grade}
                onChange={(e) => handleGradeChange(e.target.value)}
                aria-label="Grade"
                className="input-neo mt-1 w-full px-3 py-2 text-sm"
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-text-secondary">
              {t('school.cohortNameLabel', 'Cohort / Section Name')}
              <input
                type="text"
                value={cohortName}
                onChange={(e) => setCohortName(e.target.value)}
                placeholder="Grade 8 - Section A"
                aria-label="Cohort Name"
                className="input-neo mt-1 w-full px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="rounded-xl border border-border-default bg-bg-elevated/60 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                <Layers size={14} className="text-accent-primary" />
                {t('school.subjectsHeader', 'Subjects & Pedagogical Tracks')}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = !loadAllSubjects;
                  setLoadAllSubjects(next);
                  if (next) setSelectedCodes(subjects.map((s) => s.subject_code));
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  loadAllSubjects
                    ? 'bg-accent-primary text-primary-foreground border-transparent'
                    : 'bg-bg-surface text-text-secondary border-border-default hover:border-border-strong'
                }`}
              >
                {loadAllSubjects
                  ? t('school.allSubjectsLoaded', 'All Subjects Selected')
                  : t('school.loadAllSubjects', 'Load All Subjects')}
              </button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-xs text-text-muted py-2">
                <Loader2 size={14} className="animate-spin" /> Loading syllabus subjects…
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {subjects.map((sub) => {
                  const checked = loadAllSubjects || selectedCodes.includes(sub.subject_code);
                  const isCoding = sub.pedagogy_mode === 'coding_ide';
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => toggleSubject(sub.subject_code)}
                      className={`text-left rounded-xl p-2.5 border transition-colors flex items-start gap-2 ${
                        checked
                          ? 'border-accent-primary bg-accent-subtle'
                          : 'border-border-default bg-bg-surface hover:bg-bg-elevated'
                      }`}
                    >
                      <span className="mt-0.5 text-accent-primary">
                        {isCoding ? <Code2 size={14} /> : <BookOpen size={14} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-text-primary truncate">
                          {sub.subject_name}
                        </span>
                        <span className="block text-xs text-text-muted">
                          {isCoding ? 'CodeMirror IDE + Trace' : 'Concept Cards + Socratic'} ·{' '}
                          {sub.unit_count} units
                        </span>
                      </span>
                      {checked && <CheckCircle2 size={14} className="text-accent-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <label className="block text-xs font-semibold text-text-secondary">
              {t('school.ssoProvider', 'School SSO Provider')}
              <select
                value={ssoProvider}
                onChange={(e) => setSsoProvider(e.target.value)}
                className="input-neo mt-1 w-full px-3 py-2 text-sm"
              >
                <option value="">Email / Invite Only</option>
                <option value="google_workspace">Google Workspace for Education</option>
                <option value="entra_id">Microsoft Entra ID</option>
                <option value="saml">SAML 2.0 Identity</option>
              </select>
            </label>

            <label className="block text-xs font-semibold text-text-secondary">
              {t('school.ssoDomain', 'Verified School Domain')}
              <input
                type="text"
                value={ssoDomain}
                onChange={(e) => setSsoDomain(e.target.value)}
                placeholder="oakridge.edu.in"
                className="input-neo mt-1 w-full px-3 py-2 text-sm"
              />
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-text-secondary py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hidePublicTracks}
                onChange={(e) => setHidePublicTracks(e.target.checked)}
                className="rounded border-border-strong"
              />
              {t('school.hidePublicTracks', 'Scope dashboard to provisioned school subjects')}
            </label>
          </div>

          {teachers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-text-muted">Assign Teachers:</span>
              {teachers.map((m) => {
                const uid = m.user_id || m.id;
                const active = assignTeacherIds.includes(uid);
                return (
                  <button
                    key={uid}
                    type="button"
                    onClick={() => toggleTeacher(uid)}
                    className={`px-2.5 py-1 rounded-full border text-xs font-medium ${
                      active
                        ? 'bg-accent-subtle border-accent-primary text-accent-primary'
                        : 'bg-bg-elevated border-border-default text-text-secondary'
                    }`}
                  >
                    {m.name || m.username}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || (!loadAllSubjects && selectedCodes.length === 0)}
              className="btn-neo px-4 py-2.5 text-sm font-bold flex items-center gap-2"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {t('school.provisionBtn', 'Provision Cohort Syllabus')}
            </button>
          </div>
        </form>
      </div>

      {cohorts.length > 0 && (
        <div className="panel p-4 border border-border-default bg-bg-surface rounded-2xl">
          <h4 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <Users size={15} className="text-accent-primary" />
            {t('school.activeCohorts', 'Provisioned Cohorts & Mastery Analytics')}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {cohorts.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-border-default bg-bg-elevated/60 p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-text-primary">{c.cohort_name}</div>
                    <div className="text-xs text-text-muted">
                      {c.board} · Grade {c.grade} · {c.subjects?.length || 0} subjects · {c.module_count} modules
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-accent-subtle text-accent-primary">
                    {c.completion_rate_pct}% done
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(c.subjects || []).map((s) => (
                    <span
                      key={s.id}
                      className="text-xs px-2 py-0.5 rounded-md bg-bg-surface border border-border-default text-text-secondary"
                    >
                      {s.subject_name}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs text-text-muted pt-1 border-t border-border-default">
                  <span>Students: {c.student_count}</span>
                  <span>Avg XP: {c.avg_xp}</span>
                  <span>Mastery: {c.avg_mastery_pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
