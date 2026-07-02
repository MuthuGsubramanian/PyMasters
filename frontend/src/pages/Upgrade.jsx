import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, GraduationCap, Building2, Check, ArrowRight, Clock, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAccessStatus, getPaymentConfig, createPaymentOrder, verifyPayment } from '../api';
import { loadRazorpay } from '../lib/razorpay';

/**
 * Upgrade — shown when an individual learner's 7-day trial has lapsed (or when
 * they visit directly). Makes no gated API calls, so the global 402 redirect
 * can never loop through this page.
 *
 * When Razorpay is configured (backend GET /api/payments/config → enabled),
 * the Beginner/Pro cards show real "Pay" buttons that open Razorpay Standard
 * Checkout. Otherwise they fall back to the "email us" flow. Organizations is
 * always a contact link (custom pricing).
 */

const PLANS = [
  {
    name: 'Beginner',
    planKey: 'beginner',
    price: '₹299',
    period: 'per month',
    icon: GraduationCap,
    features: ['Full lesson library & learning paths', 'Vaathiyaar chat tutor', 'Challenges, XP & leaderboard', 'Progress tracking & streaks'],
    mailto: 'mailto:muthu@pymasters.net?subject=PyMasters%20Beginner%20plan',
  },
  {
    name: 'Pro',
    planKey: 'pro',
    price: '₹999',
    period: 'per month',
    icon: Sparkles,
    highlight: true,
    features: ['Everything in Beginner', 'Priority Vaathiyaar responses', 'Advanced analytics & Knowledge Map insights', 'Completion certificates', 'Early access to new tracks'],
    mailto: 'mailto:muthu@pymasters.net?subject=PyMasters%20Pro%20plan',
  },
  {
    name: 'Organizations',
    planKey: null,
    price: 'Custom',
    period: 'schools · universities · enterprise',
    icon: Building2,
    features: ['Everything in Pro, every seat', 'Admin console & cohort dashboards', 'Custom learning paths', 'SSO & priority support'],
    mailto: 'mailto:muthu@pymasters.net?subject=PyMasters%20for%20Organizations',
  },
];

export default function Upgrade() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [access, setAccess] = useState(null);
  const [payEnabled, setPayEnabled] = useState(false);
  const [busyPlan, setBusyPlan] = useState(null); // plan key currently checking out
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    document.title = 'Upgrade — PyMasters';
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    getAccessStatus(user.id)
      .then((r) => !cancelled && setAccess(r.data))
      .catch(() => {});
    getPaymentConfig()
      .then((r) => !cancelled && setPayEnabled(!!r.data?.enabled))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  async function handlePay(planKey) {
    setError('');
    setSuccess('');
    setBusyPlan(planKey);
    try {
      await loadRazorpay();
      const { data: order } = await createPaymentOrder(planKey);

      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: 'PyMasters',
        description: `${planKey === 'pro' ? 'Pro' : 'Beginner'} plan — 1 month`,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
        },
        theme: { color: '#6366f1' },
        handler: async (resp) => {
          try {
            const { data } = await verifyPayment({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            if (data?.success) {
              updateUser({ plan: data.plan });
              setSuccess('Payment successful — your plan is active. Redirecting…');
              setTimeout(() => navigate('/dashboard'), 1200);
            } else {
              setError('We could not confirm your payment. If you were charged, contact support.');
            }
          } catch {
            setError('We could not verify your payment. If you were charged, contact muthu@pymasters.net.');
          } finally {
            setBusyPlan(null);
          }
        },
        modal: {
          ondismiss: () => {
            // User closed the modal without paying — not an error.
            setBusyPlan(null);
          },
        },
      });

      rzp.on('payment.failed', (resp) => {
        setError(resp?.error?.description || 'Payment failed. Please try again.');
        setBusyPlan(null);
      });

      rzp.open();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not start checkout. Please try again.');
      setBusyPlan(null);
    }
  }

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

      {error && (
        <div role="alert" className="mx-auto max-w-xl rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="mx-auto max-w-xl rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-400">
          {success}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map(({ name, planKey, price, period, icon: Icon, features, mailto, highlight }) => {
          const payable = payEnabled && !!planKey;
          const busy = busyPlan === planKey;
          return (
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
              {payable ? (
                <button type="button" disabled={!!busyPlan} onClick={() => handlePay(planKey)}
                  className={`btn-neo mt-auto w-full justify-center ${highlight ? 'btn-neo-primary' : ''} ${busyPlan ? 'opacity-70' : ''}`}>
                  {busy ? (
                    <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> Processing…</>
                  ) : (
                    <>Pay {price} <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" /></>
                  )}
                </button>
              ) : (
                <a href={mailto}
                  className={`btn-neo mt-auto w-full justify-center ${highlight ? 'btn-neo-primary' : ''}`}>
                  Get {name === 'Organizations' ? 'in touch' : name} <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-text-muted">
        {payEnabled
          ? 'Secure payments powered by Razorpay. Your plan activates instantly after payment.'
          : 'Online payments are launching soon — until then, email us and your plan is enabled within a day. Already arranged a plan? It activates automatically once assigned.'}{' '}
        <button type="button" onClick={() => navigate('/pricing')} className="text-accent-primary hover:underline">
          Full pricing details
        </button>
      </p>
    </div>
  );
}
