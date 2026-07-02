import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, GraduationCap, Building2, Check, ArrowRight, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAccessStatus } from '../api';

/**
 * Upgrade — shown when an individual learner's 7-day trial has lapsed (or when
 * they visit directly). Makes no gated API calls, so the global 402 redirect
 * can never loop through this page. Plans are enabled by the team (manual
 * super-admin assignment) until online payments launch.
 */

const PLANS = [
  {
    name: 'Beginner',
    price: '₹299',
    period: 'per month',
    icon: GraduationCap,
    features: ['Full lesson library & learning paths', 'Vaathiyaar chat tutor', 'Challenges, XP & leaderboard', 'Progress tracking & streaks'],
    mailto: 'mailto:muthu@pymasters.net?subject=PyMasters%20Beginner%20plan',
  },
  {
    name: 'Pro',
    price: '₹999',
    period: 'per month',
    icon: Sparkles,
    highlight: true,
    features: ['Everything in Beginner', 'Priority Vaathiyaar responses', 'Advanced analytics & Knowledge Map insights', 'Completion certificates', 'Early access to new tracks'],
    mailto: 'mailto:muthu@pymasters.net?subject=PyMasters%20Pro%20plan',
  },
  {
    name: 'Organizations',
    price: 'Custom',
    period: 'schools · universities · enterprise',
    icon: Building2,
    features: ['Everything in Pro, every seat', 'Admin console & cohort dashboards', 'Custom learning paths', 'SSO & priority support'],
    mailto: 'mailto:muthu@pymasters.net?subject=PyMasters%20for%20Organizations',
  },
];

export default function Upgrade() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [access, setAccess] = useState(null);

  useEffect(() => {
    document.title = 'Upgrade — PyMasters';
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    getAccessStatus(user.id)
      .then((r) => !cancelled && setAccess(r.data))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  const expired = access?.status === 'expired';
  const onTrial = access?.status === 'trial';
  const active = access?.status === 'active';

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border-default bg-bg-surface px-3 py-1 text-xs font-semibold text-text-secondary">
          <Clock className="h-3.5 w-3.5 text-accent-primary" aria-hidden="true" />
          {expired && 'Your 7-day free trial has ended'}
          {onTrial && `Free trial — ${access.trial_days_left} day${access.trial_days_left === 1 ? '' : 's'} left`}
          {active && 'Your access is active'}
          {!access && 'Plans'}
        </span>
        <h1 className="mt-4 font-display text-3xl font-bold text-text-primary">
          {expired ? 'Keep learning with Vaathiyaar' : 'Choose your plan'}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-text-secondary">
          {expired
            ? 'Your progress, XP and Knowledge Map are safe. Pick a plan and continue exactly where you left off.'
            : 'Upgrade anytime — your progress always carries over.'}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map(({ name, price, period, icon: Icon, features, mailto, highlight }) => (
          <div key={name}
            className={`panel flex flex-col rounded-2xl p-6 ${highlight ? 'border-accent-primary/60 shadow-glow' : ''}`}>
            <div className="mb-2 flex items-center gap-2">
              <Icon className="h-4.5 w-4.5 text-accent-primary" size={18} aria-hidden="true" />
              <span className="font-display font-semibold text-text-primary">{name}</span>
            </div>
            <div className="mb-4">
              <span className="font-display text-3xl font-bold text-text-primary">{price}</span>
              <span className="mt-0.5 block text-xs text-text-muted">{period}</span>
            </div>
            <ul className="mb-6 space-y-2">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-text-secondary">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-primary" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <a href={mailto}
              className={`btn-neo mt-auto w-full justify-center ${highlight ? 'btn-neo-primary' : ''}`}>
              Get {name === 'Organizations' ? 'in touch' : name} <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-text-muted">
        Online payments are launching soon — until then, email us and your plan is enabled within a day.
        Already arranged a plan? It activates automatically once assigned.{' '}
        <button type="button" onClick={() => navigate('/pricing')} className="text-accent-primary hover:underline">
          Full pricing details
        </button>
      </p>
    </div>
  );
}
