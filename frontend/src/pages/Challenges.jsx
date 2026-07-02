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
import { Card, Button, Badge, Table, TBody, TD } from '../components/ui';

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
// Next weekly reset = upcoming Monday 00:00 UTC (backend doesn't supply this yet).
function nextMondayUTC() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const add = ((8 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString();
}

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

// ─── Leaderboard response normalizer ────────────────────────────────────────
// Backend shape is { leaderboard: [...], total_participants }; older/alt shapes
// (a bare array, or { entries: [...] }) are tolerated for safety. Shared by the
// initial mount load AND the post-submit refresh so the two can never drift.
function pickLeaderboardArray(data) {
  return Array.isArray(data) ? data : (data?.leaderboard || data?.entries || []);
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
    <motion.tr
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.05 }}
      className={clsx(
        'transition-colors',
        rank <= 3
          ? 'bg-gradient-to-r from-yellow-500/5 to-transparent'
          : 'hover:bg-bg-elevated'
      )}
    >
      <TD className="w-10">
        <div className={clsx(
          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
          rank <= 3
            ? `${medals[rank]} text-white shadow-md`
            : 'bg-bg-elevated text-text-secondary'
        )}>
          {rank}
        </div>
      </TD>
      <TD>
        <p className="text-sm font-medium text-text-primary truncate">{entry.username || entry.name}</p>
        {/* Backend supplies `total_xp`; older fallbacks (time/score) kept for safety.
            `?? 0` avoids rendering a blank "pts" when the points field is absent. */}
        <p className="text-xs text-text-muted">{entry.total_xp ?? entry.time ?? entry.score ?? 0} pts</p>
      </TD>
      <TD className="w-8 text-right">
        {rank <= 3 && <Trophy size={14} className="text-yellow-400 inline-block" />}
      </TD>
    </motion.tr>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function Challenges() {
  useEffect(() => { document.title = 'Challenges — PyMasters'; }, []);
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
          // API shape: { week_number, year, challenge: {…}, total_challenges }.
          // Flatten the nested challenge and map field names the UI expects.
          const env = chalRes.value.data || {};
          const c = env.challenge || env;
          const ch = {
            ...c,
            week: env.week_number ?? c.week,
            xp: c.xp_reward ?? c.xp,
            hints: Array.isArray(c.hints) ? c.hints[0] : c.hints,
            next_challenge_at: env.next_challenge_at || c.next_challenge_at || nextMondayUTC(),
            // `previous` lives on the ENVELOPE (backend /weekly returns
            // { week_number, challenge, previous, … }), not on the inner
            // challenge object — spreading `...c` alone dropped it, so the
            // Previous Challenges panel always rendered its empty state even
            // though the API ships real past-week entries. Copy it across;
            // absent/malformed still falls through to the honest empty state.
            previous: Array.isArray(env.previous) ? env.previous : c.previous,
          };
          setChallenge(ch);
          setCode(c.starter_code || '# Write your solution here\n');
        } else {
          // Promise.allSettled NEVER rejects, so the catch below can't fire for
          // an HTTP failure — previously a failed /challenges/weekly fetch left
          // this page stuck on "Loading challenge description..." with an empty
          // editor and NO error surfaced (the error banner was dead code).
          // Surface the failure honestly; the placeholder UI still renders.
          setError('Unable to load this week\'s challenge. Please refresh to try again.');
        }
        if (lbRes.status === 'fulfilled') {
          // API shape: { leaderboard: [...], total_participants }. Earlier code only
          // looked for `.entries`, which the backend never returns, so the board
          // rendered empty even when real passing submissions existed. Read
          // `.leaderboard` first, keeping array/`.entries` fallbacks for safety.
          setLeaderboard(pickLeaderboardArray(lbRes.value.data));
        }
      } catch {
        setError('Unable to load challenge data. Please try again later.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Fall back to the next Monday 00:00 UTC when the backend doesn't supply
  // next_challenge_at (it currently doesn't), so the "Next challenge in" timer
  // counts down instead of being stuck at 00d 00h 00m 00s. nextMondayUTC() was
  // written for exactly this fallback but was previously never wired in.
  const countdown = useCountdown(challenge?.next_challenge_at || nextMondayUTC());

  // After a user PASSES a challenge they earn a leaderboard slot (and XP), but
  // the right-column board + "N competitors" count were only ever fetched on
  // mount — so a just-passed user saw a stale board (even the "No submissions
  // yet. Be the first!" empty state) until a manual reload, directly
  // contradicting the pass that just happened. Re-fetch on a successful pass.
  // Guarded: on any failure we keep the current board, so this can never
  // regress the existing view. Additive; only fires on a pass.
  const refreshLeaderboard = useCallback(async () => {
    try {
      const res = await getChallengeLeaderboard();
      setLeaderboard(pickLeaderboardArray(res.data));
    } catch {
      /* keep the existing board on failure — no regression */
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await submitChallenge({
        challenge_id: challenge?.id,
        user_id: user?.id || user?.user_id,
        code,
      });
      setResult(res.data);
      // Only a pass changes this user's leaderboard standing; refresh so their
      // new position + the competitor count reflect immediately. Other statuses
      // (failed/rejected/error) leave the board unchanged, as before.
      const status = res.data?.status;
      if (status === 'passed' || status === 'already_completed') {
        refreshLeaderboard();
      }
    } catch (err) {
      setResult({ success: false, message: safeErrorMsg(err, 'Submission failed. Try again.') });
    } finally {
      setSubmitting(false);
    }
  }, [code, challenge, user, submitting, refreshLeaderboard]);

  if (loading) return <Skeleton />;

  // Backend sends difficulty lowercase ("easy"/"medium"/"hard"); the DIFFICULTY
  // map is keyed by Capitalized labels ("Easy"/"Medium"/"Hard"). A raw lookup
  // missed for easy/hard and silently fell back to Medium (yellow) — so easy
  // challenges showed yellow instead of green and hard showed yellow instead of
  // red. Normalize the case so the badge color matches the real difficulty.
  const rawDiff = challenge?.difficulty || '';
  const diffKey = rawDiff ? rawDiff.charAt(0).toUpperCase() + rawDiff.slice(1).toLowerCase() : 'Medium';
  const diff = DIFFICULTY[diffKey] || DIFFICULTY.Medium;

  // Real previous challenges from the backend (`/weekly` now returns `previous`:
  // the actual past-week challenges, newest first). We deliberately do NOT
  // fabricate a placeholder list here anymore — the old hardcoded fallback
  // ("Binary Search Variants" etc.) invented titles that aren't in the bank and
  // falsely marked them "completed" for every visitor. When the field is absent
  // (older backend) or empty, we render an honest empty state instead.
  const previousChallenges = Array.isArray(challenge?.previous) ? challenge.previous : [];

  return (
    <div className="min-h-screen bg-bg-base p-4 md:p-8">
      <div className="max-w-7xl mx-auto">

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
          <Card
            as={motion.div}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
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
          </Card>
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
            <Card
              as={motion.div}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="relative overflow-hidden"
            >
              {/* Decorative gradient bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-rose-500 to-purple-500" />

              <div className="p-6 md:p-8">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <Badge className={clsx('px-3 py-1 text-xs', diff.bg, diff.text, diff.border)}>
                    {diff.label}
                  </Badge>
                  <Badge variant="warning" className="px-3 py-1 text-xs">
                    <Zap size={12} /> {challenge?.xp || 200} XP
                  </Badge>
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
            </Card>

            {/* Code editor section */}
            <Card
              as={motion.div}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="overflow-hidden"
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
                    'surface-code',
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
                <Button
                  as={motion.button}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSubmit}
                  disabled={submitting || !code.trim()}
                  className={clsx(
                    'bg-gradient-to-r from-orange-500 to-rose-500 text-white border-transparent shadow-lg shadow-orange-500/25',
                    'hover:shadow-xl hover:shadow-orange-500/30',
                    'disabled:cursor-not-allowed disabled:shadow-none'
                  )}
                >
                  {submitting ? (
                    <><Loader2 size={16} className="animate-spin" /> Submitting...</>
                  ) : (
                    <><Send size={16} /> Submit Solution</>
                  )}
                </Button>
              </div>
            </Card>

            {/* Submission result */}
            <AnimatePresence>
              {result && (() => {
                  // Backend returns status: passed|failed|rejected|already_completed|error.
                  // (Network-error fallback in handleSubmit sets {success:false,message}.)
                  const isPass = result.status === 'passed' || result.status === 'already_completed' || result.success === true;
                  const isBlocked = result.status === 'rejected' || result.status === 'error';
                  const tone = isPass ? 'green' : isBlocked ? 'amber' : 'red';
                  const tests = result.results || result.test_results || [];
                  const heading = result.status === 'already_completed' ? 'Already Completed'
                    : isPass ? 'Challenge Passed!'
                    : result.status === 'rejected' ? 'Submission Blocked'
                    : result.status === 'error' ? 'Hold On'
                    : 'Not Quite';
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: -10, height: 0 }}
                      className={clsx('rounded-2xl border p-5 backdrop-blur-sm',
                        tone === 'green' ? 'bg-green-500/10 border-green-500/20'
                        : tone === 'amber' ? 'bg-amber-500/10 border-amber-500/20'
                        : 'bg-red-500/10 border-red-500/20')}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        {isPass ? <CheckCircle2 size={20} className="text-green-400" />
                          : <AlertCircle size={20} className={tone === 'amber' ? 'text-amber-400' : 'text-red-400'} />}
                        <span className={clsx('font-semibold',
                          tone === 'green' ? 'text-green-400' : tone === 'amber' ? 'text-amber-400' : 'text-red-400')}>
                          {heading}
                        </span>
                        {typeof result.passed_tests === 'number' && typeof result.total_tests === 'number' && result.total_tests > 0 && (
                          <span className="text-xs text-text-muted">{result.passed_tests}/{result.total_tests} tests</span>
                        )}
                        {result.xp_awarded > 0 && (
                          <span className="ml-auto flex items-center gap-1 text-amber-400 text-sm font-semibold">
                            <Zap size={14} /> +{result.xp_awarded} XP
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-text-secondary">{result.message || result.feedback}</p>
                      {tests.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {tests.map((t, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              {t.passed ? <CheckCircle2 size={12} className="text-green-400 mt-0.5 shrink-0" />
                                : <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />}
                              <span className="flex-1 min-w-0">
                                <span className="text-text-secondary">{t.name}</span>
                                {!t.passed && t.expected !== undefined && (
                                  <span className="block text-text-muted">expected <code className="text-text-secondary">{String(t.expected)}</code>, got <code className="text-text-secondary">{String(t.got)}</code></span>
                                )}
                                {!t.passed && t.error && (
                                  <span className="block text-text-muted">error: {t.error}</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })()}
            </AnimatePresence>

            {/* Previous challenges */}
            <Card
              as={motion.div}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="p-4"
            >
              <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
                <Award size={18} className="text-purple-500" /> Previous Challenges
              </h3>
              <div className="space-y-2">
                {previousChallenges.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-text-muted">
                    Past weekly challenges will appear here.
                  </p>
                ) : previousChallenges.map((pc, i) => {
                  // Three honest states. Real past-week entries from the backend
                  // carry no `status` (the endpoint can't know per-user
                  // completion) → render neutrally, NOT as fake "completed" or
                  // "locked". A future per-user feed may set status explicitly.
                  const isCompleted = pc.status === 'completed';
                  const isLocked = pc.status === 'locked';
                  return (
                  <motion.div
                    key={pc.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + i * 0.05 }}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors',
                      isCompleted
                        ? 'bg-green-500/5 hover:bg-green-500/10 border border-green-500/10'
                        : isLocked
                          ? 'bg-bg-elevated border border-border-default opacity-60'
                          : 'bg-bg-elevated border border-border-default hover:bg-bg-elevated/70'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
                    ) : isLocked ? (
                      <Lock size={16} className="text-text-muted flex-shrink-0" />
                    ) : (
                      <Flame size={16} className="text-orange-400 flex-shrink-0" />
                    )}
                    <span className="flex-1 text-sm text-text-secondary">
                      {pc.title}
                      {pc.week_number != null && (
                        <span className="ml-2 text-xs text-text-muted">Week {pc.week_number}</span>
                      )}
                    </span>
                    <span className="text-xs text-amber-500 font-semibold flex items-center gap-1">
                      <Zap size={10} /> {pc.xp} XP
                    </span>
                    <ChevronRight size={14} className="text-text-muted" />
                  </motion.div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Right column: leaderboard */}
          <div className="space-y-4">
            <Card
              as={motion.div}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="sticky top-6 overflow-hidden"
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

              <div className="p-3 max-h-[520px] overflow-y-auto custom-scrollbar">
                {leaderboard.length > 0 ? (
                  <Table className="border-separate border-spacing-y-1">
                    <TBody>
                      {leaderboard.map((entry, i) => (
                        <LeaderboardRow key={entry.user_id || i} entry={entry} rank={i + 1} />
                      ))}
                    </TBody>
                  </Table>
                ) : (
                  <div className="py-10 text-center">
                    <Trophy size={32} className="mx-auto text-text-muted mb-3" />
                    <p className="text-sm text-text-muted">
                      No submissions yet. Be the first!
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
