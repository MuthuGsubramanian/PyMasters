import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowRight, GraduationCap, Building2, Sparkles, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api, { getPaymentConfig, verifyGooglePlayPayment } from '../api';
import { isAndroidWebView, purchaseWithGooglePlay } from '../lib/playBilling';
import SupportModal from '../components/SupportModal';
import PymastersGlyph from '../assets/pymasters-glyph.svg';

// Same live figures as the landing page ("432" -> "430+"); the fallback never overstates them.
const FALLBACK_STATS = { lessons: 430, tracks: 24 };
const roundedDown = (n) => (n >= 20 ? `${Math.floor(n / 10) * 10}+` : String(n));

/**
 * Pricing — public marketing page (dark-always, matches the landing style).
 *
 * Tiers set by MSG 2026-07-02: Free = 7-day full-access trial,
 * Beginner = ₹299/mo, Pro = ₹999/mo, Organizations = custom quote.
 *
 * Platform-aware billing:
 * - Inside the Android WebView (`isAndroidWebView()`), Razorpay is NEVER
 *   referenced; Beginner & Pro trigger native Google Play Billing (or `/login`
 *   first for signed-out visitors) and copy reflects Google Play Subscriptions
 *   + 100% Ad-Free learning.
 * - On Web, probes `GET /api/payments/config` once on mount and routes into
 *   `/dashboard/upgrade` when online checkout is enabled.
 */

