import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Award,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Printer,
  ShieldAlert,
  ShieldCheck,
  BookOpen,
} from 'lucide-react';
import api from '../api';
import DarkModeToggle from '../components/DarkModeToggle';
import PymastersGlyph from '../assets/pymasters-glyph.svg';
import OpenEdgBadge from '../assets/openedg-education-partner.png';
import { usePageMeta } from '../utils/usePageMeta';

function formatIssuedDate(value) {
  if (!value) return 'Verified';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function VerifyCredential() {
  const { credId } = useParams();
  const [cred, setCred] = useState(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    document.title = 'Verify Credential — PyMasters';
  }, []);

  usePageMeta({
    title: cred?.valid && cred?.title
      ? `${cred.title} — Verified Credential — PyMasters`
      : 'Verify Credential — PyMasters',
    description: cred?.valid
      ? `Verified PyMasters Completion Credential earned by ${cred.recipient_name} for ${cred.title}.`
      : 'Public registry verification for PyMasters Learning Path Completion Credentials.',
    canonicalPath: credId ? `/verify/${credId}` : '/verify',
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setInvalid(false);
    setCred(null);

    if (!credId) {
      setInvalid(true);
      setLoading(false);
      return undefined;
    }

    api.get(`/credentials/verify/${encodeURIComponent(credId)}`)
      .then((res) => {
        if (cancelled) return;
        const data = res.data;
        if (!data || data.valid === false) {
          setInvalid(true);
        } else {
          setCred(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInvalid(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [credId]);

  const linkedInHref = cred
    ? `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
        cred.title || 'PyMasters Completion Credential'
      )}&organizationId=113061910&certUrl=${encodeURIComponent(
        typeof window !== 'undefined' ? window.location.href : `https://pymasters.net/verify/${cred.cred_id}`
      )}&certId=${encodeURIComponent(cred.cred_id || credId || '')}`
    : '#';

  return (
    <div className="min-h-screen bg-bg-base text-text-secondary flex flex-col">
      {/* Top Bar (hidden when printing) */}
      <header className="print:hidden border-b border-border-default bg-bg-surface/90 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2.5 min-h-11">
            <div className="w-8 h-8 rounded-xl bg-gradient-primary flex items-center justify-center shadow-sm">
              <img src={PymastersGlyph} alt="" aria-hidden="true" className="w-4 h-4" />
            </div>
            <span className="font-display font-bold text-base text-text-primary tracking-tight">
              PyMasters Registry
            </span>
          </Link>
          <div className="flex items-center gap-2.5">
            <DarkModeToggle />
            <Link
              to="/login?mode=signup"
              className="inline-flex items-center gap-1.5 min-h-11 px-4 py-2 rounded-xl bg-gradient-primary text-white text-xs sm:text-sm font-bold"
            >
              <span>Start Learning →</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {loading && (
          <div
            role="status"
            className="rounded-2xl border border-border-default bg-bg-surface p-8 text-center text-sm text-text-muted"
          >
            Verifying credential record in the PyMasters registry…
          </div>
        )}

        {!loading && invalid && (
          <section
            aria-label="Credential Verification Status"
            className="rounded-2xl border border-border-default bg-bg-surface p-8 sm:p-10 space-y-5 shadow-elegant"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/12 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-bold uppercase tracking-wider">
              <ShieldAlert size={14} />
              <span>Unverified Credential ID</span>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary">
              This credential ID could not be verified
            </h1>

            <p className="text-sm sm:text-base text-text-secondary leading-relaxed">
              The identifier{' '}
              <code className="px-2 py-0.5 rounded bg-bg-elevated border border-border-default font-mono text-xs text-text-primary">
                {credId || 'unknown'}
              </code>{' '}
              does not match an active completion credential in the official PyMasters registry. Please double-check the URL for typos or ask the holder for an updated verification link.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                to="/"
                className="inline-flex items-center gap-2 min-h-11 px-5 py-2.5 rounded-xl bg-gradient-primary text-white text-sm font-bold"
              >
                <span>Explore pymasters.net →</span>
              </Link>
              <Link
                to="/guides"
                className="inline-flex items-center gap-2 min-h-11 px-4 py-2.5 rounded-xl border border-border-default bg-bg-elevated text-text-primary text-sm font-semibold hover:border-border-strong transition-colors"
              >
                <BookOpen size={15} />
                <span>Browse Python Guides</span>
              </Link>
            </div>
          </section>
        )}

        {!loading && cred && !invalid && (
          <section
            aria-label="PyMasters Verifiable Completion Credential"
            className="space-y-6"
          >
            {/* Executive Credential Card */}
            <div className="relative rounded-3xl border-2 border-border-strong bg-bg-surface p-7 sm:p-10 shadow-elegant overflow-hidden">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-accent-subtle blur-3xl"
              />

              {/* Header */}
              <div className="relative flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-border-default">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-md">
                    <img src={PymastersGlyph} alt="" aria-hidden="true" className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-display font-bold text-lg text-text-primary tracking-tight">
                      PyMasters Verifiable Completion Credential
                    </div>
                    <div className="text-xs text-text-muted">
                      Issued by {cred.issuer || 'PyMasters'} · Public Registry Record
                    </div>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/12 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold uppercase tracking-wider">
                  <ShieldCheck size={14} />
                  <span>Verified Authentic</span>
                </span>
              </div>

              {/* Recipient & Path Details */}
              <div className="relative py-8 space-y-6">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-text-muted">
                    Awarded To
                  </div>
                  <h1 className="font-display text-3xl sm:text-4xl font-bold text-text-primary mt-1">
                    {cred.recipient_name || 'PyMasters Learner'}
                  </h1>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-text-muted">
                    For Mastering the Learning Path
                  </div>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-accent-primary mt-1 flex items-center gap-2">
                    <Award size={22} className="shrink-0" />
                    <span>{cred.title}</span>
                  </h2>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
                    <dt className="text-xs font-semibold text-text-muted flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-emerald-500" />
                      <span>Lessons Mastered</span>
                    </dt>
                    <dd className="font-display text-lg font-bold text-text-primary mt-1 tabular-nums">
                      {cred.lessons_completed ?? 'All'} completed
                    </dd>
                  </div>

                  <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
                    <dt className="text-xs font-semibold text-text-muted flex items-center gap-1.5">
                      <Calendar size={13} className="text-accent-primary" />
                      <span>Issued Date</span>
                    </dt>
                    <dd className="font-display text-base font-bold text-text-primary mt-1">
                      {formatIssuedDate(cred.issued_at)}
                    </dd>
                  </div>

                  <div className="rounded-xl border border-border-default bg-bg-elevated p-4">
                    <dt className="text-xs font-semibold text-text-muted">Credential ID</dt>
                    <dd className="font-mono text-xs sm:text-sm font-bold text-text-primary mt-1.5 break-all">
                      {cred.cred_id || credId}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* OpenEDG Partner Footer */}
              <div className="relative pt-6 border-t border-border-default flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src={OpenEdgBadge}
                    alt="OpenEDG Python Institute Education Partner"
                    className="h-8 w-auto rounded bg-white px-2 py-0.5 object-contain shrink-0"
                  />
                  <p className="text-xs text-text-muted leading-relaxed max-w-md">
                    {cred.partner_note ||
                      'PyMasters is an Official OpenEDG Python Institute Education Partner. Every lesson in this path was verified through live Python code evaluation.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons (hidden when printing) */}
            <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={linkedInHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 min-h-11 px-5 py-2.5 rounded-xl bg-gradient-primary text-white text-sm font-bold shadow-sm hover:opacity-95 transition-opacity"
                >
                  <ExternalLink size={16} />
                  <span>Add to LinkedIn Profile</span>
                </a>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 min-h-11 px-4 py-2.5 rounded-xl border border-border-default bg-bg-surface hover:bg-bg-elevated text-text-primary text-sm font-semibold transition-colors"
                >
                  <Printer size={16} />
                  <span>Print / Save PDF</span>
                </button>
              </div>

              <Link
                to="/"
                className="text-xs font-semibold text-accent-primary hover:underline min-h-11 inline-flex items-center"
              >
                Verify at pymasters.net →
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
