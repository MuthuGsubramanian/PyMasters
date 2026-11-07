import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import useOrgBranding from './useOrgBranding';

/**
 * Who the app is talking to (redesign 2026-11-03): one shell, three presentations.
 *
 *   individual   — no active org: the personal, "classy" learner app
 *   education    — school / university: the school's identity, Class/Course words, levels instead of ranks
 *   professional — enterprise / training centre / other: the company's identity, no game ranks or quotes
 *
 * Also exposes `persona` ('school' | 'college' | 'professional' | 'general') derived from
 * the learner's `user_type` so individual screens (Dashboard, Classroom, Paths, Playground)
 * can tailor guidance from Class 6–12 school students through experienced professionals.
 */
const EDUCATION_TYPES = new Set(['school', 'university']);

export const PERSONA_META = {
  school: {
    id: 'school',
    userType: 'high_school_student',
    label: 'School Student (Class 6–12)',
    shortLabel: 'School (6–12)',
    badge: '🌱 School Mode',
    tagline: 'Visual Python, school CS & AI syllabus (CBSE / ICSE / State Board), logic & fun games.',
  },
  college: {
    id: 'college',
    userType: 'college_student',
    label: 'College & Placement Prep',
    shortLabel: 'College & DSA',
    badge: '🎓 College Mode',
    tagline: 'DSA & coding interviews, full-stack web apps, data science & AI capstone projects.',
  },
  professional: {
    id: 'professional',
    userType: 'senior_developer',
    label: 'Working Professional & AI Eng',
    shortLabel: 'Pro & AI Eng',
    badge: '🚀 Pro Mode',
    tagline: 'Production Python, LLM agents & RAG, async concurrency, testing, DevOps & cloud AI.',
  },
  general: {
    id: 'general',
    userType: '',
    label: 'All-Rounder Learner',
    shortLabel: 'All Levels',
    badge: '✨ Adaptive Mode',
    tagline: 'Explore 500+ interactive lessons across Python fundamentals, data science, AI & engineering.',
  },
};

export function personaForUserType(userType, orgMode) {
  const ut = String(userType || '').toLowerCase().trim();
  if (ut === 'high_school_student') return 'school';
  if (ut === 'college_student') return 'college';
  if (ut === 'junior_developer' || ut === 'senior_developer' || ut === 'career_switcher') return 'professional';
  if (orgMode === 'professional') return 'professional';
  if (orgMode === 'education') return 'college';
  return 'general';
}

export function audienceFor(activeOrg, preset, type) {
  if (!activeOrg) return 'individual';
  if (preset?.kind) return preset.kind === 'educational' ? 'education' : 'professional';
  const t = String(type || activeOrg.type || activeOrg.org_type || '').toLowerCase();
  return EDUCATION_TYPES.has(t) ? 'education' : 'professional';
}

export default function useAudience() {
  const { user, activeOrg } = useAuth();
  const profileCtx = useProfile();
  const profile = profileCtx?.profile;
  const { branding, preset, type } = useOrgBranding();
  const mode = audienceFor(activeOrg, preset, type);
  const rawUserType = profile?.user_type || profile?.preferences?.user_type || user?.user_type || '';
  const persona = personaForUserType(rawUserType, mode);
  const personaInfo = PERSONA_META[persona] || PERSONA_META.general;
  const orgName = activeOrg
    ? String(branding?.portal_name?.trim() || activeOrg.org_name || activeOrg.name || '').trim() || null
    : null;
  const welcome = branding?.welcome_message?.trim() || branding?.tagline?.trim() || '';
  return {
    mode,
    persona,
    userType: rawUserType,
    personaInfo,
    orgName,
    welcome,
    labels: {
      learner: branding?.learner_label || preset?.learner_label || 'Learners',
      group: branding?.group_label || preset?.group_label || 'Group',
      instructor: branding?.instructor_label || preset?.instructor_label || 'Mentor',
    },
  };
}