const TIERS = [
  {
    name: 'Free Trial',
    tag: '7 days',
    bestFor: '🌱 All Starters & Class 6–12 Explorers',
    price: '₹0',
    period: 'full access for 7 days · 100% Ad-Free',
    icon: GraduationCap,
    blurb: 'Try everything PyMasters offers — no card required, zero ads.',
    features: [
      'Full curriculum — {tracks} tracks, {lessons} lessons',
      'Vaathiyaar, your AI tutor (chat + voice)',
      'Live Knowledge Map of what you know',
      'Code Playground with real execution & templates',
      'Arcade games, weekly challenges, XP & streaks',
      'English, Tamil, Telugu, Malayalam & more',
    ],
    cta: { label: 'Start Free Trial', kind: 'primary' },
  },
  {
    name: 'Beginner',
    tag: 'Monthly',
    bestFor: '🎓 School (Class 6–12) & College Foundations',
    price: '₹299',
    period: 'per month · Free 3 mos with School/College ID',
    icon: GraduationCap,
    blurb: 'Keep learning after your trial, at student-friendly pricing.',
    features: [
      'Everything in the trial, ongoing & 100% Ad-Free',
      'School CS/AI syllabus & college foundation paths',
      'Vaathiyaar step-by-step chat tutor',
      'Challenges, arcade games, XP & leaderboard',
      'Progress tracking, spaced review & streaks',
    ],
    planKey: 'beginner',
    cta: { label: 'Get Beginner', kind: 'ghost', mailto: 'mailto:muthu@pymasters.net?subject=PyMasters%20Beginner%20plan' },
  },
  {
    name: 'Pro',
    tag: 'Power learners',
    bestFor: '🚀 Placement DSA & Working Professionals',
    price: '₹999',
    period: 'per month',
    icon: Sparkles,
    blurb: 'For placement prep, AI engineers, and working developers.',
    features: [
      'Everything in Beginner — 100% Ad-Free',
      'DSA interviews, Production AI/RAG, Async & Internals tracks',
      'Priority Vaathiyaar responses (chat + voice)',
      'Advanced progress analytics & Knowledge Map insights',
      'Early access to new tracks & AI-generated custom modules',
    ],
    planKey: 'pro',
    cta: { label: 'Get Pro', kind: 'ghost', mailto: 'mailto:muthu@pymasters.net?subject=PyMasters%20Pro%20plan' },
  },
  {
    name: 'Organizations',
    tag: 'Custom',
    bestFor: '🏫 Schools, Colleges, Training Centres & Teams',
    price: 'Custom',
    period: 'schools · universities · enterprise',
    icon: Building2,
    blurb: 'For schools, universities, training institutes and teams.',
    features: [
      'Everything in Pro, for every seat',
      'Admin console with roles & cohort dashboards',
      'Custom learning paths for your syllabus or batch',
      'Batch coding competitions & private leaderboards',
      'Custom branding, audit log & priority support',
      'Free one-batch / one-class pilot available',
    ],
    cta: { label: 'Talk to Sales', kind: 'ghost', mailto: 'mailto:muthu@pymasters.net?subject=PyMasters%20for%20Organizations' },
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const inAndroidApp = isAndroidWebView();
  const ctaTarget = user ? '/dashboard' : '/login';
  useEffect(() => { document.title = 'Pricing — PyMasters'; }, []);

  const [payEnabled, setPayEnabled] = useState(false);
  const [playConfig, setPlayConfig] = useState(null);
  const [busyPlan, setBusyPlan] = useState(null);
  const [billingError, setBillingError] = useState('');
  const [billingSuccess, setBillingSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    getPaymentConfig()
      .then((r) => {
        if (cancelled) return;
        setPayEnabled(!!r.data?.enabled);
        if (r.data?.google_play) {
          setPlayConfig(r.data.google_play);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const [stats, setStats] = useState(FALLBACK_STATS);
  useEffect(() => {
    let alive = true;
    api.get('/classroom/catalog-stats')
      .then(({ data }) => { if (alive && data?.lessons > 0 && data?.tracks > 0) setStats(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const fill = (f) => f.replace('{tracks}', String(stats.tracks)).replace('{lessons}', roundedDown(stats.lessons));
  const [studentOpen, setStudentOpen] = useState(false);

  async function handleAndroidTierAction(planKey) {
    if (!user?.id) {
      navigate('/login?mode=signup&next=%2Fdashboard%2Fupgrade');
      return;
    }
    setBillingError('');
    setBillingSuccess('');
    setBusyPlan(planKey);
    try {
      const receipt = await purchaseWithGooglePlay(planKey, {
        userId: user.id,
        products: playConfig?.products,
      });
      const { data } = await verifyGooglePlayPayment(receipt);
      if (data?.success) {
        updateUser?.({ plan: data.plan || planKey });
        setBillingSuccess('Subscription active via Google Play! Redirecting…');
        setTimeout(() => navigate('/dashboard'), 1200);
      } else {
        setBillingError('We could not confirm your Google Play subscription. Please contact support.');
      }
    } catch (e) {
      if (e?.canceled || e?.code === 'USER_CANCELED') {
        return;
      }
      setBillingError(
        e?.response?.data?.detail ||
          e?.message ||
          'Could not complete Google Play subscription. Please try again.'
      );
    } finally {
      setBusyPlan(null);
    }
  }

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
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-300">
          <ShieldCheck size={14} aria-hidden="true" />
          100% Ad-Free Learning · Synced Across Web & Android
        </div>
        <h1 className="text-white text-4xl sm:text-5xl font-bold font-display tracking-tight mb-4">
          Simple,{' '}
          <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #a855f7 0%, #06b6d4 60%, #c084fc 100%)' }}>
            honest pricing
          </span>
        </h1>
        <p className="text-slate-300/90 text-base sm:text-lg max-w-2xl mx-auto">
          Start with a full-access 7-day trial, then pick the plan that fits —
          from ₹299/month, always 100% ad-free.
        </p>

        {billingError && (
          <div role="alert" className="mx-auto mt-6 max-w-xl rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
            {billingError}
          </div>
        )}
        {billingSuccess && (
          <div role="status" className="mx-auto mt-6 max-w-xl rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-300">
            {billingSuccess}
          </div>
        )}
      </section>

      {/* Tiers */}
      <section className="px-4 sm:px-6 pb-10">
        <div className="max-w-7xl mx-auto grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {TIERS.map(({ name, tag, bestFor, price, period, icon: Icon, blurb, features, cta, note, planKey }) => {
            const busy = busyPlan === planKey;
            return (
              <div key={name} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:border-white/20 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center gap-2 text-white font-display font-semibold text-lg">
                    <Icon size={18} className="text-cyan-400" aria-hidden="true" /> {name}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-white/15 text-slate-300">
                    {tag}
                  </span>
                </div>
                {bestFor && (
                  <div className="mb-3 inline-flex w-fit items-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 text-xs font-semibold text-cyan-300">
                    {bestFor}
                  </div>
                )}
                <div className="mb-3">
                  <span className="text-3xl font-bold font-display text-white">{price}</span>
                  <span className="block text-xs text-slate-500 mt-0.5">{period}</span>
                </div>
                <p className="text-sm text-slate-400 mb-5">{blurb}</p>
                <ul className="space-y-2.5 mb-6">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                      <Check size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
                      {fill(f)}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto">
                  {note && <p className="text-xs text-slate-500 mb-3">{note}</p>}
                  {inAndroidApp && planKey ? (
                    <button
                      type="button"
                      disabled={!!busyPlan}
                      onClick={() => handleAndroidTierAction(planKey)}
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-slate-200 border border-white/15 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/25 transition-colors disabled:opacity-60"
                    >
                      {busy ? (
                        <><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Processing…</>
                      ) : (
                        <>Subscribe on Google Play <ArrowRight size={14} aria-hidden="true" /></>
                      )}
                    </button>
                  ) : payEnabled && planKey ? (
                    /* Checkout is live on Web: route into the Upgrade page
                       (visitors sign in first). */
                    <button
                      onClick={() => navigate(user ? '/dashboard/upgrade' : '/login?mode=signup&next=%2Fdashboard%2Fupgrade')}
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
            );
          })}
        </div>
        <div className="max-w-7xl mx-auto mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-4">
          <p className="flex items-start gap-2 text-sm text-slate-300">
            <GraduationCap size={18} className="mt-0.5 shrink-0 text-cyan-400" aria-hidden="true" />
            <span><span className="font-semibold text-white">Student?</span> PyMasters is free for 3 months with a valid student ID. We check it by hand and reply by email, usually within a day.</span>
          </p>
          <button onClick={() => setStudentOpen(true)}
            className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-slate-100 border border-white/20 hover:bg-white/[0.06] transition-colors">
            Request student access <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
        <p className="max-w-7xl mx-auto mt-6 text-center text-xs text-slate-400">
          {inAndroidApp
            ? 'Subscriptions in the Android app are billed securely via Google Play Subscriptions — manage or cancel anytime in Google Play Store → Payments & subscriptions. 100% Ad-Free learning.'
            : payEnabled
            ? 'Secure online payments powered by Razorpay — your plan activates instantly after checkout with 100% Ad-Free learning.'
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
            ['How does the 7-day trial work?', 'Sign up and you get full access to everything — curriculum, Vaathiyaar, playground, challenges — for 7 days, completely ad-free. No credit card required.'],
            ['How do I pay for Beginner or Pro?', inAndroidApp
              ? 'Subscribe directly inside the Android app with Google Play Subscriptions — your plan activates immediately and syncs across Android and Web.'
              : payEnabled
              ? 'Pay online with Razorpay — UPI, cards and netbanking. Your plan activates instantly after payment.'
              : 'Online payments are launching soon. Until then, email us and we enable your plan manually — usually within a day.'],
            ['Can I switch or cancel anytime?', inAndroidApp
              ? 'Yes. Android subscriptions are managed through Google Play Store → Payments & subscriptions, where you can switch between Beginner and Pro or cancel anytime.'
              : 'Yes. Plans are monthly; you can move between Beginner and Pro or stop at the end of any month.'],
            ['Are there any ads on PyMasters?', 'Never. Every PyMasters tier — including the 7-day free trial — is 100% Ad-Free so students and developers can focus completely on mastering Python and AI.'],
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
          © {new Date().getFullYear()} PyMasters · 100% Ad-Free Learning ·{' '}
          <button onClick={() => navigate('/terms')} className="hover:text-cyan-400 transition-colors">Terms</button> ·{' '}
          <button onClick={() => navigate('/privacy')} className="hover:text-cyan-400 transition-colors">Privacy</button> ·{' '}
          <a href="https://t.me/boost/PyMasterscommunity" target="_blank" rel="noopener noreferrer" className="hover:text-sky-300 transition-colors">Telegram Support</a> ·{' '}
          <a href="mailto:legal@pymasters.net" className="hover:text-cyan-400 transition-colors">Contact</a>
        </p>
      </footer>
      <SupportModal open={studentOpen} onClose={() => setStudentOpen(false)} initialTab="access" user={user} />
    </div>
  );
}
