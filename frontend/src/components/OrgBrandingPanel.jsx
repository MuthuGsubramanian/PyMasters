import { useCallback, useEffect, useMemo, useState } from 'react';
import { Palette, RotateCcw, Save, Loader2, Check, AlertTriangle, Image as ImageIcon, Building2 } from 'lucide-react';
import { getOrgBranding, updateOrgBranding } from '../api';
import { publishOrgBranding } from '../hooks/useOrgBranding';
import { safeErrorMsg } from '../utils/errorUtils';
import { Card, Button, FormField, Badge } from './ui';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const HEX = /^#[0-9a-fA-F]{6}$/;
// Platform defaults used only to seed the <input type="color"> swatch when
// the org has not chosen a colour (the picker cannot display "unset").
const DEFAULT_PRIMARY = '#7c3aed';
const DEFAULT_ACCENT = '#06b6d4';

const LIMITS = {
  portal_name: 40, tagline: 80, logo_url: 500,
  learner_label: 30, group_label: 30, instructor_label: 30,
  welcome_message: 280,
};

const TYPE_LABELS = {
  school: 'School', university: 'University', training_center: 'Training Center',
  enterprise: 'Enterprise', other: 'Other',
};

const EMPTY_FORM = {
  portal_name: '', tagline: '', logo_url: '',
  primary_color: '', accent_color: '',
  learner_label: '', group_label: '', instructor_label: '',
  welcome_message: '', show_powered_by: true,
};

/** Shape the server's effective branding into editable form state. Labels that
 *  merely equal the preset are shown as the preset (so the admin sees what
 *  members see) -- "Reset to defaults" and an empty field both mean "use preset". */
function toForm(branding, preset) {
  const b = branding || {};
  const p = preset || {};
  return {
    portal_name: b.portal_name || '',
    tagline: b.tagline || '',
    logo_url: b.logo_url || '',
    primary_color: b.primary_color || '',
    accent_color: b.accent_color || '',
    learner_label: b.learner_label || p.learner_label || '',
    group_label: b.group_label || p.group_label || '',
    instructor_label: b.instructor_label || p.instructor_label || '',
    welcome_message: b.welcome_message || '',
    show_powered_by: b.show_powered_by !== false,
  };
}

function validate(form) {
  const errs = {};
  for (const [k, max] of Object.entries(LIMITS)) {
    if ((form[k] || '').length > max) errs[k] = `Max ${max} characters`;
  }
  for (const k of ['primary_color', 'accent_color']) {
    const v = (form[k] || '').trim();
    if (v && !HEX.test(v)) errs[k] = 'Use a 6-digit hex colour like #1e90ff';
  }
  const logo = (form.logo_url || '').trim();
  if (logo && !/^https?:\/\/\S+$/.test(logo)) errs.logo_url = 'Must start with http:// or https://';
  if (/[<>]/.test(form.portal_name + form.tagline + form.welcome_message)) {
    errs.portal_name = errs.portal_name || 'Angle brackets are not allowed';
  }
  return errs;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */
function ColorField({ id, label, value, fallback, error, onChange }) {
  const swatch = HEX.test(value || '') ? value : fallback;
  return (
    <div>
      <label htmlFor={`${id}-hex`} className="block text-xs font-semibold text-text-secondary mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          id={`${id}-picker`}
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} picker`}
          className="h-10 w-12 rounded-lg border border-border-default bg-bg-surface p-1 cursor-pointer shrink-0"
        />
        <input
          id={`${id}-hex`}
          type="text"
          inputMode="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Default (${fallback})`}
          spellCheck={false}
          maxLength={7}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          className="input-neo py-2 px-3 text-sm font-mono flex-1 min-w-0"
        />
        {value && (
          <Button type="button" variant="ghost" size="sm" className="cursor-pointer shrink-0" onClick={() => onChange('')} aria-label={`Clear ${label}`}>
            Clear
          </Button>
        )}
      </div>
      {error
        ? <p id={`${id}-err`} className="text-[11px] text-red-500 mt-1">{error}</p>
        : <p className="text-[11px] text-text-muted mt-1">Leave empty to keep the PyMasters default.</p>}
    </div>
  );
}

