import { useNavigate, useLocation, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard,
    BookOpen,
    Map,
    GraduationCap,
    LogOut,
    Hexagon,
    Sparkles,
    Zap,
    Trophy,
    ChevronRight
} from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

export default function Layout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    if (!user) return <Outlet />;

    const navItems = [
        { icon: LayoutDashboard, label: 'Overview', path: '/dashboard', desc: 'Your command center' },
        { icon: BookOpen, label: 'Learning Path', path: '/dashboard/learn', desc: 'Module progression' },
        { icon: Map, label: 'Learning Paths', path: '/dashboard/paths', desc: 'AI-adaptive journeys' },
        { icon: GraduationCap, label: 'Classroom', path: '/dashboard/classroom', desc: 'AI-guided lessons' },
        { icon: Sparkles, label: 'Playground', path: '/dashboard/playground', desc: 'Free-form chat' },
    ];

    const rank = user.points > 1000 ? 'ARCHITECT' : user.points > 500 ? 'ENGINEER' : 'CADET';
    const rankColors = {
        CADET: { bg: 'bg-cyan-500/10', text: 'text-cyan-600', border: 'border-cyan-200' },
        ENGINEER: { bg: 'bg-purple-500/10', text: 'text-purple-600', border: 'border-purple-200' },
        ARCHITECT: { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-200' },
    };
    const rc = rankColors[rank];
    const nextMilestone = user.points > 1000 ? 2000 : user.points > 500 ? 1000 : 500;
    const progressPct = Math.min((user.points / nextMilestone) * 100, 100);

    return (
        <div className="flex h-screen overflow-hidden bg-[var(--bg-deep)] text-slate-600 font-sans">
            {/* Sidebar */}
            <aside className="w-[270px] flex flex-col border-r border-black/[0.05] bg-white/95 backdrop-blur-xl">
                {/* Brand */}
                <div className="h-16 flex items-center gap-3 px-6 border-b border-black/[0.05]">
                    <div className="relative group cursor-pointer" onClick={() => navigate('/')}>
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-purple-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
                        <div className="relative bg-gradient-to-br from-cyan-400 to-blue-600 w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 transition-transform duration-300 group-hover:scale-110">
                            <Hexagon size={18} strokeWidth={2.5} />
                        </div>
                    </div>
                    <span className="font-display font-bold text-lg text-slate-900 tracking-tight">PYMASTERS</span>
                </div>

                {/* User Card */}
                <div className="p-4">
                    <div className="rounded-2xl p-4 bg-gradient-to-br from-slate-50 to-white border border-black/[0.04] shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                            {/* Avatar with animated ring */}
                            <div className="relative">
                                <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-tr from-cyan-500 via-blue-500 to-purple-500">
                                    <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-slate-700 font-bold text-sm">
                                        {user.username.substring(0, 2).toUpperCase()}
                                    </div>
                                </div>
                                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-white shadow-sm" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-slate-900 font-bold text-sm truncate">{user.username}</div>
                                <div className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${rc.bg} ${rc.text} ${rc.border}`}>
                                    <Zap size={8} />
                                    {rank}
                                </div>
                            </div>
                        </div>

                        {/* XP Progress */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-mono">
                                <span className="text-slate-500 flex items-center gap-1">
                                    <Trophy size={10} className="text-amber-500" />
                                    {user.points} XP
                                </span>
                                <span className="text-slate-400">{nextMilestone} XP</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progressPct}%` }}
                                    transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-2 mt-2">Navigation</div>
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
                        return (
                            <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                className={clsx(
                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-300 group relative",
                                    isActive
                                        ? "bg-gradient-to-r from-cyan-50 to-blue-50/50 text-cyan-700 font-semibold"
                                        : "hover:bg-slate-50 text-slate-500 hover:text-slate-700"
                                )}
                            >
                                {/* Active indicator bar */}
                                {isActive && (
                                    <motion.div
                                        layoutId="sidebar-active"
                                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-gradient-to-b from-cyan-400 to-blue-500 shadow-[0_0_6px_rgba(6,182,212,0.5)]"
                                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                    />
                                )}

                                <div className={clsx(
                                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300",
                                    isActive
                                        ? "bg-cyan-500/10 text-cyan-600"
                                        : "text-slate-400 group-hover:text-slate-600 group-hover:bg-slate-100"
                                )}>
                                    <item.icon size={17} className="transition-transform duration-300 group-hover:scale-110" />
                                </div>

                                <div className="flex-1 text-left">
                                    <div className="text-sm font-medium leading-tight">{item.label}</div>
                                    {isActive && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            className="text-[10px] text-cyan-500/70 mt-0.5"
                                        >
                                            {item.desc}
                                        </motion.div>
                                    )}
                                </div>

                                {isActive && (
                                    <ChevronRight size={14} className="text-cyan-400" />
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-black/[0.05] space-y-3">
                    <button
                        onClick={logout}
                        className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all duration-300 border border-transparent hover:border-red-100"
                    >
                        <LogOut size={14} /> Sign Out
                    </button>
                    <div className="flex items-center justify-center gap-3 pt-1">
                        <Link to="/terms" className="text-[10px] text-slate-400 hover:text-cyan-600 transition-colors">Terms</Link>
                        <span className="text-slate-200 text-[10px]">&middot;</span>
                        <Link to="/privacy" className="text-[10px] text-slate-400 hover:text-cyan-600 transition-colors">Privacy</Link>
                        <span className="text-slate-200 text-[10px]">&middot;</span>
                        <Link to="/security" className="text-[10px] text-slate-400 hover:text-cyan-600 transition-colors">Security</Link>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto relative bg-gradient-to-b from-slate-50 via-[#f0f4f8] to-[#e8eef4]">
                <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
                    style={{
                        backgroundImage: `
                            linear-gradient(rgba(6,182,212,0.4) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(6,182,212,0.4) 1px, transparent 1px)
                        `,
                        backgroundSize: '60px 60px',
                    }}
                />
                <div className="p-8 max-w-7xl mx-auto relative z-10 min-h-full">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
