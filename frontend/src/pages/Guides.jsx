import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  Copy,
  HelpCircle,
  Layers,
  Play,
  Search,
  Sparkles,
  Tag,
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import DarkModeToggle from '../components/DarkModeToggle';
import PymastersGlyph from '../assets/pymasters-glyph.svg';
import { usePageMeta } from '../utils/usePageMeta';

function ConversionBar({ user, position = 'top' }) {
  const ctaHref = user ? '/dashboard/playground' : '/login?mode=signup';
  const isTop = position === 'top';

  if (isTop) {
    return (
      <header className="sticky top-0 z-30 border-b border-border-default bg-bg-surface/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-5 min-w-0">
            <Link to="/" className="inline-flex items-center gap-2.5 min-h-11 shrink-0 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-primary flex items-center justify-center shadow-sm">
                <img src={PymastersGlyph} alt="" aria-hidden="true" className="w-4 h-4" />
              </div>
              <span className="font-display font-bold text-base text-text-primary tracking-tight">
                PyMasters
              </span>
            </Link>
            <nav aria-label="Public resources" className="hidden md:flex items-center gap-4 text-sm font-medium">
              <Link
                to="/guides"
                className="text-accent-primary font-semibold transition-colors min-h-11 inline-flex items-center"
              >
                Python Guides
              </Link>
              <Link
                to="/explains"
                className="text-text-secondary hover:text-text-primary transition-colors min-h-11 inline-flex items-center"
              >
                Visual Essays
              </Link>
              <Link
                to="/pricing"
                className="text-text-secondary hover:text-text-primary transition-colors min-h-11 inline-flex items-center"
              >
                Pricing
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <DarkModeToggle />
            <Link
              to={ctaHref}
              className="inline-flex items-center gap-1.5 min-h-11 px-4 py-2 rounded-xl bg-gradient-primary text-white text-xs sm:text-sm font-bold shadow-sm hover:opacity-95 transition-opacity"
            >
              <span>Start Practicing Free →</span>
            </Link>
          </div>
        </div>
      </header>
    );
  }

  return (
    <section
      aria-label="Practice on PyMasters"
      className="mt-12 rounded-2xl border border-border-default bg-bg-surface p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 shadow-elegant"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center shrink-0 shadow-sm">
          <img src={PymastersGlyph} alt="" aria-hidden="true" className="w-6 h-6" />
        </div>
        <div>
          <h2 className="font-display text-lg sm:text-xl font-bold text-text-primary">
            Turn reading into real Python muscle memory
          </h2>
          <p className="text-sm text-text-secondary mt-1 max-w-xl">
            Run every snippet in the live Python Playground, step through stack frames, and practice with Vaathiyaar feedback.
          </p>
        </div>
      </div>
      <Link
        to={ctaHref}
        className="inline-flex items-center justify-center gap-2 min-h-11 px-5 py-2.5 rounded-xl bg-gradient-primary text-white text-sm font-bold shrink-0 hover:opacity-95 transition-opacity"
      >
        <span>Start Practicing Free →</span>
      </Link>
    </section>
  );
}

function CodeBlock({ code, language = 'python', onRunInPlayground }) {
  const [copied, setCopied] = useState(false);
  const cleanCode = String(code || '').replace(/\n$/, '');
  const isPython = !language || ['py', 'python', 'python3'].includes(language.toLowerCase());

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="my-5 rounded-xl overflow-hidden border border-border-default bg-bg-code text-code-foreground shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-white/10 bg-black/20">
        <span className="text-xs font-mono uppercase tracking-wider text-code-foreground/70">
          {language || 'python'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-code-foreground/80 hover:text-code-foreground hover:bg-white/10 transition-colors"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          {isPython && cleanCode.trim().length > 0 && (
            <button
              type="button"
              onClick={() => onRunInPlayground(cleanCode)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-accent-primary text-white hover:opacity-90 transition-opacity"
            >
              <Play size={12} />
              <span>Run in Playground →</span>
            </button>
          )}
        </div>
      </div>
      <pre className="p-4 overflow-x-auto text-xs sm:text-sm font-mono leading-relaxed text-code-foreground">
        <code>{cleanCode}</code>
      </pre>
    </div>
  );
}

