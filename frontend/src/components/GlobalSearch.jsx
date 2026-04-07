import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Command,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  Clock,
  BookOpen,
  TrendingUp,
  Settings,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Static search catalogue — every navigable page / topic in PyMasters
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'pm_recent_searches';
const MAX_RECENT = 5;

/** @type {Array<{id: string, title: string, path: string, category: string}>} */
const SEARCH_ITEMS = [
  // Pages
  { id: 'page-dashboard',   title: 'Dashboard',       path: '/dashboard',              category: 'Pages' },
  { id: 'page-profile',     title: 'Profile',         path: '/dashboard/profile',      category: 'Pages' },
  { id: 'page-classroom',   title: 'Classroom',       path: '/dashboard/classroom',    category: 'Pages' },
  { id: 'page-playground',  title: 'Playground',      path: '/dashboard/playground',   category: 'Pages' },
  { id: 'page-trending',    title: 'Trending',        path: '/dashboard/trending',     category: 'Pages' },
  { id: 'page-paths',       title: 'Learning Paths',  path: '/dashboard/paths',        category: 'Pages' },

  // Trending topics
  { id: 'trend-llm',           title: 'Large Language Models',         path: '/dashboard/trending', category: 'Trending' },
  { id: 'trend-rag',           title: 'RAG Pipelines',                 path: '/dashboard/trending', category: 'Trending' },
  { id: 'trend-agents',        title: 'AI Agents & Tool Use',          path: '/dashboard/trending', category: 'Trending' },
  { id: 'trend-fine-tuning',   title: 'Fine-Tuning & LoRA',           path: '/dashboard/trending', category: 'Trending' },
  { id: 'trend-fastapi',       title: 'FastAPI & Async Python',        path: '/dashboard/trending', category: 'Trending' },
  { id: 'trend-langchain',     title: 'LangChain & LangGraph',         path: '/dashboard/trending', category: 'Trending' },
  { id: 'trend-vector-db',     title: 'Vector Databases',              path: '/dashboard/trending', category: 'Trending' },
  { id: 'trend-multimodal',    title: 'Multimodal AI',                 path: '/dashboard/trending', category: 'Trending' },
  { id: 'trend-pydantic',      title: 'Pydantic & Data Validation',    path: '/dashboard/trending', category: 'Trending' },
  { id: 'trend-prompt-eng',    title: 'Prompt Engineering',            path: '/dashboard/trending', category: 'Trending' },
  { id: 'trend-mlops',         title: 'MLOps & Model Deployment',      path: '/dashboard/trending', category: 'Trending' },
  { id: 'trend-transformers',  title: 'Transformers & HuggingFace',    path: '/dashboard/trending', category: 'Trending' },
  { id: 'trend-async',         title: 'Asyncio & Concurrency',         path: '/dashboard/trending', category: 'Trending' },
  { id: 'trend-testing',       title: 'Python Testing & Pytest',       path: '/dashboard/trending', category: 'Trending' },
  { id: 'trend-packaging',     title: 'Modern Python Packaging',       path: '/dashboard/trending', category: 'Trending' },

  // Settings / actions
  { id: 'settings-profile',       title: 'Edit Profile',          path: '/dashboard/profile', category: 'Settings' },
  { id: 'settings-preferences',   title: 'Preferences',           path: '/dashboard/profile', category: 'Settings' },
  { id: 'settings-notifications', title: 'Notification Settings', path: '/dashboard/profile', category: 'Settings' },
];

/** Icon map per category */
const CATEGORY_ICONS = {
  Pages: BookOpen,
  Trending: TrendingUp,
  Settings: Settings,
  Recent: Clock,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @returns {string[]}
 */
function readRecent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} query
 */
