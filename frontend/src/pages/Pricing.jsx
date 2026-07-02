import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowRight, GraduationCap, Building2, Sparkles, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getPaymentConfig } from '../api';
import PymastersGlyph from '../assets/pymasters-glyph.svg';

/**
 * Pricing — public marketing page (dark-always, matches the landing style).
 *
 * Tiers set by MSG 2026-07-02: Free = 7-day full-access trial,
 * Beginner = ₹299/mo, Pro = ₹999/mo, Organizations = custom quote.
 *
 * Payment-aware (2026-07-02): the page probes the public
 * GET /api/payments/config once on mount. While Razorpay is NOT configured
 * (today's live state, or if the probe fails) everything renders exactly as
 * before — paid CTAs go to email and the note explains that the team enables
 * packages manually. The moment payments are enabled server-side, the
 * Beginner/Pro CTAs route into the real checkout (/dashboard/upgrade, via
 * /login for visitors) and the "launching soon" copy switches to match, so
 * this marketing page can never contradict the Upgrade page.
 */

const TIERS = [
  {
    name: 'Free Trial',
    tag: '7 days',
    price: '₹0',
    period: 'full access for 7 days',
    icon: GraduationCap,
    blurb: 'Try everything PyMasters offers — no card required.',
    features: [
      'Full curriculum — 15 tracks, 380+ lessons',
      'Vaathiyaar, your AI tutor (chat + voice)',
      'Live Knowledge Map of what you know',
      'Code Playground with real execution',
      'Weekly challenges, XP, streaks & leaderboard',
      'English + Tamil',
    ],
    cta: { label: 'Start Free Trial', kind: 'primary' },
  },
  {
    name: 'Beginner',
    tag: 'Most popular',
    price: '₹299',
    period: 'per month',
    icon: GraduationCap,
    blurb: 'Keep learning after your trial, at student-friendly pricing.',
    features: [
      'Everything in the trial, ongoing',
      'Full lesson library & learning paths',
      'Vaathiyaar chat tutor',
      'Challenges, XP & community leaderboard',
      'Progress tracking & streaks',
    ],
    planKey: 'beginner',
    cta: { label: 'Get Beginner', kind: 'ghost', mailto: 'mailto:muthu@pymasters.net?subject=PyMasters%20Beginner%20plan' },
  },
  {
    name: 'Pro',
    tag: 'Power learners',
    price: '₹999',
    period: 'per month',
    icon: Sparkles,
    blurb: 'For learners who want to go deeper, faster.',
    features: [
      'Everything in Beginner',
      'Priority Vaathiyaar responses (chat + voice)',
      'Advanced progress analytics & Knowledge Map insights',
      'Completion certificates',
      'Early access to new tracks',
    ],
    planKey: 'pro',
    cta: { label: 'Get Pro', kind: 'ghost', mailto: 'mailto:muthu@pymasters.net?subject=PyMasters%20Pro%20plan' },
  },
  {
    name: 'Organizations',
    tag: 'Custom',
    price: 'Custom',
    period: 'schools · universities · enterprise',
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

  // Whether online checkout is live (server-side Razorpay config). Defaults to
  // false and stays false on any error, so the page renders exactly its
  // pre-existing "email us" state unless the backend positively says enabled.
  const [payEnabled, setPayEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getPaymentConfig()
      .then((r) => { if (!cancelled) setPayEnabled(!!r.data?.enabled); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
          Start with a full-access 7-day trial, then pick the plan that fits —
          from ₹299/month.
        </p>
      </section>

      {/* Tiers */}
      <section className="px-4 sm:px-6 pb-10">
        <div className="max-w-7xl mx-auto grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {TIERS.map(({ name, tag, price, period, icon: Icon, blurb, features, cta, note, planKey }) => (
            <div key={name} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:border-white/20 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-2 text-white font-display font-semibold text-lg">
                  <Icon size={18} className="text-cyan-400" aria-hidden="true" /> {name}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-white/15 text-slate-300">
                  {tag}
                </span>
              </div>
              <div className="mb-3">
                <span className="text-3xl font-bold font-display text-white">{price}</span>
                <span className="block text-xs text-slate-500 mt-0.5">{period}</span>
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
                {payEnabled && planKey ? (
                  /* Checkout is live: route into the real Razorpay flow on the
                     Upgrade page (visitors sign in first). Same ghost styling
                     and label as the mailto CTA it replaces. */
                  <button
                    onClick={() => navigate(user ? '/dashboard/upgrade' : '/login')}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-slate-200 border border-white/15 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/25 transition-colors"
                  >
                    {cta.label} <ArrowRight size={14} aria-hidden="true" />
                  </button>
                ) : cta.mailto ? (
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
        <p className="max-w-7xl mx-auto mt-6 text-center text-xs text-slate-500">
          {payEnabled
            ? 'Secure online payments powered by Razorpay — your plan activates instantly after checkout.'
            : 'Online payments are launching soon — until then, plans are enabled on your account by the PyMasters team within a day of your request.'}{' '}
          Partner schools and pilot cohorts:{' '}
          <a href="mailto:muthu@pymasters.net?subject=PyMasters%20Partner%20Package" className="text-cyan-400 hover:text-cyan-300 transition-colors">get in touch</a>.
        </p>
      </section>

      {/* FAQ */}
      <section className="px-4 sm:px-6 pb-20">
        <div className="max-w-3xl mx-auto space-y-4">
          <h2 className="text-white font-display font-bold text-xl text-center mb-6">Common questions</h2>
          {[
            ['How does the 7-day trial work?', 'Sign up and you get full access to everything — curriculum, Vaathiyaar, playground, challenges — for 7 days. No credit card required.'],
            ['How do I pay for Beginner or Pro?', payEnabled
              ? 'Pay online with Razorpay — UPI, cards and netbanking. Your plan activates instantly after payment.'
              : 'Online payments are launching soon. Until then, email us and we enable your plan manually — usually within a day.'],
            ['Can I switch or cancel anytime?', 'Yes. Plans are monthly; you can move between Beginner and Pro or stop at the end of any month.'],
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