function deriveTakeaways(guide) {
  if (Array.isArray(guide?.key_takeaways) && guide.key_takeaways.length > 0) {
    return guide.key_takeaways;
  }
  const items = [];
  const md = String(guide?.content_markdown || '');
  const quoteMatch = md.match(/^>\s*\*\*Key Insight:\*\*\s*(.+)$/m);
  if (quoteMatch?.[1]) {
    items.push(quoteMatch[1].trim());
  }
  const teaches = guide?.structured_data?.teaches;
  if (Array.isArray(teaches) && teaches.length > 0) {
    items.push(`Core concepts covered: ${teaches.slice(0, 5).join(', ')}.`);
  }
  if (guide?.under_the_hood?.big_o) {
    items.push(`Runtime profile: ${guide.under_the_hood.big_o}`);
  }
  if (items.length === 0 && guide?.description) {
    items.push(guide.description);
  }
  return items;
}

function deriveFaqs(guide) {
  if (Array.isArray(guide?.faqs) && guide.faqs.length > 0) {
    return guide.faqs;
  }
  const faqs = [];
  const level = guide?.level || guide?.structured_data?.educationalLevel || 'Intermediate';
  const mins = guide?.reading_minutes || 15;
  faqs.push({
    question: `Who is "${guide?.title || 'this guide'}" designed for?`,
    answer: `This ${level.toLowerCase()} engineering guide takes roughly ${mins} minutes and focuses on practical, runnable Python patterns you can execute directly on CPU without external cloud dependencies.`,
  });
  if (guide?.under_the_hood?.cpython_note || guide?.under_the_hood?.memory_model) {
    faqs.push({
      question: 'What happens under the hood when running this in production?',
      answer: guide.under_the_hood.cpython_note || guide.under_the_hood.memory_model,
    });
  }
  if (Array.isArray(guide?.tags) && guide.tags.length > 0) {
    faqs.push({
      question: 'Which Python & AI skills will I practice here?',
      answer: `You will work hands-on with ${guide.tags.slice(0, 5).join(', ')}, and you can open any code block in the PyMasters Playground to inspect execution step by step.`,
    });
  }
  return faqs;
}

