import { useNavigate } from 'react-router-dom';
import { Check, ArrowRight, GraduationCap, Building2, Sparkles, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PymastersGlyph from '../assets/pymasters-glyph.svg';

/**
 * Pricing — public marketing page (dark-always, matches the landing style).
 *
 * Deliberately contains NO invented price points: individual learning is free
 * today, Pro pricing is being finalized, and organizations are custom-quoted.
 * Packages can also be granted manually by the PyMasters team for a fixed
 * period (super-admin plan assignment) — reflected in the note below the grid.
 */

const TIERS = [
  {
    name: 'Learner',
    tag: 'Free',
    icon: GraduationCap,
    blurb: 'Everything you need to go from first line to job-ready.',
    features: [
      'Full curriculum — 15 tracks, 380+ lessons',
      'Vaathiyaar, your AI tutor (chat + voice)',
      'Live Knowledge Map of what you know',
      'Code Playground with real execution',
      'Weekly challenges, XP, streaks & leaderboard',
      'English + Tamil',
    ],
    cta: { label: 'Start Free', kind: 'primary' },
  },
  {
    name: 'Pro',
    tag: 'Coming soon',
    icon: Sparkles,
    blurb: 'For learners who want to go deeper, faster.',
    features: [
      'Everything in Learner',
      'Priority Vaathiyaar responses',
      'Advanced progress analytics',
      'Completion certificates',
      'Early access to new tracks',
    ],
    cta: { label: 'Get notified', kind: 'ghost', mailto: 'mailto:muthu@pymasters.net?subject=PyMasters%20Pro%20waitlist' },
    note: 'Pricing is being finalized — join the waitlist and we’ll tell you first.',
  },
  {
    name: 'Organizations',
    tag: 'Custom',
    icon: Building2,
    blurb: 'For schools, universities and enterprises.',
    features: [
      'Everything in Pro, for every seat',
      'Admin console with roles & cohort dashboards',
      'Custom learning paths for your program',
      'Org challenges & private leaderboards',
      'SSO & priority support',
      'Pilot programs available',
    ],
    cta: { label: 'Talk to Sales', kind: 'ghost', mailto: 'mailto:muthu@pymasters.net?subject=PyMasters%20for%20Organizations' },
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const ctaTarget = user ? '/dashboard' : '/login';

  return (
    <div className="min-h-screen bg-[#0a0a14] text-slate-100 font-sans selection:bg-purple-500/30 selection:text-white">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-[#0a0a14]/85 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 group" aria-label="PyMasters home">
            <img src={PymastersGlyph} alt="" className="w-8 h-8" style={{ filter: 'drop-shadow(0 0 6px rgba(124,58,237,0.6))' }} />
            <span className="font-display font-bold text-base sm:text-lg tracking-tight text-white">PYMASTERS</span>
          </button>
          <div className="flex items-center gap-4 sm:gap-6">
            <button onClick={() => navigate('/')} className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors">
              <ArrowLeft size={14} aria-hidden="true" /> Home
            </button>
            <button
              onClick={() => navigate(ctaTarget)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-cyan-500 hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-lg shadow-purple-900/40"
            >
              {user ? 'Continue' : 'Get Started'}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="pt-32 pb-12 px-4 sm:px-6 text-center">
        <h1 className="text-white text-4xl sm:text-5xl font-bold font-display tracking-tight mb-4">
          Simple,{' '}
          <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #a855f7 0%, #06b6d4 60%, #c084fc 100%)' }}>
            honest pricing
          </span>
        </h1>
        <p className="text-slate-300/90 text-base sm:text-lg max-w-2xl mx-auto">
          Learning Python with your own AI teacher is free. Bigger plans for power
          learners and organizations are on the way.
        </p>
      </section>

      {/* Tiers */}
      <section className="px-4 sm:px-6 pb-10">
        <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-3">
          {TIERS.map(({ name, tag, icon: Icon, blurb, features, cta, note }) => (
            <div key={name} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-2 text-white font-display font-semibold text-lg">
                  <Icon size={18} className="text-cyan-400" aria-hidden="true" /> {name}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-white/15 text-slate-300">
                  {tag}
                </span>
              </div>
              <p className="text-sm text-slate-400 mb-5">{blurb}</p>
              <ul className="space-y-2.5 mb-6">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                    <Check size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                {note && <p className="text-xs text-slate-500 mb-3">{note}</p>}
                {cta.mailto ? (
                  <a
                    href={cta.mailto}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-slate-200 border border-white/15 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/25 transition-colors"
                  >
                    {cta.label} <ArrowRight size={14} aria-hidden="true" />
                  </a>
                ) : (
                  <button
                    onClick={() => navigate(ctaTarget)}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-cyan-500 hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-lg shadow-purple-900/40"
                  >
                    {cta.label} <ArrowRight size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="max-w-6xl mx-auto mt-6 text-center text-xs text-slate-500">
          Partner schools and pilot cohorts: packages can be enabled on your account by the
          PyMasters team for an agreed period — <a href="mailto:muthu@pymasters.net?subject=PyMasters%20Partner%20Package" className="text-cyan-400 hover:text-cyan-300 transition-colors">get in touch</a>.
        </p>
      </section>

      {/* FAQ */}
      <section className="px-4 sm:px-6 pb-20">
        <div className="max-w-3xl mx-auto space-y-4">
          <h2 className="text-white font-display font-bold text-xl text-center mb-6">Common questions</h2>
          {[
            ['Is the free tier really free?', 'Yes — the full curriculum, Vaathiyaar, the playground and challenges are free for individual learners today. No credit card.'],
            ['What happens when Pro launches?', 'Nothing changes for free learners. Pro adds extras on top; we’ll announce pricing before anything ships.'],
            ['How does organization pricing work?', 'It depends on seats and the program you run. Talk to us — pilots for schools and universities are available.'],
          ].map(([q, a]) => (
            <div key={q} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-sm font-semibold text-white mb-1.5">{q}</h3>
              <p className="text-sm text-slate-400">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/10 bg-[#0a0a14]/80 py-8 px-4 sm:px-6 text-center text-xs text-slate-500">
        <p>
          © {new Date().getFullYear()} PyMasters ·{' '}
          <button onClick={() => navigate('/terms')} className="hover:text-cyan-400 transition-colors">Terms</button> ·{' '}
          <button onClick={() => navigate('/privacy')} className="hover:text-cyan-400 transition-colors">Privacy</button> ·{' '}
          <a href="mailto:legal@pymasters.net" className="hover:text-cyan-400 transition-colors">Contact</a>
        </p>
      </footer>
    </div>
  );
}