function pushRecent(query) {
  try {
    const prev = readRecent().filter((q) => q !== query);
    const next = [query, ...prev].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // silent
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Global command-palette search overlay triggered by Ctrl+K / Cmd+K.
 *
 * Features:
 * - Fuzzy-ish substring matching across all navigable pages and topics
 * - Results grouped by category with contextual icons
 * - Full keyboard navigation (arrow keys, Enter, Escape)
 * - Recent searches persisted in localStorage
 * - Glassmorphism backdrop with Framer Motion open/close animation
 *
 * This component registers its own global keydown listener and manages its
 * own open/close state; no props required.
 */
export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  // ---- Global shortcut listener ----
  useEffect(() => {
    /** @param {KeyboardEvent} e */
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Small delay to allow the animation frame to paint
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // ---- Filtered results ----
  const trimmed = query.trim().toLowerCase();

  const results = trimmed.length === 0
    ? []
    : SEARCH_ITEMS.filter((item) => item.title.toLowerCase().includes(trimmed));

  // Build recent-searches section when query is empty
  const recentQueries = trimmed.length === 0 ? readRecent() : [];
  const recentItems = recentQueries
    .map((q) => SEARCH_ITEMS.find((i) => i.title.toLowerCase() === q.toLowerCase()))
    .filter(Boolean);

  const displayItems = trimmed.length > 0 ? results : recentItems;

  // Group by category
  /** @type {Record<string, typeof SEARCH_ITEMS>} */
  const grouped = {};
  for (const item of displayItems) {
    const cat = trimmed.length === 0 ? 'Recent' : item.category;
    (grouped[cat] ||= []).push(item);
  }
  const categories = Object.keys(grouped);

  // Flat list for keyboard index
  const flatItems = categories.flatMap((cat) => grouped[cat]);

  // ---- Navigate to selected ----
  const go = useCallback(
    (/** @type {typeof SEARCH_ITEMS[0]} */ item) => {
      if (!item) return;
      pushRecent(item.title);
      navigate(item.path);
      setOpen(false);
    },
    [navigate],
  );

  // ---- Keyboard navigation inside the list ----
  /** @param {React.KeyboardEvent} e */
  function onInputKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flatItems[activeIndex]);
    }
  }

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // ---- Render ----
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="search-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          {/* Glassmorphism backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg mx-4 rounded-2xl border border-border-default bg-bg-surface/90 backdrop-blur-xl shadow-2xl shadow-black/20 overflow-hidden"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 h-14 border-b border-border-default">
              <Search size={18} className="text-text-muted shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search pages, topics, settings..."
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
              />
              <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] font-mono text-text-muted bg-bg-elevated border border-border-default rounded px-1.5 py-0.5">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2">
              {categories.length === 0 && trimmed.length > 0 && (
                <div className="px-4 py-8 text-center text-sm text-text-muted">
                  No results for &ldquo;{query}&rdquo;
                </div>
              )}

              {categories.length === 0 && trimmed.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-text-muted">
                  Start typing to search...
                </div>
              )}

              {categories.map((cat) => {
                const Icon = CATEGORY_ICONS[cat] || BookOpen;
                return (
                  <div key={cat}>
                    <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                      <Icon size={11} />
                      {cat}
                    </div>
                    {grouped[cat].map((item) => {
                      const flatIdx = flatItems.indexOf(item);
                      const isActive = flatIdx === activeIndex;
                      const CatIcon = CATEGORY_ICONS[item.category] || BookOpen;
                      return (
                        <button
                          key={item.id}
                          data-idx={flatIdx}
                          onClick={() => go(item)}
                          onMouseEnter={() => setActiveIndex(flatIdx)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-100 ${
                            isActive
                              ? 'bg-cyan-50 text-cyan-700'
                              : 'text-text-secondary hover:bg-bg-elevated'
                          }`}
                        >
                          <CatIcon size={15} className={isActive ? 'text-cyan-500' : 'text-text-muted'} />
                          <span className="flex-1 text-left truncate">{item.title}</span>
                          {isActive && (
                            <CornerDownLeft size={13} className="text-cyan-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Footer hints */}
            <div className="flex items-center gap-4 px-4 h-10 border-t border-border-default text-[10px] text-text-muted bg-bg-elevated/60">
              <span className="flex items-center gap-1">
                <ArrowUp size={10} />
                <ArrowDown size={10} />
                navigate
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft size={10} />
                open
              </span>
              <span className="flex items-center gap-1">
                <span className="font-mono text-[9px] bg-bg-elevated rounded px-1">ESC</span>
                close
              </span>
              <span className="ml-auto flex items-center gap-1">
                <Command size={10} />
                <span className="font-mono text-[9px]">K</span>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