function TextField({ id, label, value, max, hint, error, onChange, multiline = false, placeholder = '' }) {
  const common = {
    id,
    value,
    maxLength: max,
    placeholder,
    onChange: (e) => onChange(e.target.value),
    'aria-invalid': !!error,
    'aria-describedby': error ? `${id}-err` : undefined,
  };
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label htmlFor={id} className="block text-xs font-semibold text-text-secondary">{label}</label>
        <span className="text-[10px] text-text-muted font-mono" aria-hidden="true">{value.length}/{max}</span>
      </div>
      {multiline
        ? <textarea {...common} rows={3} className="input-neo py-2 px-3 text-sm w-full resize-y" />
        : <input {...common} type="text" className="input-neo py-2 px-3 text-sm w-full" />}
      {error
        ? <p id={`${id}-err`} className="text-[11px] text-red-500 mt-1">{error}</p>
        : hint && <p className="text-[11px] text-text-muted mt-1">{hint}</p>}
    </div>
  );
}

/** Mini navbar + welcome line rendered from the unsaved form so admins see the
 *  effect before saving. Uses inline style for the two colours since they are
 *  not yet applied to the document tokens. */
function Preview({ form, preset, orgName, userName }) {
  const primary = HEX.test(form.primary_color) ? form.primary_color : DEFAULT_PRIMARY;
  const accent = HEX.test(form.accent_color) ? form.accent_color : DEFAULT_ACCENT;
  const portal = form.portal_name.trim() || 'PyMasters';
  const custom = !!form.portal_name.trim();
  const learner = form.learner_label.trim() || preset?.learner_label || 'Learners';
  const group = form.group_label.trim() || preset?.group_label || 'Group';
  const instructor = form.instructor_label.trim() || preset?.instructor_label || 'Mentor';
  const singular = learner.endsWith('s') && learner.length > 3 ? learner.slice(0, -1) : learner;
  return (
    <Card className="overflow-hidden" aria-label="Live preview" role="region">
      <div className="px-4 py-2 border-b border-border-default text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Live preview
      </div>
      {/* mini navbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-bg-elevated border-b border-border-default">
        <div className="flex items-center gap-3 min-w-0">
          {form.logo_url.trim() ? (
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center overflow-hidden shrink-0 border border-border-default">
              <img src={form.logo_url.trim()} alt={`${portal} logo`} className="w-10 h-10 object-contain" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
              <Building2 size={20} aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-text-primary truncate">{portal}</div>
            {custom && form.show_powered_by
              ? <div className="text-[10px] text-text-muted">Powered by <span className="font-mono font-bold" style={{ color: accent }}>PyMasters</span></div>
              : form.tagline.trim() && <div className="text-[10px] text-text-muted truncate">{form.tagline.trim()}</div>}
          </div>
        </div>
        <span className="hidden sm:inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full text-white shrink-0" style={{ background: primary }}>
          {instructor}
        </span>
      </div>
      {/* welcome block */}
      <div className="p-4 space-y-3">
        <div>
          <p className="text-lg font-bold text-text-primary">Welcome, {userName || singular}!</p>
          {form.welcome_message.trim()
            ? <p className="text-sm text-text-secondary mt-1">{form.welcome_message.trim()}</p>
            : <p className="text-sm text-text-muted mt-1">{form.tagline.trim() || `Your ${orgName} learning portal.`}</p>}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full border border-border-default text-text-secondary">{learner}: 24</span>
          <span className="px-2.5 py-1 rounded-full border border-border-default text-text-secondary">{group}: Alpha</span>
          <span className="px-2.5 py-1 rounded-full text-white font-semibold" style={{ background: accent }}>Continue lesson</span>
        </div>
        <div className="h-2 rounded-full bg-bg-elevated overflow-hidden" aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: '62%', background: `linear-gradient(90deg, ${primary}, ${accent})` }} />
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel                                                              */
/* ------------------------------------------------------------------ */
export default function OrgBrandingPanel({ orgId, orgName = 'your organization', userName = '', onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [preset, setPreset] = useState(null);
  const [orgType, setOrgType] = useState('other');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // {kind: 'ok'|'err', msg}
  const [loadError, setLoadError] = useState('');
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await getOrgBranding(orgId);
      const d = res?.data || {};
      setPreset(d.preset || null);
      setOrgType(d.type || 'other');
      setForm(toForm(d.branding, d.preset));
      setDirty(false);
    } catch (err) {
      setLoadError(safeErrorMsg(err, 'Could not load branding'));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const errors = useMemo(() => validate(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;

  const set = (key) => (val) => {
    setForm((f) => ({ ...f, [key]: val }));
    setDirty(true);
    setStatus(null);
  };

  const resetLabels = () => {
    if (!preset) return;
    setForm((f) => ({
      ...f,
      learner_label: preset.learner_label || '',
      group_label: preset.group_label || '',
      instructor_label: preset.instructor_label || '',
    }));
    setDirty(true);
    setStatus(null);
  };

  const save = async (e) => {
    e?.preventDefault?.();
    if (hasErrors || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      // Labels equal to the preset are sent as '' so the server stores no
      // override (a later type change then picks up the new preset).
      const payload = { ...form };
      for (const k of ['learner_label', 'group_label', 'instructor_label']) {
        payload[k] = (form[k] || '').trim();
        if (preset && payload[k] === preset[k]) payload[k] = '';
      }
      for (const k of ['portal_name', 'tagline', 'logo_url', 'welcome_message', 'primary_color', 'accent_color']) {
        payload[k] = (form[k] || '').trim();
      }
      const res = await updateOrgBranding(orgId, payload);
      const d = res?.data || {};
      publishOrgBranding(orgId, d);
      setForm(toForm(d.branding, d.preset || preset));
      setDirty(false);
      setStatus({ kind: 'ok', msg: 'Branding saved. Members see it on their next page load.' });
      onSaved?.(d.branding);
    } catch (err) {
      setStatus({ kind: 'err', msg: safeErrorMsg(err, 'Could not save branding') });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading branding">
        {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-bg-elevated animate-pulse" />)}
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="p-6 text-center space-y-3">
        <AlertTriangle className="mx-auto text-amber-500" size={24} aria-hidden="true" />
        <p className="text-sm text-text-secondary">{loadError}</p>
        <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={load}>Retry</Button>
      </Card>
    );
  }

  const typeLabel = TYPE_LABELS[orgType] || orgType;

  return (
    <form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-5 gap-4" noValidate>
      {/* ---- Form column ---- */}
      <div className="lg:col-span-3 space-y-4 min-w-0">
        <Card className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-accent-primary" aria-hidden="true" />
            <h3 className="text-sm font-bold text-text-secondary">Portal identity</h3>
          </div>
          <TextField id="br-portal-name" label="Portal name" value={form.portal_name} max={LIMITS.portal_name}
            placeholder="e.g. Globex Academy" hint="Replaces the PyMasters wordmark in the navigation."
            error={errors.portal_name} onChange={set('portal_name')} />
          <TextField id="br-tagline" label="Tagline" value={form.tagline} max={LIMITS.tagline}
            placeholder="A short line under the name" error={errors.tagline} onChange={set('tagline')} />
          <div>
            <TextField id="br-logo" label="Logo URL" value={form.logo_url} max={LIMITS.logo_url}
              placeholder="https://..." hint="Square PNG/SVG, shown in a 40px box. Must be https."
              error={errors.logo_url} onChange={set('logo_url')} />
            {form.logo_url.trim() && !errors.logo_url && (
              <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                <ImageIcon size={12} aria-hidden="true" />
                <div className="w-10 h-10 rounded-lg bg-white border border-border-default flex items-center justify-center overflow-hidden">
                  <img src={form.logo_url.trim()} alt="Logo preview" className="w-10 h-10 object-contain" />
                </div>
                <span>Logo preview</span>
              </div>
            )}
          </div>
          <TextField id="br-welcome" label="Welcome message" value={form.welcome_message} max={LIMITS.welcome_message}
            multiline placeholder="Shown to members on their dashboard" error={errors.welcome_message} onChange={set('welcome_message')} />
          <label htmlFor="br-powered" className="flex items-center gap-3 cursor-pointer select-none">
            <input id="br-powered" type="checkbox" checked={form.show_powered_by}
              onChange={(e) => set('show_powered_by')(e.target.checked)}
              className="h-4 w-4 rounded border-border-default accent-accent-primary cursor-pointer" />
            <span className="text-sm text-text-secondary">Show &ldquo;Powered by PyMasters&rdquo; under a custom portal name</span>
          </label>
        </Card>

        <Card className="p-4 sm:p-5 space-y-4">
          <h3 className="text-sm font-bold text-text-secondary">Colours</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ColorField id="br-primary" label="Primary colour" value={form.primary_color} fallback={DEFAULT_PRIMARY}
              error={errors.primary_color} onChange={set('primary_color')} />
            <ColorField id="br-accent" label="Accent colour" value={form.accent_color} fallback={DEFAULT_ACCENT}
              error={errors.accent_color} onChange={set('accent_color')} />
          </div>
          <p className="text-[11px] text-text-muted">Primary tints buttons, links and the active nav item; accent is used for highlights and progress.</p>
        </Card>

        <Card className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-text-secondary">Vocabulary</h3>
              <Badge variant={preset?.kind === 'educational' ? 'success' : 'primary'} className="uppercase">{preset?.kind || typeLabel}</Badge>
            </div>
            <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={resetLabels} disabled={!preset}>
              <RotateCcw size={12} aria-hidden="true" /> Reset to {typeLabel} defaults
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="What members are called" hint={preset ? `Default: ${preset.learner_label}` : undefined}>
              {(id) => <input id={id} type="text" value={form.learner_label} maxLength={LIMITS.learner_label}
                onChange={(e) => set('learner_label')(e.target.value)} className="input-neo py-2 px-3 text-sm w-full" />}
            </FormField>
            <FormField label="What a group is called" hint={preset ? `Default: ${preset.group_label}` : undefined}>
              {(id) => <input id={id} type="text" value={form.group_label} maxLength={LIMITS.group_label}
                onChange={(e) => set('group_label')(e.target.value)} className="input-neo py-2 px-3 text-sm w-full" />}
            </FormField>
            <FormField label="What instructors are called" hint={preset ? `Default: ${preset.instructor_label}` : undefined}>
              {(id) => <input id={id} type="text" value={form.instructor_label} maxLength={LIMITS.instructor_label}
                onChange={(e) => set('instructor_label')(e.target.value)} className="input-neo py-2 px-3 text-sm w-full" />}
            </FormField>
          </div>
        </Card>

        {/* ---- Actions ---- */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button type="submit" variant="primary" size="md" className="cursor-pointer" disabled={saving || hasErrors || !dirty}>
            {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
            {saving ? 'Saving...' : 'Save branding'}
          </Button>
          <Button type="button" variant="outline" size="md" className="cursor-pointer" onClick={load} disabled={saving || !dirty}>
            Discard changes
          </Button>
          <div role="status" aria-live="polite" className="text-xs min-h-[1rem]">
            {status?.kind === 'ok' && <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-300"><Check size={12} aria-hidden="true" /> {status.msg}</span>}
            {status?.kind === 'err' && <span className="inline-flex items-center gap-1 text-red-500"><AlertTriangle size={12} aria-hidden="true" /> {status.msg}</span>}
            {!status && hasErrors && <span className="text-amber-600 dark:text-amber-300">Fix the highlighted fields to save.</span>}
          </div>
        </div>
      </div>

      {/* ---- Preview column ---- */}
      <div className="lg:col-span-2 min-w-0 lg:sticky lg:top-4 self-start">
        <Preview form={form} preset={preset} orgName={orgName} userName={userName} />
        <p className="text-[11px] text-text-muted mt-2">
          Only these typed fields are stored; no custom HTML or CSS is accepted, so branding can never affect other members&rsquo; security.
        </p>
      </div>
    </form>
  );
}
