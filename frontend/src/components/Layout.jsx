import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard,
    Map,
    GraduationCap,
    LogOut,
    Sparkles,
    Zap,
    Trophy,
    ChevronRight,
    Menu,
    X,
    User,
    TrendingUp,
    Building2,
    Swords,
    BookOpen,
    Shield,
    Brain
} from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import PymastersGlyph from '../assets/pymasters-glyph.svg';
import GlobalSearch from './GlobalSearch';
import DarkModeToggle from './DarkModeToggle';
import ReleaseNotes from './ReleaseNotes';
import { getAdminCheck, getProfileStats, getAccessStatus } from '../api';

export default function Layout() {
    const { user, logout, activeOrg } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    // Desktop-only collapsed (icon-rail) state. Default false preserves the full
    // sidebar everywhere; child pages (e.g. Classroom during a lesson) can request
    // collapse via the Outlet context below.
    const [collapsed, setCollapsed] = useState(false);
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
    useEffect(() => {
        if (user?.id) getProfileStats(user.id)
            .then((r) => { const xp = r.data?.total_xp; if (Number.isFinite(xp)) setLiveXp(xp); })
            .catch(() => {});
    }, [user?.id, location.pathname]);

    // Trial/plan access (2026-07-02): individual users get a 7-day trial from
    // signup. During the trial show a countdown chip; once expired, route to
    // the upgrade page (backend also enforces via 402 on learning endpoints).
    // Org members / super admins / assigned plans come back "active" — no chip.
    const [access, setAccess] = useState(null);
    useEffect(() => {
        if (user?.id) getAccessStatus(user.id)
            .then((r) => setAccess(r.data))
            .catch(() => {});
    }, [user?.id, location.pathname]);
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
            { icon: LayoutDashboard, label: 'Overview', path: '/dashboard', desc: 'Your command center' },
            { icon: Map, label: 'Evolution', path: '/dashboard/paths', desc: 'Your AI learning journey' },
            { icon: Brain, label: 'Knowledge Map', path: '/dashboard/knowledge', desc: "What you know, mapped live" },
            { icon: GraduationCap, label: 'Classroom', path: '/dashboard/classroom', desc: 'AI-guided lessons' },
            { icon: Sparkles, label: 'Playground', path: '/dashboard/playground', desc: 'Free-form chat' },
            { icon: TrendingUp, label: 'Trending', path: '/dashboard/trending', desc: 'AI & Python trends' },
            { icon: Swords, label: 'Challenges', path: '/dashboard/challenges', desc: 'Weekly coding battles' },
            { icon: BookOpen, label: 'Reference', path: '/dashboard/reference', desc: 'Quick cheat sheets' },
            { icon: Trophy, label: 'Community', path: '/dashboard/community', desc: 'Rankings & members' },
        ];
        if (activeOrg) {
            items.push({ icon: Swords, label: 'Compete', path: '/dashboard/org-compete', desc: 'Org challenges & leaderboard' });
        }
        if (activeOrg && (activeOrg.role === 'super_admin' || activeOrg.role === 'admin')) {
            items.push({ icon: Building2, label: 'Admin Console', path: '/dashboard/org', desc: 'Members, invites & analytics' });
        }
        if (isSuper) {
            items.push({ icon: Shield, label: 'Super Admin', path: '/dashboard/admin', desc: 'Platform monitoring & control' });
        }
        items.push({ icon: User, label: 'Profile', path: '/dashboard/profile', desc: 'Your settings' });
        return items;
    }, [activeOrg, isSuper]);

    // All hooks above this line run unconditionally on every render.
    if (!user) return <Outlet />;

    const points = liveXp != null ? liveXp : (user.points || 0);
    const rank = points > 1000 ? 'ARCHITECT' : points > 500 ? 'ENGINEER' : 'CADET';
    const rankColors = {
        CADET: { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-300', border: 'border-cyan-500/30' },
        ENGINEER: { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-300', border: 'border-purple-500/30' },
        ARCHITECT: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-300', border: 'border-amber-500/30' },
    };
    const rc = rankColors[rank];

    return (
        <div className="flex h-screen overflow-hidden bg-bg-base text-text-secondary font-sans">
            {/* Mobile header bar */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-bg-surface backdrop-blur-xl border-b border-border-default flex items-center justify-between px-4">
                <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-bg-elevated transition-colors" aria-label="Open menu">
                    <Menu size={20} className="text-text-muted" />
                </button>
                <span className="font-display font-bold text-text-primary tracking-tight">PYMASTERS</span>
                <div className="w-9" /> {/* Spacer for centering */}
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
                        <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20 transition-transform duration-300 group-hover:scale-110 border border-white/10">
                            <img src={PymastersGlyph} alt="" aria-hidden="true" className="w-[18px] h-[18px]" />
                        </div>
                    </button>
                    <span className={clsx("font-display font-bold text-base text-text-primary tracking-tight", collapsed && "lg:hidden")}>PYMASTERS</span>
                </div>

                {/* Compact User Row */}
                <div className={clsx("py-3 border-b border-border-default", collapsed ? "px-4 lg:px-0" : "px-4")}>
                    <div className={clsx("flex items-center gap-2.5", collapsed && "lg:justify-center lg:gap-0")}>
                        <button type="button" onClick={() => navigate('/dashboard/profile')} aria-label="Your profile" className="relative cursor-pointer">
                            <div className="w-7 h-7 rounded-full p-[1.5px] bg-gradient-to-tr from-cyan-500 via-blue-500 to-purple-500">
                                <div className="w-full h-full rounded-full bg-bg-surface flex items-center justify-center text-text-secondary font-bold text-[10px]">
                                    {user.username.substring(0, 2).toUpperCase()}
                                </div>
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-[1.5px] border-bg-surface" aria-hidden="true" />
                        </button>
                        <div className={clsx("flex-1 min-w-0", collapsed && "lg:hidden")}>
                            <div className="text-text-primary font-bold text-xs truncate">{user.username}</div>
                        </div>
                        <div className={clsx("inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full border", rc.bg, rc.text, rc.border, collapsed && "lg:hidden")}>
                            <Zap size={7} />
                            {rank}
                        </div>
                        <span className={clsx("text-[10px] font-mono text-text-muted flex items-center gap-0.5", collapsed && "lg:hidden")}>
                            <Trophy size={9} className="text-amber-500" />
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
                                "mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-500 hover:bg-amber-400/20 transition-colors",
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
                        <span className={clsx("text-[9px] font-bold text-text-muted uppercase tracking-widest", collapsed && "lg:hidden")}>Navigation</span>
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
                    {navItems.map((item) => {
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
                    <div className={clsx("flex items-center justify-center gap-3", collapsed && "lg:hidden")}>
                        <Link to="/terms" className="text-[9px] text-text-disabled hover:text-accent-primary transition-colors">Terms</Link>
                        <span className="text-text-disabled text-[9px]">&middot;</span>
                        <Link to="/privacy" className="text-[9px] text-text-disabled hover:text-accent-primary transition-colors">Privacy</Link>
                        <span className="text-text-disabled text-[9px]">&middot;</span>
                        <Link to="/security" className="text-[9px] text-text-disabled hover:text-accent-primary transition-colors">Security</Link>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto relative bg-gradient-to-b from-bg-elevated via-bg-base to-bg-base pt-14 lg:pt-0">
                <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
                    style={{
                        backgroundImage: `
                            linear-gradient(rgba(6,182,212,0.4) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(6,182,212,0.4) 1px, transparent 1px)
                        `,
                        backgroundSize: '60px 60px',
                    }}
                />
                <div className="p-6 max-w-7xl mx-auto relative z-10 min-h-full">
                    <Outlet context={{ sidebarCollapsed: collapsed, setSidebarCollapsed: setCollapsed }} />
                </div>
            </main>

            <GlobalSearch />
            <ReleaseNotes />
        </div>
    );
}