export default function Guides() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [guides, setGuides] = useState([]);
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');

  useEffect(() => {
    if (!slug) {
      document.title = 'Python Guides — PyMasters';
    }
  }, [slug]);

  const pageTitle = slug
    ? (guide?.meta_title || (guide?.title ? `${guide.title} — PyMasters` : 'Python Guides — PyMasters'))
    : 'Python Guides — PyMasters';

  const pageDescription = slug
    ? (guide?.meta_description || guide?.description || 'Hands-on Python & AI engineering tutorial on PyMasters.')
    : 'Deep-dive Python and AI engineering guides with runnable examples, architectural breakdowns, and interactive Playground snippets.';

  usePageMeta({
    title: pageTitle,
    description: pageDescription,
    canonicalPath: slug ? `/guides/${slug}` : '/guides',
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setError('');

    if (slug) {
      api.get(`/guides/${encodeURIComponent(slug)}`)
        .then((res) => {
          if (cancelled) return;
          setGuide(res.data || null);
        })
        .catch((err) => {
          if (cancelled) return;
          if (err?.response?.status === 404 || err?.response?.status === 400) {
            setNotFound(true);
          } else {
            setError('Could not load this engineering guide right now.');
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      setGuide(null);
      api.get('/guides')
        .then((res) => {
          if (cancelled) return;
          const list = Array.isArray(res.data?.guides) ? res.data.guides : [];
          setGuides(list);
        })
        .catch(() => {
          if (!cancelled) setError('Could not load Python guides right now.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const allTags = useMemo(() => {
    const counts = new Map();
    for (const g of guides) {
      for (const tag of g.tags || []) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return ['All', ...Array.from(counts.keys()).slice(0, 10)];
  }, [guides]);

  const filteredGuides = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return guides.filter((g) => {
      const matchesTag = selectedTag === 'All' || (g.tags || []).includes(selectedTag);
      if (!matchesTag) return false;
      if (!q) return true;
      const hay = `${g.title || ''} ${g.description || ''} ${(g.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [guides, searchQuery, selectedTag]);

  const openInPlayground = (snippet) => {
    const target = `/dashboard/playground?code=${encodeURIComponent(snippet)}`;
    navigate(target);
  };

  const markdownComponents = useMemo(
    () => ({
      h2: ({ children }) => (
        <h2 className="font-display text-xl sm:text-2xl font-bold text-text-primary mt-8 mb-3">
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="font-display text-lg sm:text-xl font-bold text-text-primary mt-6 mb-2.5">
          {children}
        </h3>
      ),
      p: ({ children }) => (
        <p className="text-sm sm:text-base text-text-secondary leading-relaxed my-3.5">
          {children}
        </p>
      ),
      ul: ({ children }) => (
        <ul className="list-disc pl-6 space-y-2 my-3.5 text-sm sm:text-base text-text-secondary">
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol className="list-decimal pl-6 space-y-2 my-3.5 text-sm sm:text-base text-text-secondary">
          {children}
        </ol>
      ),
      blockquote: ({ children }) => (
        <blockquote className="my-5 pl-4 py-2 border-l-4 border-accent-primary bg-accent-subtle rounded-r-xl text-sm sm:text-base text-text-primary">
          {children}
        </blockquote>
      ),
      table: ({ children }) => (
        <div className="my-5 overflow-x-auto rounded-xl border border-border-default">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">{children}</table>
        </div>
      ),
      thead: ({ children }) => (
        <thead className="bg-bg-elevated text-text-primary border-b border-border-default">
          {children}
        </thead>
      ),
      th: ({ children }) => <th className="px-3.5 py-2.5 font-semibold">{children}</th>,
      td: ({ children }) => (
        <td className="px-3.5 py-2.5 border-t border-border-default text-text-secondary">
          {children}
        </td>
      ),
      code({ className, children, ...props }) {
        const match = /language-(\w+)/.exec(className || '');
        const text = String(children || '');
        const isBlock = Boolean(match) || text.includes('\n');
        if (isBlock) {
          return (
            <CodeBlock
              code={text}
              language={match?.[1] || 'python'}
              onRunInPlayground={openInPlayground}
            />
          );
        }
        return (
          <code
            className="px-1.5 py-0.5 rounded-md bg-bg-elevated border border-border-default font-mono text-xs text-accent-primary"
            {...props}
          >
            {children}
          </code>
        );
      },
      pre: ({ children }) => <>{children}</>,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const takeaways = useMemo(() => (guide ? deriveTakeaways(guide) : []), [guide]);
  const faqs = useMemo(() => (guide ? deriveFaqs(guide) : []), [guide]);

  return (
    <div className="min-h-screen bg-bg-base text-text-secondary flex flex-col">
      <ConversionBar user={user} position="top" />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {slug ? (
          <>
            <div className="mb-6">
              <Link
                to="/guides"
                className="inline-flex items-center gap-2 text-sm font-semibold text-accent-primary hover:underline min-h-11"
              >
                <ArrowLeft size={16} />
                <span>All Python Engineering Guides</span>
              </Link>
            </div>

            {loading && (
              <div className="rounded-2xl border border-border-default bg-bg-surface p-8 text-sm text-text-muted" role="status">
                Loading engineering guide…
              </div>
            )}

            {!loading && notFound && (
              <div className="rounded-2xl border border-border-default bg-bg-surface p-8 space-y-4">
                <h1 className="font-display text-2xl font-bold text-text-primary">
                  Guide not found
                </h1>
                <p className="text-sm text-text-secondary">
                  We could not find an engineering guide matching <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-bg-elevated">{slug}</code>. Browse the full library below.
                </p>
                <Link
                  to="/guides"
                  className="inline-flex items-center gap-2 min-h-11 px-4 py-2 rounded-xl bg-accent-primary text-white text-sm font-bold"
                >
                  <BookOpen size={16} />
                  <span>Browse Python Guides</span>
                </Link>
              </div>
            )}

            {!loading && error && !notFound && (
              <div className="rounded-2xl border border-border-default bg-bg-surface p-6 text-sm text-text-secondary">
                {error}
              </div>
            )}

            {!loading && guide && (
              <article className="space-y-8">
                {/* Article Header */}
                <header className="rounded-2xl border border-border-default bg-bg-surface p-6 sm:p-8 space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    {guide.level && (
                      <span className="px-2.5 py-1 rounded-full bg-accent-subtle text-accent-primary border border-border-default">
                        {guide.level}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-bg-elevated text-text-muted">
                      <Clock size={12} />
                      {guide.reading_minutes || 15} min read
                    </span>
                    {guide.updated_at && (
                      <span className="px-2.5 py-1 rounded-full bg-bg-elevated text-text-muted">
                        Updated {guide.updated_at}
                      </span>
                    )}
                  </div>

                  <h1 className="font-display text-2xl sm:text-4xl font-bold text-text-primary leading-tight">
                    {guide.title}
                  </h1>

                  {guide.description && (
                    <p className="text-base sm:text-lg text-text-secondary leading-relaxed">
                      {guide.description}
                    </p>
                  )}

                  {Array.isArray(guide.tags) && guide.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {guide.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs text-text-secondary"
                        >
                          <Tag size={11} className="text-accent-primary" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {guide.lesson_id && (
                    <div className="pt-2 flex flex-wrap items-center gap-3">
                      <Link
                        to={`/dashboard/classroom/${encodeURIComponent(guide.lesson_id)}`}
                        className="inline-flex items-center gap-2 min-h-11 px-4 py-2 rounded-xl bg-accent-subtle text-accent-primary border border-border-strong text-xs sm:text-sm font-bold hover:bg-bg-elevated transition-colors"
                      >
                        <Sparkles size={15} />
                        <span>Open Interactive Lesson in Classroom →</span>
                      </Link>
                    </div>
                  )}
                </header>

                {/* Key Takeaways */}
                {takeaways.length > 0 && (
                  <section
                    aria-label="Key Takeaways"
                    className="rounded-2xl border border-border-default bg-bg-surface p-6 space-y-3"
                  >
                    <h2 className="font-display text-lg font-bold text-text-primary flex items-center gap-2">
                      <Sparkles size={18} className="text-accent-primary" />
                      <span>Key Takeaways</span>
                    </h2>
                    <ul className="space-y-2 text-sm text-text-secondary">
                      {takeaways.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-primary shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Main Article Body */}
                <div className="rounded-2xl border border-border-default bg-bg-surface p-6 sm:p-8">
                  {guide.content_markdown ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {guide.content_markdown}
                    </ReactMarkdown>
                  ) : null}

                  {Array.isArray(guide.sections) &&
                    guide.sections.map((sec, idx) => (
                      <section key={idx} className="mt-6 first:mt-0 space-y-3">
                        {sec.heading && (
                          <h2 className="font-display text-xl font-bold text-text-primary">
                            {sec.heading}
                          </h2>
                        )}
                        {sec.body && (
                          <p className="text-sm sm:text-base text-text-secondary leading-relaxed">
                            {sec.body}
                          </p>
                        )}
                        {sec.code && (
                          <CodeBlock
                            code={sec.code}
                            language="python"
                            onRunInPlayground={openInPlayground}
                          />
                        )}
                      </section>
                    ))}

                  {guide.example_code &&
                    (!guide.content_markdown || !guide.content_markdown.includes('```')) && (
                      <div className="mt-6">
                        <h3 className="font-display text-lg font-bold text-text-primary mb-2">
                          Runnable Example
                        </h3>
                        <CodeBlock
                          code={guide.example_code}
                          language="python"
                          onRunInPlayground={openInPlayground}
                        />
                      </div>
                    )}
                </div>

                {/* Under the Hood */}
                {guide.under_the_hood && typeof guide.under_the_hood === 'object' && (
                  <section className="rounded-2xl border border-border-default bg-bg-surface p-6 space-y-4">
                    <h2 className="font-display text-lg font-bold text-text-primary flex items-center gap-2">
                      <Layers size={18} className="text-accent-primary" />
                      <span>Under the Hood</span>
                    </h2>
                    {guide.under_the_hood.summary && (
                      <p className="text-sm sm:text-base text-text-secondary leading-relaxed">
                        {guide.under_the_hood.summary}
                      </p>
                    )}
                    {Array.isArray(guide.under_the_hood.steps) && guide.under_the_hood.steps.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        {guide.under_the_hood.steps.map((step, sIdx) => (
                          <div
                            key={sIdx}
                            className="rounded-xl bg-bg-elevated p-4 border border-border-default space-y-1.5"
                          >
                            {step.title && (
                              <div className="text-xs font-bold uppercase tracking-wider text-accent-primary">
                                {step.title}
                              </div>
                            )}
                            {step.body && (
                              <p className="text-text-secondary leading-relaxed">{step.body}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {(guide.under_the_hood.memory_model || guide.under_the_hood.cpython_note) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        {guide.under_the_hood.memory_model && (
                          <div className="rounded-xl bg-bg-elevated p-4 border border-border-default">
                            <div className="text-xs font-bold uppercase tracking-wider text-text-muted mb-1">
                              Memory &amp; Representation
                            </div>
                            <p className="text-text-secondary">{guide.under_the_hood.memory_model}</p>
                          </div>
                        )}
                        {guide.under_the_hood.cpython_note && (
                          <div className="rounded-xl bg-bg-elevated p-4 border border-border-default">
                            <div className="text-xs font-bold uppercase tracking-wider text-text-muted mb-1">
                              Runtime Mechanics
                            </div>
                            <p className="text-text-secondary">{guide.under_the_hood.cpython_note}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {guide.under_the_hood.takeaway && (
                      <div className="rounded-xl border border-border-strong bg-accent-subtle p-4 text-sm text-text-primary font-medium">
                        {guide.under_the_hood.takeaway}
                      </div>
                    )}
                  </section>
                )}

                {/* FAQs */}
                {faqs.length > 0 && (
                  <section
                    aria-label="Frequently Asked Questions"
                    className="rounded-2xl border border-border-default bg-bg-surface p-6 space-y-4"
                  >
                    <h2 className="font-display text-lg font-bold text-text-primary flex items-center gap-2">
                      <HelpCircle size={18} className="text-accent-primary" />
                      <span>Frequently Asked Questions</span>
                    </h2>
                    <div className="space-y-3">
                      {faqs.map((faq, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-border-default bg-bg-elevated p-4 space-y-1.5"
                        >
                          <h3 className="text-sm font-bold text-text-primary">{faq.question}</h3>
                          <p className="text-sm text-text-secondary leading-relaxed">{faq.answer}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </article>
            )}
          </>
        ) : (
          /* Index View (/guides) */
          <div className="space-y-8">
            <header className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-subtle text-accent-primary text-xs font-bold uppercase tracking-wider">
                <BookOpen size={13} />
                <span>PyMasters Engineering Guides</span>
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-text-primary">
                Practical Python &amp; AI Engineering Guides
              </h1>
              <p className="text-base text-text-secondary max-w-2xl">
                Hands-on technical guides written for builders. Inspect working Python implementations, understand the math and memory layout, and launch every snippet directly in the Playground.
              </p>
            </header>

            {/* Search & Tag Filters */}
            <div className="rounded-2xl border border-border-default bg-bg-surface p-4 sm:p-5 space-y-4">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search guides by topic, model, or Python concept..."
                  aria-label="Search engineering guides"
                  className="w-full min-h-11 pl-10 pr-4 py-2.5 rounded-xl bg-bg-elevated border border-border-default text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus"
                />
              </div>
              {allTags.length > 1 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filter guides by tag">
                  {allTags.map((tag) => {
                    const active = selectedTag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setSelectedTag(tag)}
                        className={`min-h-9 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          active
                            ? 'bg-accent-primary text-white border-accent-primary'
                            : 'bg-bg-elevated text-text-secondary border-border-default hover:border-border-strong'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {loading && (
              <div className="rounded-2xl border border-border-default bg-bg-surface p-8 text-sm text-text-muted" role="status">
                Loading engineering guides…
              </div>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-border-default bg-bg-surface p-6 text-sm text-text-secondary">
                {error}
              </div>
            )}

            {!loading && !error && filteredGuides.length === 0 && (
              <div className="rounded-2xl border border-border-default bg-bg-surface p-8 text-center space-y-2">
                <p className="text-sm font-semibold text-text-primary">No matching guides found</p>
                <p className="text-xs text-text-muted">
                  Try clearing your search filter or selecting another tag.
                </p>
              </div>
            )}

            {!loading && filteredGuides.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredGuides.map((item) => (
                  <Link
                    key={item.slug}
                    to={`/guides/${item.slug}`}
                    className="group rounded-2xl border border-border-default bg-bg-surface hover:border-border-strong p-6 flex flex-col justify-between gap-4 transition-all shadow-sm"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
                        <span className="px-2.5 py-0.5 rounded-full bg-accent-subtle text-accent-primary font-semibold">
                          {item.level || 'Intermediate'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} />
                          {item.reading_minutes || 15} min read
                        </span>
                      </div>
                      <h2 className="font-display text-lg sm:text-xl font-bold text-text-primary group-hover:text-accent-primary transition-colors">
                        {item.title}
                      </h2>
                      <p className="text-sm text-text-secondary line-clamp-3">
                        {item.description}
                      </p>
                    </div>

                    <div className="space-y-3 pt-2">
                      {Array.isArray(item.tags) && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {item.tags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-md bg-bg-elevated text-xs text-text-muted"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold text-accent-primary">
                        <span>Read Engineering Guide</span>
                        <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        <ConversionBar user={user} position="bottom" />
      </main>
    </div>
  );
}
