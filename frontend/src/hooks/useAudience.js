import { useAuth } from '../context/AuthContext';
import useOrgBranding from './useOrgBranding';

/**
 * Who the app is talking to (redesign 2026-11-03): one shell, three presentations.
 *
 *   individual   — no active org: the personal, "classy" learner app
 *   education    — school / university: the school's identity, Class/Course words, levels instead of ranks
 *   professional — enterprise / training centre / other: the company's identity, no game ranks or quotes
 *
 * Mode comes from the backend preset `kind` (educational | professional) when branding has loaded, else
 * from the org type, so first paint is already right. Presentation only: data and permissions are unchanged.
 */
const EDUCATION_TYPES = new Set(['school', 'university']);

export function audienceFor(activeOrg, preset, type) {
  if (!activeOrg) return 'individual';
  if (preset?.kind) return preset.kind === 'educational' ? 'education' : 'professional';
  const t = String(type || activeOrg.type || activeOrg.org_type || '').toLowerCase();
  return EDUCATION_TYPES.has(t) ? 'education' : 'professional';
}

export default function useAudience() {
  const { activeOrg } = useAuth();
  const { branding, preset, type } = useOrgBranding();
  const mode = audienceFor(activeOrg, preset, type);
  const orgName = activeOrg
    ? String(branding?.portal_name?.trim() || activeOrg.org_name || activeOrg.name || '').trim() || null
    : null;
  const welcome = branding?.welcome_message?.trim() || branding?.tagline?.trim() || '';
  return {
    mode,
    orgName,
    welcome,
    labels: {
      learner: branding?.learner_label || preset?.learner_label || 'Learners',
      group: branding?.group_label || preset?.group_label || 'Group',
      instructor: branding?.instructor_label || preset?.instructor_label || 'Mentor',
    },
  };
}
