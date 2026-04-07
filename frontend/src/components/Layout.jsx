import { useState, useMemo } from 'react';
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
    BookOpen
} from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import PymastersIcon from '../assets/pymasters-icon.svg';
import GlobalSearch from './GlobalSearch';
import DarkModeToggle from './DarkModeToggle';
import ReleaseNotes from './ReleaseNotes';

export default function Layout() {
    const { user, logout, activeOrg } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    if (!user) return <Outlet />;

    const navItems = useMemo(() => {
        const items = [
            { icon: LayoutDashboard, label: 'Overview', path: '/dashboard', desc: 'Your command center' },
            { icon: Map, label: 'Evolution', path: '/dashboard/paths', desc: 'Your AI learning journey' },
            { icon: GraduationCap, label: 'Classroom', path: '/dashboard/classroom', desc: 'AI-guided lessons' },
            { icon: Sparkles, label: 'Playground', path: '/dashboard/playground', desc: 'Free-form chat' },
            { icon: TrendingUp, label: 'Trending', path: '/dashboard/trending', desc: 'AI & Python trends' },
            { icon: Swords, label: 'Challenges', path: '/dashboard/challenges', desc: 'Weekly coding battles' },
            { icon: BookOpen, label: 'Reference', path: '/dashboard/reference', desc: 'Quick cheat sheets' },
        ];
        if (activeOrg) {
            items.push({ icon: Building2, label: 'Organization', path: '/dashboard/org', desc: 'Manage your org' });
        }
        items.push({ icon: User, label: 'Profile', path: '/dashboard/profile', desc: 'Your settings' });
        return items;
    }, [activeOrg]);

    const rank = user.points > 1000 ? 'ARCHITECT' : user.points > 500 ? 'ENGINEER' : 'CADET';
    const rankColors = {
        CADET: { bg: 'bg-cyan-500/10', text: 'text-cyan-600', border: 'border-cyan-200' },
        ENGINEER: { bg: 'bg-purple-500/10', text: 'text-purple-600', border: 'border-purple-200' },
        ARCHITECT: { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-200' },
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
            <aside className={`fixed lg:relative z-50 lg:z-auto w-[270px] flex flex-col border-r border-border-default bg-bg-surface backdrop-blur-xl h-full transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
                {/* Brand */}
                <div className="h-14 flex items-center gap-3 px-5 border-b border-border-default">
                    <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1.5 rounded-lg hover:bg-bg-elevated transition-colors mr-1" aria-label="Close menu">
                        <X size={18} className="text-text-muted" />
                    </button>
                    <div className="relative group cursor-pointer" onClick={() => navigate('/')}>
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-cyan-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500 scale-150" />
                        <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20 transition-transform duration-300 group-hover:scale-110 border border-white/10">
                            <img src={PymastersIcon} alt="PyMasters" className="w-5 h-5" style={{ filter: 'brightness(2)' }} />
                        </div>
                    </div>
                    <span className="font-display font-bold text-base text-text-primary tracking-tight">PYMASTERS</span>
                </div>

                {/* Compact User Row */}
                <div className="px-4 py-3 border-b border-border-default">
                    <div className="flex items-center gap-2.5">
                        <div className="relative cursor-pointer" onClick={() => navigate('/dashboard/profile')}>
                            <div className="w-7 h-7 rounded-full p-[1.5px] bg-gradient-to-tr from-cyan-500 via-blue-500 to-purple-500">
                                <div className="w-full h-full rounded-full bg-bg-surface flex items-center justify-center text-text-secondary font-bold text-[10px]">
                                    {user.username.substring(0, 2).toUpperCase()}
                                </div>
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-[1.5px] border-bg-surface" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-text-primary font-bold text-xs truncate">{user.username}</div>
                        </div>
                        <div className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full border ${rc.bg} ${rc.text} ${rc.border}`}>
                            <Zap size={7} />
                            {rank}
                        </div>
                        <span className="text-[10px] font-mono text-text-muted flex items-center gap-0.5">
                            <Trophy size={9} className="text-amber-500" />
                            {user.points}
                        </span>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
                    <div className="text-[9px] font-bold text-text-muted uppercase tracking-widest px-3 mb-1.5 mt-1">Navigation</div>
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
                        return (
                            <button
                                key={item.path}
                                onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                                className={clsx(
                                    "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 group relative",
                                    isActive
                                        ? "bg-accent-subtle text-accent-primary font-semibold"
                                        : "hover:bg-bg-elevated text-text-muted hover:text-text-secondary"
                                )}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="sidebar-active"
                                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-cyan-400 to-blue-500 shadow-[0_0_6px_rgba(6,182,212,0.5)]"
                                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                    />
                                )}
                                <item.icon size={16} className="transition-transform duration-200 group-hover:scale-110 shrink-0" />
                                <span className="text-sm font-medium leading-tight">{item.label}</span>
                                {isActive && <ChevronRight size={13} className="text-accent-primary ml-auto" />}
                            </button>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="px-3 py-2.5 border-t border-border-default space-y-1.5">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={logout}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold text-text-muted hover:text-red-500 hover:bg-red-50 transition-all duration-200 border border-transparent hover:border-red-100"
                        >
                            <LogOut size={13} /> Sign Out
                        </button>
                        <DarkModeToggle />
                    </div>
                    <div className="flex items-center justify-center gap-3">
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
                    <Outlet />
                </div>
            </main>

            <GlobalSearch />
            <ReleaseNotes />
        </div>
    );
}
