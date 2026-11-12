import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard,
    Map,
    GraduationCap,
    LogOut,
    Sparkles,
    Gamepad2,
    Zap,
    Trophy,
    ChevronRight,
    Menu,
    X,
    User,
    TrendingUp,
    CalendarClock,
    Building2,
    Swords,
    BookOpen,
    Shield,
    Brain,
    Lightbulb
} from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import PymastersGlyph from '../assets/pymasters-glyph.svg';
import GlobalSearch from './GlobalSearch';
import DarkModeToggle from './DarkModeToggle';
import ReleaseNotes from './ReleaseNotes';
import VaathiyaarPanel from './VaathiyaarPanel';
import UnlockToast from '../arcade/UnlockToast';
import { getAdminCheck, getProfileStats, getAccessStatus } from '../api';
import useI18n from '../hooks/useI18n';
import useOrgBranding from '../hooks/useOrgBranding';
import useAudience from '../hooks/useAudience';
import { registerAndroidBackHandler } from '../lib/androidBack';

export default function Layout() {
    const { user, logout, activeOrg } = useAuth();
    const { t } = useI18n();
    // Org portal branding: this is the single instance that writes the theme
    // tokens (--accent-primary / --primary / --secondary) for the active org
    // and clears them when activeOrg goes away (logout / org switch).
    const { branding } = useOrgBranding({ applyTheme: true });
    // Org members see their organisation's name (saved portal name, else the org's own name).
    const audience = useAudience();
    const portalName = audience.orgName || 'PYMASTERS';
    const portalLogo = branding?.logo_url?.trim() || '';
    const isCustomBrand = portalName !== 'PYMASTERS';
    const navigate = useNavigate();
    const location = useLocation();
    useEffect(() => {
        document.documentElement.dataset.audience = audience.mode;
        return () => { delete document.documentElement.dataset.audience; };
    }, [audience.mode]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const mainRef = useRef(null);
    // Reset inner <main> scroll position on route navigation so new screens start at top.
    useEffect(() => {
        if (mainRef.current) {
            mainRef.current.scrollTo({ top: 0, behavior: 'instant' });
        }
    }, [location.pathname]);
    // Close mobile sidebar drawer on Android System Back before navigating history.
    useEffect(() => {
        if (!sidebarOpen) return undefined;
        return registerAndroidBackHandler(() => {
            setSidebarOpen(false);
            return true;
        });
    }, [sidebarOpen]);
    // Desktop-only collapsed (icon-rail) state. Default false preserves the full
    // sidebar everywhere; child pages (e.g. Classroom during a lesson) can request
    // collapse via the Outlet context below.
    const [collapsed, setCollapsed] = useState(false);
    // Pages that mount their own Vaathiyaar chat surface (Classroom during a
    // lesson has a context-aware chat with hints) request the global floating
    // panel to hide via the Outlet context, so learners never see two
    // overlapping chat launchers.
    const [vaathiyaarHidden, setVaathiyaarHidden] = useState(false);
    const [isSuper, setIsSuper] = useState(false);
    useEffect(() => {
        if (user?.id) getAdminCheck(user.id).then((r) => setIsSuper(!!r.data?.is_super_admin)).catch(() => {});
    }, [user?.id]);

    // The cached `user.points` (from login/localStorage) goes stale the moment the
    // user earns XP elsewhere in the session, so the sidebar badge + rank showed a
    // lower value (e.g. 50 / CADET) than the authoritative /stats total_xp (95)
    // that the Dashboard, Profile and Community all display. Fetch live total_xp on
    // mount (and on route change, since XP-earning lands the user back in the shell)
    // and use it for the badge/rank, falling back to user.points if the call fails.
    const [liveXp, setLiveXp] = useState(null);
    // Only XP-earning surfaces can change total_xp, so refetch on mount and when
    // LEAVING one of those routes — not on every navigation (live-QA 2026-07-02
    // saw /stats + /admin/check re-fire 3-4x per click). Cuts the sidebar's
    // per-navigation calls to ~zero on read-only routes while keeping the badge
    // fresh right after a lesson/challenge/playground session.
    const XP_ROUTES = '/dashboard/classroom|/dashboard/challenges|/dashboard/playground';
    const prevPathRef = useRef(location.pathname);
    useEffect(() => {
        if (!user?.id) return;
        const prev = prevPathRef.current;
        const cameFromXpRoute = new RegExp(XP_ROUTES).test(prev);
        const firstLoad = prev === location.pathname;
        prevPathRef.current = location.pathname;
        if (firstLoad || cameFromXpRoute) {
            getProfileStats(user.id)
                .then((r) => { const xp = r.data?.total_xp; if (Number.isFinite(xp)) setLiveXp(xp); })
                .catch(() => {});
        }
    }, [user?.id, location.pathname]);

    // Instant badge update on XP award — Classroom dispatches pm:xp-earned when
    // /evaluate returns xp_earned, so the chip no longer waits for the learner
    // to navigate away before reflecting the new total. Refetches (rather than
    // adds) so the badge always shows the server truth.
    useEffect(() => {
        if (!user?.id) return;
        const onXp = () => {
            getProfileStats(user.id)
                .then((r) => { const xp = r.data?.total_xp; if (Number.isFinite(xp)) setLiveXp(xp); })
                .catch(() => {});
        };
        window.addEventListener('pm:xp-earned', onXp);
        return () => window.removeEventListener('pm:xp-earned', onXp);
    }, [user?.id]);

    // Trial/plan access (2026-07-02): individual users get a 7-day trial from
    // signup. During the trial show a countdown chip; once expired, route to
    // the upgrade page (backend also enforces via 402 on learning endpoints).
    // Org members / super admins / assigned plans come back "active" — no chip.
    const [access, setAccess] = useState(null);
    useEffect(() => {
        // Once per session (per user) — trial state changes at day granularity,
        // so per-route refetching would only add network chatter.
        if (user?.id) getAccessStatus(user.id)
            .then((r) => setAccess(r.data))
            .catch(() => {});
    }, [user?.id]);
    useEffect(() => {
        if (access?.status === 'expired' && location.pathname !== '/dashboard/upgrade') {
            navigate('/dashboard/upgrade', { replace: true });
        }
    }, [access?.status, location.pathname, navigate]);

    // NOTE: keep ALL hooks above the `if (!user)` early-return below. The
    // navItems useMemo previously sat *after* that early-return, so when `user`
    // flipped truthy->falsy on a still-mounted Layout (e.g. clicking Logout from
    // any dashboard route), the hook count dropped and React threw "Rendered
    // more hooks than during the previous render", white-screening the app.
    const navItems = useMemo(() => {
        const items = [
            { icon: LayoutDashboard, label: t('nav.overview', 'Overview'), path: '/dashboard', desc: t('nav.overview.desc', 'Your command center') , group: 'learn' },
            { icon: Map, label: t('nav.evolution', 'Learning Paths'), path: '/dashboard/paths', desc: t('nav.evolution.desc', 'Structured roadmaps from school to pro') , group: 'learn' },
            { icon: Brain, label: t('nav.knowledge', 'Knowledge Map'), path: '/dashboard/knowledge', desc: t('nav.knowledge.desc', 'What you know, mapped live') , group: 'learn' },
            { icon: GraduationCap, label: t('nav.classroom', 'Classroom'), path: '/dashboard/classroom', desc: t('nav.classroom.desc', 'AI-guided lessons') , group: 'learn' },
            { icon: Sparkles, label: t('nav.playground', 'Playground'), path: '/dashboard/playground', desc: t('nav.playground.desc', 'Free-form chat') , group: 'learn' },
            { icon: Gamepad2, label: t('nav.play', 'Play'), path: '/dashboard/play', desc: t('nav.play.desc', 'Learn while you play') , group: 'practice' },
            { icon: TrendingUp, label: t('nav.trending', 'Trending'), path: '/dashboard/trending', desc: t('nav.trending.desc', 'AI & Python trends') , group: 'explore' },
            { icon: Swords, label: t('nav.challenges', 'Challenges'), path: '/dashboard/challenges', desc: t('nav.challenges.desc', 'Weekly coding battles') , group: 'practice' },
            { icon: BookOpen, label: t('nav.reference', 'Reference'), path: '/dashboard/reference', desc: t('nav.reference.desc', 'Quick cheat sheets') , group: 'explore' },
            { icon: Lightbulb, label: t('nav.explains', 'Explains'), path: '/dashboard/explains', desc: t('nav.explains.desc', 'Visual concept essays') , group: 'explore' },
            { icon: Trophy, label: t('nav.community', 'Community'), path: '/dashboard/community', desc: t('nav.community.desc', 'Rankings & members') , group: 'explore' },
            { icon: CalendarClock, label: t('nav.live_tutor', 'Live Tutor'), path: '/dashboard/live-tutor', desc: t('nav.live_tutor.desc', 'Book a 1-on-1 session') , group: 'explore' },
        ];
        if (activeOrg) {
            items.push({ icon: Swords, label: t('nav.compete', 'Compete'), path: '/dashboard/org-compete', desc: t('nav.compete.desc', 'Org challenges & leaderboard') , group: 'practice' });
        }
        // Managers (the instructor role) open the console too: it grants them the learner and analytics tabs.
        if (activeOrg && ['super_admin', 'admin', 'manager'].includes(activeOrg.role)) {
            items.push({
                icon: Building2,
                label: t('nav.org_console', '{group} console').replace('{group}', audience.labels.group),
                path: '/dashboard/org', desc: t('nav.org_admin.desc', 'Members, invites & analytics'), group: 'manage',
            });
        }
        if (isSuper) {
            items.push({ icon: Shield, label: t('nav.super_admin', 'Super Admin'), path: '/dashboard/admin', desc: t('nav.super_admin.desc', 'Platform monitoring & control'), group: 'manage' });
        }
        items.push({ icon: User, label: t('nav.profile', 'Profile'), path: '/dashboard/profile', desc: t('nav.profile.desc', 'Your settings') , group: 'account' });
        return items;
    }, [activeOrg, isSuper, t, audience.labels.group]);

    // Sidebar sections, in reading order; a section with no items (e.g. Manage for a learner) is not shown.
    const navGroups = useMemo(() => [
        ['manage', t('nav.group.manage', 'Manage')],
        ['learn', t('nav.group.learn', 'Learn')],
        ['practice', t('nav.group.practice', 'Practice')],
        ['explore', t('nav.group.explore', 'Explore')],
        ['account', t('nav.group.account', 'Account')],
    ].map(([key, title]) => ({ key, title, items: navItems.filter((i) => i.group === key) }))
        .filter((g) => g.items.length > 0), [navItems, t]);

    // All hooks above this line run unconditionally on every render.
    if (!user) return <Outlet />;

    const points = liveXp != null ? liveXp : (user.points || 0);
    const rank = points > 1000 ? 'ARCHITECT' : points > 500 ? 'ENGINEER' : 'CADET';
    // Game ranks suit individual learners; schools see levels, companies see neither.
    const rankLabel = audience.mode === 'education' ? `Level ${{ CADET: 1, ENGINEER: 2, ARCHITECT: 3 }[rank]}` : rank;
    const displayName = String(user.name || user.username || '');
    const rankColors = {
        CADET: { bg: 'bg-cyan-500/10', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-500/30' },
        ENGINEER: { bg: 'bg-purple-500/10', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-500/30' },
        ARCHITECT: { bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-500/30' },
    };
    const rc = rankColors[rank];

    const mobileQuickTabs = [
        {
            key: 'home',
            label: t('nav.mobile.home', 'Home'),
            icon: LayoutDashboard,
            path: '/dashboard',
            active: location.pathname === '/dashboard',
        },
        {
            key: 'learn',
            label: t('nav.mobile.learn', 'Learn'),
            icon: GraduationCap,
            path: '/dashboard/classroom',
            active: location.pathname.startsWith('/dashboard/classroom'),
        },
        {
            key: 'paths',
            label: t('nav.mobile.paths', 'Paths'),
            icon: Map,
            path: '/dashboard/paths',
            active: location.pathname.startsWith('/dashboard/paths'),
        },
        {
            key: 'code',
            label: t('nav.mobile.code', 'Code'),
            icon: Sparkles,
            path: '/dashboard/playground',
            active: location.pathname.startsWith('/dashboard/playground'),
        },
    ];
    const isSecondaryMobileRoute =
        !mobileQuickTabs.some((tab) => tab.active) && location.pathname.startsWith('/dashboard');

    return (
        <div className="flex h-[100dvh] w-full max-w-full overflow-hidden bg-bg-base text-text-secondary font-sans">
            {/* Mobile header bar */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-bg-surface/95 backdrop-blur-xl border-b border-border-default flex items-center justify-between px-3 gap-2">
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="min-w-10 min-h-10 p-2 rounded-lg hover:bg-bg-elevated transition-colors flex items-center justify-center shrink-0"
                    aria-label="Open menu"
                >
                    <Menu size={20} className="text-text-muted" />
                </button>
                <button
                    type="button"
                    onClick={() => navigate('/dashboard')}
                    className="font-display font-bold text-sm sm:text-base text-text-primary tracking-tight truncate max-w-[50vw]"
                >
                    {portalName}
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-mono text-text-muted inline-flex items-center gap-1 px-2 py-1 rounded-full bg-bg-elevated border border-border-default" title="XP">
                        <Trophy size={12} className="text-amber-500" aria-hidden="true" />
                        {points}
                    </span>
                    <button
                        type="button"
                        onClick={() => navigate('/dashboard/profile')}
                        aria-label="Open profile"
                        className="min-w-9 min-h-9 flex items-center justify-center rounded-full"
                    >
                        <span className="w-7 h-7 rounded-full p-[1.5px] bg-gradient-to-tr from-cyan-500 via-blue-500 to-purple-500 block">
                            <span className="w-full h-full rounded-full bg-bg-surface flex items-center justify-center text-text-secondary font-bold text-xs">
                                {displayName.substring(0, 2).toUpperCase()}
                            </span>
                        </span>
                    </button>
                </div>
            </div>

            {/* Mobile overlay */}
            {sidebarOpen && (
                <div className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Sidebar */}
            <aside className={clsx(
                "fixed lg:relative z-50 lg:z-auto w-[270px] flex flex-col border-r border-border-default bg-bg-surface backdrop-blur-xl h-full transition-all duration-300",
                collapsed ? "lg:w-[74px]" : "lg:w-[270px]",
                sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}>
                {/* Brand */}
                <div className={clsx("h-14 flex items-center gap-3 border-b border-border-default", collapsed ? "px-5 lg:px-0 lg:justify-center" : "px-5")}>
                    <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1.5 rounded-lg hover:bg-bg-elevated transition-colors mr-1" aria-label="Close menu">
                        <X size={18} className="text-text-muted" />
                    </button>
                    <button type="button" onClick={() => navigate('/')} aria-label="PyMasters home" className="relative group cursor-pointer">
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-cyan-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500 scale-150" aria-hidden="true" />
                        {portalLogo ? (
                            <img src={portalLogo} alt={portalName} className="relative w-8 h-8 rounded-xl object-contain bg-bg-elevated border border-border-default" />
                        ) : (
                            <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20 transition-transform duration-300 group-hover:scale-110 border border-white/10">
                                <img src={PymastersGlyph} alt="" aria-hidden="true" className="w-[18px] h-[18px]" />
                            </div>
                        )}
                    </button>
                    <span className={clsx("flex flex-col leading-tight min-w-0", collapsed && "lg:hidden")}>
                        <span className="font-display font-bold text-base text-text-primary tracking-tight truncate">{portalName}</span>
                        {isCustomBrand && branding?.show_powered_by !== false && (
                            <span className="text-xs text-text-muted tracking-wide">Powered by PyMasters</span>
                        )}
                    </span>
                </div>

                {/* Compact User Row */}
                <div className={clsx("py-3 border-b border-border-default", collapsed ? "px-4 lg:px-0" : "px-4")}>
                    <div className={clsx("flex items-center gap-2.5", collapsed && "lg:justify-center lg:gap-0")}>
                        <button type="button" onClick={() => navigate('/dashboard/profile')} aria-label="Your profile" className="relative cursor-pointer">
                            <div className="w-7 h-7 rounded-full p-[1.5px] bg-gradient-to-tr from-cyan-500 via-blue-500 to-purple-500">
                                <div className="w-full h-full rounded-full bg-bg-surface flex items-center justify-center text-text-secondary font-bold text-xs">
                                    {displayName.substring(0, 2).toUpperCase()}
                                </div>
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-[1.5px] border-bg-surface" aria-hidden="true" />
                        </button>
                        <div className={clsx("flex-1 min-w-0", collapsed && "lg:hidden")}>
                            <div className="text-text-primary font-bold text-sm truncate" title={user.username}>{displayName}</div>
                        </div>
                        {audience.mode !== 'professional' && (
                            <div className={clsx("inline-flex items-center gap-1 text-xs uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full border", rc.bg, rc.text, rc.border, collapsed && "lg:hidden")}>
                                <Zap size={10} aria-hidden="true" />
                                {rankLabel}
                            </div>
                        )}
                        <span className={clsx("text-xs font-mono text-text-muted flex items-center gap-0.5", collapsed && "lg:hidden")} title="XP">
                            <Trophy size={11} className="text-amber-500" aria-hidden="true" />
                            {points}
                        </span>
                    </div>
                    {/* 7-day trial countdown (individual users only; hidden for
                        org/admin/assigned-plan users whose status is "active") */}
                    {access?.status === 'trial' && (
                        <button
                            type="button"
                            onClick={() => navigate('/dashboard/upgrade')}
                            className={clsx(
                                "mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 hover:bg-amber-400/20 transition-colors",
                                collapsed && "lg:hidden"
                            )}
                        >
                            <Zap size={9} aria-hidden="true" />
                            Trial · {access.trial_days_left} day{access.trial_days_left === 1 ? '' : 's'} left
                        </button>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto" aria-label="Primary">
                    <div className={clsx("flex items-center mb-1.5 mt-1", collapsed ? "px-3 lg:px-0 lg:justify-center" : "px-3")}>
                        <span className={clsx("text-xs font-bold text-text-muted uppercase tracking-widest", collapsed && "lg:hidden")}>Navigation</span>
                        <button
                            type="button"
                            onClick={() => setCollapsed((c) => !c)}
                            className="hidden lg:inline-flex ml-auto p-1 rounded-md hover:bg-bg-elevated text-text-muted hover:text-text-secondary transition-colors"
                            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            <ChevronRight size={14} className={clsx("transition-transform", !collapsed && "rotate-180")} />
                        </button>
                    </div>
                    {navGroups.map((group, gi) => (
                        <div key={group.key} role="group" aria-labelledby={`nav-group-${group.key}`} className={clsx(gi > 0 && "pt-2")}>
                            <h2 id={`nav-group-${group.key}`}
                                className={clsx("px-3 pt-1 pb-1 text-xs font-semibold uppercase tracking-wider text-text-muted", collapsed && "lg:sr-only")}>
                                {group.title}
                            </h2>
                            {collapsed && gi > 0 && <div className="hidden lg:block mx-3 mb-1 border-t border-border-default" aria-hidden="true" />}
                            {group.items.map((item) => {
                                const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path + '/'));
                                return (
                                    <button
                                        key={item.path}
                                        onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                                        aria-current={isActive ? 'page' : undefined}
                                        title={item.desc}
                                        className={clsx(
                                            "w-full flex items-center gap-2.5 py-1.5 rounded-lg text-sm transition-all duration-200 group relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60",
                                            collapsed ? "px-3 lg:px-0 lg:justify-center" : "px-3",
                                            isActive
                                                ? "bg-accent-subtle text-accent-primary font-semibold"
                                                : "hover:bg-bg-elevated text-text-muted hover:text-text-secondary"
                                        )}
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="sidebar-active"
                                                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-primary shadow-[0_0_6px_rgba(124,58,237,0.5)]"
                                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                            />
                                        )}
                                        <item.icon size={16} className="transition-transform duration-200 group-hover:scale-110 shrink-0" />
                                        <span className={clsx("text-sm font-medium leading-tight", collapsed && "lg:hidden")}>{item.label}</span>
                                        {isActive && <ChevronRight size={13} className={clsx("text-accent-primary ml-auto", collapsed && "lg:hidden")} />}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                {/* Footer */}
                <div className="px-3 py-2.5 border-t border-border-default space-y-1.5">
                    <div className={clsx("flex items-center gap-2", collapsed && "lg:flex-col")}>
                        <button
                            onClick={logout}
                            title="Sign Out"
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold text-text-muted hover:text-red-500 hover:bg-red-50 transition-all duration-200 border border-transparent hover:border-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
                        >
                            <LogOut size={13} /> <span className={clsx(collapsed && "lg:hidden")}>Sign Out</span>
                        </button>
                        <DarkModeToggle />
                    </div>
                    <div className={clsx("flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1", collapsed && "lg:hidden")}>
                        <a
                            href="https://t.me/boost/PyMasterscommunity"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline transition-colors"
                        >
                            Telegram
                        </a>
                        <span className="text-text-muted text-xs" aria-hidden="true">&middot;</span>
                        <Link to="/terms" className="text-xs text-text-muted hover:text-accent-primary transition-colors">Terms</Link>
                        <span className="text-text-muted text-xs" aria-hidden="true">&middot;</span>
                        <Link to="/privacy" className="text-xs text-text-muted hover:text-accent-primary transition-colors">Privacy</Link>
                        <span className="text-text-muted text-xs" aria-hidden="true">&middot;</span>
                        <Link to="/security" className="text-xs text-text-muted hover:text-accent-primary transition-colors">Security</Link>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main
                ref={mainRef}
                className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch] relative bg-gradient-to-b from-bg-elevated via-bg-base to-bg-base pt-14 pb-20 lg:pt-0 lg:pb-0"
            >
                <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
                    style={{
                        backgroundImage: `
                            linear-gradient(rgba(6,182,212,0.4) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(6,182,212,0.4) 1px, transparent 1px)
                        `,
                        backgroundSize: '60px 60px',
                    }}
                />
                <div className="px-3.5 py-4 sm:p-6 max-w-7xl mx-auto relative z-10 min-h-full">
                    <Outlet context={{ sidebarCollapsed: collapsed, setSidebarCollapsed: setCollapsed, setVaathiyaarHidden }} />
                </div>
            </main>

            {/* Mobile Thumb-Zone Bottom Quick Navigation Bar */}
            <nav
                aria-label="Mobile quick navigation"
                className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-bg-surface/95 backdrop-blur-xl border-t border-border-default grid grid-cols-5 items-stretch px-1"
            >
                {mobileQuickTabs.map((tab) => {
                    const TabIcon = tab.icon;
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => {
                                setSidebarOpen(false);
                                navigate(tab.path);
                            }}
                            aria-current={tab.active ? 'page' : undefined}
                            className={clsx(
                                'flex flex-col items-center justify-center gap-0.5 rounded-xl my-1 transition-colors',
                                tab.active
                                    ? 'text-accent-primary bg-accent-subtle font-semibold'
                                    : 'text-text-muted hover:text-text-secondary'
                            )}
                        >
                            <TabIcon size={18} aria-hidden="true" />
                            <span className="text-xs leading-tight truncate max-w-full px-1">{tab.label}</span>
                        </button>
                    );
                })}
                <button
                    type="button"
                    onClick={() => setSidebarOpen((open) => !open)}
                    aria-expanded={sidebarOpen}
                    className={clsx(
                        'flex flex-col items-center justify-center gap-0.5 rounded-xl my-1 transition-colors',
                        sidebarOpen || isSecondaryMobileRoute
                            ? 'text-accent-primary bg-accent-subtle font-semibold'
                            : 'text-text-muted hover:text-text-secondary'
                    )}
                >
                    <Menu size={18} aria-hidden="true" />
                    <span className="text-xs leading-tight truncate max-w-full px-1">{t('nav.mobile.more', 'More')}</span>
                </button>
            </nav>

            <GlobalSearch />
            <ReleaseNotes />
            <UnlockToast />
            {!vaathiyaarHidden && <VaathiyaarPanel />}
        </div>
    );
}
