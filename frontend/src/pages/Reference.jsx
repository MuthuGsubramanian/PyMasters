import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, BookOpen, ChevronRight, ArrowLeft, Code2,
  Cpu, Brain, Zap, Star, Copy, Check, Sparkles,
  FileText, Layers, GitBranch, Database, Terminal, Box
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { getQuickReference, getQuickReferenceTopics } from '../api';

// ─── Categories ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'all', label: 'All Topics', icon: Layers },
  { key: 'python-basics', label: 'Python Basics', icon: Code2 },
  { key: 'advanced', label: 'Advanced', icon: GitBranch },
  { key: 'ai-ml', label: 'AI / ML', icon: Brain },
];

const CATEGORY_COLORS = {
  'python-basics': { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/20', icon: 'text-cyan-500', gradient: 'from-cyan-500 to-blue-500' },
  'advanced':      { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/20', icon: 'text-purple-500', gradient: 'from-purple-500 to-indigo-500' },
  'ai-ml':         { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/20', icon: 'text-rose-500', gradient: 'from-rose-500 to-orange-500' },
};

const TOPIC_ICONS = {
  variables: FileText, functions: Code2, classes: Box, loops: GitBranch,
  'data-structures': Database, strings: Terminal, 'file-io': FileText,
  decorators: Sparkles, generators: Zap, 'async': GitBranch,
  metaclasses: Layers, 'error-handling': Star,
  numpy: Cpu, pandas: Database, sklearn: Brain, pytorch: Cpu,
  tensorflow: Cpu, 'neural-networks': Brain, 'data-preprocessing': Database,
};

function getTopicIcon(slug) {
  return TOPIC_ICONS[slug] || BookOpen;
}

// ─── Copy button ────────────────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-400 hover:text-slate-200 transition-all duration-200"
      title="Copy code"
    >
      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  );
}

// ─── Code block with syntax highlighting (simple) ───────────────────────────
function CodeBlock({ code, language = 'python' }) {
  return (
    <div className="relative group rounded-xl overflow-hidden bg-[#0d0d2b] border border-white/5">
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-b border-white/5">
        <span className="text-xs text-slate-500 font-mono">{language}</span>
        <CopyButton text={code} />
      </div>
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed">
        <code className="text-green-300 font-mono whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

// ─── Loading skeleton ───────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="min-h-screen bg-bg-base p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="h-10 w-56 bg-bg-elevated rounded-xl animate-pulse" />
        <div className="h-12 w-full bg-bg-elevated rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 bg-bg-elevated rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Topic card ─────────────────────────────────────────────────────────────
function TopicCard({ topic, onClick }) {
  const colors = CATEGORY_COLORS[topic.category] || CATEGORY_COLORS['python-basics'];
  const Icon = getTopicIcon(topic.slug || topic.id);

  return (
    <motion.button
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="text-left w-full rounded-2xl bg-bg-surface border border-border-default backdrop-blur-sm p-4 transition-shadow hover:shadow-lg hover:shadow-slate-200/50 group"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className={clsx('p-2 rounded-xl bg-gradient-to-br shadow-md', colors.gradient)}>
          <Icon size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-text-primary text-sm leading-tight group-hover:text-cyan-600 transition-colors">
            {topic.title || topic.name}
          </h3>
          <span className={clsx('text-xs font-medium mt-1 inline-block', colors.text)}>
            {CATEGORIES.find(c => c.key === topic.category)?.label || topic.category}
          </span>
        </div>
        <ChevronRight size={16} className="text-text-muted group-hover:text-cyan-500 transition-colors mt-0.5 flex-shrink-0" />
      </div>
      <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
        {topic.description || topic.summary || 'Quick reference for this topic'}
      </p>
      {topic.items_count != null && (
        <p className="text-[10px] text-text-muted mt-2">
          {topic.items_count} section{topic.items_count !== 1 ? 's' : ''}
        </p>
      )}
    </motion.button>
  );
}

// ─── Detail view ────────────────────────────────────────────────────────────
function TopicDetail({ topic, data, onBack, loading: detailLoading }) {
  const colors = CATEGORY_COLORS[topic.category] || CATEGORY_COLORS['python-basics'];

  if (detailLoading) {
    return (
      <div className="space-y-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary transition-colors">
          <ArrowLeft size={16} /> Back to topics
        </button>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 bg-bg-elevated rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const sections = data?.sections || data?.items || [];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
      >
        <ArrowLeft size={16} /> Back to topics
      </button>

      {/* Topic header */}
      <div className="rounded-2xl bg-bg-surface border border-border-default backdrop-blur-sm p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className={clsx('p-2.5 rounded-xl bg-gradient-to-br shadow-md', colors.gradient)}>
            {(() => { const Icon = getTopicIcon(topic.slug || topic.id); return <Icon size={20} className="text-white" />; })()}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-text-primary">{topic.title || topic.name}</h2>
            <span className={clsx('text-xs font-medium', colors.text)}>
              {CATEGORIES.find(c => c.key === topic.category)?.label || topic.category}
            </span>
          </div>
        </div>
        {(data?.description || topic.description) && (
          <p className="text-sm text-text-secondary mt-3 leading-relaxed">
            {data?.description || topic.description}
          </p>
        )}
      </div>

      {/* Sections */}
      {sections.length > 0 ? (
        sections.map((section, i) => (
          <motion.div
            key={section.id || i}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="rounded-2xl bg-bg-surface border border-border-default backdrop-blur-sm overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-border-default">
              <h3 className="font-semibold text-text-primary flex items-center gap-2">
                <Star size={14} className={colors.icon} />
                {section.title || section.heading}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              {section.content && (
                <p className="text-sm text-text-secondary leading-relaxed">{section.content}</p>
              )}
              {section.code && <CodeBlock code={section.code} language={section.language || 'python'} />}
              {section.example && <CodeBlock code={section.example} language="python" />}
              {section.notes && (
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                  <p className="text-xs text-amber-600 flex items-center gap-1 font-semibold mb-1">
                    <Zap size={11} /> Note
                  </p>
                  <p className="text-xs text-text-secondary">{section.notes}</p>
                </div>
              )}
            </div>
          </motion.div>
        ))
      ) : (
        <div className="text-center py-16">
          <BookOpen size={40} className="mx-auto text-text-muted mb-3" />
          <p className="text-text-muted">No sections available for this topic yet.</p>
        </div>
      )}
    </motion.div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function Reference() {
  const { user } = useAuth();
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [topicData, setTopicData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch topics
  useEffect(() => {
    async function load() {
      try {
        const res = await getQuickReferenceTopics();
        setTopics(Array.isArray(res.data) ? res.data : res.data?.topics || []);
      } catch {
        setError('Unable to load reference topics.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Fetch detail when topic selected
  useEffect(() => {
    if (!selectedTopic) { setTopicData(null); return; }
    let cancelled = false;
    async function load() {
      setDetailLoading(true);
      try {
        const res = await getQuickReference(selectedTopic.slug || selectedTopic.id);
        if (!cancelled) setTopicData(res.data);
      } catch {
        if (!cancelled) setTopicData(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedTopic]);

  // Filter topics
  const filtered = useMemo(() => {
    return topics.filter((t) => {
      const matchesCategory = activeCategory === 'all' || t.category === activeCategory;
      const matchesSearch = !search ||
        (t.title || t.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [topics, activeCategory, search]);

  if (loading) return <Skeleton />;

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-text-primary flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/20">
              <BookOpen size={24} className="text-white" />
            </div>
            Quick Reference
          </h1>
          <p className="text-text-secondary mt-1 ml-14">
            Concise reference cards for Python, AI, and more
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {selectedTopic ? (
            <TopicDetail
              key="detail"
              topic={selectedTopic}
              data={topicData}
              loading={detailLoading}
              onBack={() => setSelectedTopic(null)}
            />
          ) : (
            <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Search bar */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-6"
              >
                <div className="relative">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search topics..."
                    className={clsx(
                      'w-full pl-11 pr-4 py-3 rounded-xl text-sm',
                      'bg-bg-surface border border-border-default',
                      'text-text-primary placeholder:text-text-muted',
                      'focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/30',
                      'backdrop-blur-sm transition-all'
                    )}
                  />
                </div>
              </motion.div>

              {/* Category tabs */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="flex flex-wrap gap-2 mb-6"
              >
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = activeCategory === cat.key;
                  return (
                    <button
                      key={cat.key}
                      onClick={() => setActiveCategory(cat.key)}
                      className={clsx(
                        'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                        isActive
                          ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/25'
                          : 'bg-bg-surface text-text-secondary border border-border-default hover:bg-bg-elevated'
                      )}
                    >
                      <Icon size={14} />
                      {cat.label}
                    </button>
                  );
                })}
              </motion.div>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* Topics grid */}
              {filtered.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {filtered.map((topic, i) => (
                    <motion.div
                      key={topic.id || topic.slug || i}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.04 }}
                    >
                      <TopicCard topic={topic} onClick={() => setSelectedTopic(topic)} />
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <div className="text-center py-20">
                  <Search size={40} className="mx-auto text-text-muted mb-3" />
                  <p className="text-text-muted">
                    {search ? `No topics matching "${search}"` : 'No topics available yet.'}
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
