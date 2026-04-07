import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, Clock, Code2, Zap, Star, ChevronRight, Send, Award,
  Flame, Lock, CheckCircle2, AlertCircle, Loader2, Users
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { getWeeklyChallenge, submitChallenge, getChallengeLeaderboard } from '../api';
import { safeErrorMsg } from '../utils/errorUtils';

// ─── Difficulty badge colors ────────────────────────────────────────────────
const DIFFICULTY = {
  Easy:         { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', label: 'Easy' },
  Medium:       { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', label: 'Medium' },
  Hard:         { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', label: 'Hard' },
  Beginner:     { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', label: 'Beginner' },
  Intermediate: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: 'Intermediate' },
  Advanced:     { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', label: 'Advanced' },
};

// ─── Countdown timer hook ───────────────────────────────────────────────────
function useCountdown(targetDate) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (!targetDate) return;
    const tick = () => {
      const now = Date.now();
      const diff = Math.max(0, new Date(targetDate).getTime() - now);
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return timeLeft;
}

// ─── Loading skeleton ───────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="min-h-screen bg-bg-base p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="h-10 w-64 bg-bg-elevated rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-48 bg-bg-elevated rounded-2xl animate-pulse" />
            <div className="h-72 bg-bg-elevated rounded-2xl animate-pulse" />
          </div>
          <div className="h-96 bg-bg-elevated rounded-2xl animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ─── Leaderboard row ────────────────────────────────────────────────────────
function LeaderboardRow({ entry, rank }) {
  const medals = ['', 'bg-yellow-400', 'bg-slate-300', 'bg-amber-600'];
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.05 }}
      className={clsx(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors',
        rank <= 3
          ? 'bg-gradient-to-r from-yellow-500/5 to-transparent'
          : 'hover:bg-bg-elevated'
      )}
    >
      <div className={clsx(
        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
        rank <= 3
          ? `${medals[rank]} text-white shadow-md`
          : 'bg-bg-elevated text-text-secondary'
      )}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{entry.username || entry.name}</p>
        <p className="text-xs text-text-muted">{entry.time || entry.score} pts</p>
      </div>
      {rank <= 3 && <Trophy size={14} className="text-yellow-400 flex-shrink-0" />}
    </motion.div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function Challenges() {
  const { user } = useAuth();
  const [challenge, setChallenge] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const editorRef = useRef(null);

  // Fetch data on mount
  useEffect(() => {
    async function load() {
      try {
        const [chalRes, lbRes] = await Promise.allSettled([
          getWeeklyChallenge(),
          getChallengeLeaderboard(),
        ]);
        if (chalRes.status === 'fulfilled') {
          setChallenge(chalRes.value.data);
          setCode(chalRes.value.data?.starter_code || '# Write your solution here\n');
        }
        if (lbRes.status === 'fulfilled') {
          setLeaderboard(Array.isArray(lbRes.value.data) ? lbRes.value.data : lbRes.value.data?.entries || []);
        }
      } catch {
        setError('Unable to load challenge data. Please try again later.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const countdown = useCountdown(challenge?.next_challenge_at);

  const handleSubmit = useCallback(async () => {
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await submitChallenge({
        challenge_id: challenge?.id,
        user_id: user?.user_id,
        code,
      });
      setResult(res.data);
    } catch (err) {
      setResult({ success: false, message: safeErrorMsg(err, 'Submission failed. Try again.') });
    } finally {
      setSubmitting(false);
    }
  }, [code, challenge, user, submitting]);

  if (loading) return <Skeleton />;

  const diff = DIFFICULTY[challenge?.difficulty] || DIFFICULTY.Medium;

  // Fallback previous challenges
  const previousChallenges = challenge?.previous || [
    { id: 'p1', title: 'Binary Search Variants', status: 'completed', xp: 150 },
    { id: 'p2', title: 'Graph Traversal', status: 'completed', xp: 200 },
    { id: 'p3', title: 'Dynamic Programming I', status: 'locked', xp: 250 },
  ];

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">

        {/* ── Header ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-text-primary flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 shadow-lg shadow-orange-500/20">
                <Flame size={24} className="text-white" />
              </div>
              Weekly Challenges
            </h1>
            <p className="text-text-secondary mt-1 ml-14">
              Compete, learn, and climb the leaderboard
            </p>
          </div>

          {/* Next challenge timer */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-bg-surface border border-border-default backdrop-blur-sm"
          >
            <Clock size={16} className="text-cyan-500" />
            <span className="text-xs text-text-muted">Next challenge in</span>
            <div className="flex gap-1.5">
              {[
                { v: countdown.days, l: 'd' },
                { v: countdown.hours, l: 'h' },
                { v: countdown.minutes, l: 'm' },
                { v: countdown.seconds, l: 's' },
              ].map(({ v, l }) => (
                <span key={l} className="px-1.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-600 font-mono text-sm font-semibold">
                  {String(v).padStart(2, '0')}{l}
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400">
            <AlertCircle size={18} /> {error}
          </motion.div>
        )}

        {/* ── Main grid ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Left column: challenge + editor */}
          <div className="lg:col-span-2 space-y-4">

            {/* Hero challenge card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="relative overflow-hidden rounded-2xl bg-bg-surface border border-border-default backdrop-blur-sm"
            >
              {/* Decorative gradient bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-rose-500 to-purple-500" />

              <div className="p-6 md:p-8">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className={clsx('px-3 py-1 rounded-full text-xs font-semibold border', diff.bg, diff.text, diff.border)}>
                    {challenge?.difficulty || 'Medium'}
                  </span>
                  <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/15 text-amber-500 text-xs font-semibold border border-amber-500/20">
                    <Zap size={12} /> {challenge?.xp || 200} XP
                  </span>
                  <span className="text-xs text-text-muted ml-auto">
                    Week {challenge?.week || '#'}
                  </span>
                </div>

                <h2 className="text-2xl font-bold text-text-primary mb-3">
                  {challenge?.title || 'This Week\'s Challenge'}
                </h2>
                <p className="text-text-secondary leading-relaxed">
                  {challenge?.description || 'Loading challenge description...'}
                </p>

                {challenge?.hints && (
                  <div className="mt-4 p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
                    <p className="text-xs font-semibold text-cyan-500 mb-1 flex items-center gap-1">
                      <Star size={12} /> Hint
                    </p>
                    <p className="text-sm text-text-secondary">{challenge.hints}</p>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Code editor section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl bg-bg-surface border border-border-default backdrop-blur-sm overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
                <div className="flex items-center gap-2 text-text-secondary">
                  <Code2 size={16} className="text-purple-500" />
                  <span className="text-sm font-semibold">Your Solution</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
              </div>

              <div className="relative">
                <textarea
                  ref={editorRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  spellCheck={false}
                  className={clsx(
                    'w-full min-h-[320px] p-5 font-mono text-sm leading-relaxed resize-y',
                    'bg-bg-elevated text-text-primary',
                    'focus:outline-none placeholder:text-text-muted',
                    'border-none'
                  )}
                  placeholder="# Write your Python solution here..."
                />
              </div>

              <div className="flex items-center justify-between px-5 py-3 border-t border-border-default bg-bg-elevated/50">
                <p className="text-xs text-text-muted">
                  Python 3.11 &middot; Time limit: {challenge?.time_limit || '5s'}
                </p>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSubmit}
                  disabled={submitting || !code.trim()}
                  className={clsx(
                    'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
                    'bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-lg shadow-orange-500/25',
                    'hover:shadow-xl hover:shadow-orange-500/30',
                    'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none'
                  )}
                >
                  {submitting ? (
                    <><Loader2 size={16} className="animate-spin" /> Submitting...</>
                  ) : (
                    <><Send size={16} /> Submit Solution</>
                  )}
                </motion.button>
              </div>
            </motion.div>

            {/* Submission result */}
            <AnimatePresence>
              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  className={clsx(
                    'rounded-2xl border p-5 backdrop-blur-sm',
                    result.success
                      ? 'bg-green-500/10 border-green-500/20'
                      : 'bg-red-500/10 border-red-500/20'
                  )}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {result.success ? (
                      <CheckCircle2 size={20} className="text-green-400" />
                    ) : (
                      <AlertCircle size={20} className="text-red-400" />
                    )}
                    <span className={clsx('font-semibold', result.success ? 'text-green-400' : 'text-red-400')}>
                      {result.success ? 'Challenge Passed!' : 'Not Quite'}
                    </span>
                    {result.xp_earned && (
                      <span className="ml-auto flex items-center gap-1 text-amber-400 text-sm font-semibold">
                        <Zap size={14} /> +{result.xp_earned} XP
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-text-secondary">{result.message || result.feedback}</p>
                  {result.test_results && (
                    <div className="mt-3 space-y-1">
                      {result.test_results.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {t.passed ? (
                            <CheckCircle2 size={12} className="text-green-400" />
                          ) : (
                            <AlertCircle size={12} className="text-red-400" />
                          )}
                          <span className="text-text-secondary">{t.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Previous challenges */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl bg-bg-surface border border-border-default backdrop-blur-sm p-4"
            >
              <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
                <Award size={18} className="text-purple-500" /> Previous Challenges
              </h3>
              <div className="space-y-2">
                {previousChallenges.map((pc, i) => (
                  <motion.div
                    key={pc.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + i * 0.05 }}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors',
                      pc.status === 'completed'
                        ? 'bg-green-500/5 hover:bg-green-500/10 border border-green-500/10'
                        : 'bg-bg-elevated border border-border-default opacity-60'
                    )}
                  >
                    {pc.status === 'completed' ? (
                      <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
                    ) : (
                      <Lock size={16} className="text-text-muted flex-shrink-0" />
                    )}
                    <span className="flex-1 text-sm text-text-secondary">{pc.title}</span>
                    <span className="text-xs text-amber-500 font-semibold flex items-center gap-1">
                      <Zap size={10} /> {pc.xp} XP
                    </span>
                    <ChevronRight size={14} className="text-text-muted" />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Right column: leaderboard */}
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="sticky top-6 rounded-2xl bg-bg-surface border border-border-default backdrop-blur-sm overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-border-default bg-gradient-to-r from-amber-500/10 to-orange-500/10">
                <h3 className="font-bold text-text-primary flex items-center gap-2">
                  <Trophy size={18} className="text-yellow-400" />
                  Leaderboard
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  <Users size={11} className="inline mr-1" />
                  {leaderboard.length} competitor{leaderboard.length !== 1 ? 's' : ''} this week
                </p>
              </div>

              <div className="p-3 max-h-[520px] overflow-y-auto space-y-1 custom-scrollbar">
                {leaderboard.length > 0 ? (
                  leaderboard.map((entry, i) => (
                    <LeaderboardRow key={entry.user_id || i} entry={entry} rank={i + 1} />
                  ))
                ) : (
                  <div className="py-10 text-center">
                    <Trophy size={32} className="mx-auto text-text-muted mb-3" />
                    <p className="text-sm text-text-muted">
                      No submissions yet. Be the first!
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
