import { useNavigate, useLocation, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard,
    BookOpen,
    GraduationCap,
    LogOut,
    Settings,
    ChevronRight,
    Terminal,
    Zap,
    Hexagon,
    Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

export default function Layout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    if (!user) return <Outlet />;

    const navItems = [
        { icon: LayoutDashboard, label: 'Overview', path: '/dashboard' },
        { icon: BookOpen, label: 'Learning Path', path: '/dashboard/learn' },
        { icon: GraduationCap, label: 'Classroom', path: '/dashboard/classroom' },
        { icon: Sparkles, label: 'Playground', path: '/dashboard/playground' },
    ];

    return (
        <div className="flex h-screen overflow-hidden bg-[var(--bg-deep)] text-slate-600 font-sans">
            {/* Sidebar */}
            <aside className="w-64 flex flex-col border-r border-black/[0.06] bg-white/90 backdrop-blur-xl">
                {/* Brand */}
                <div className="h-16 flex items-center gap-3 px-6 border-b border-black/[0.06]">
                    <div className="relative group cursor-pointer" onClick={() => navigate('/')}>
                        <div className="absolute inset-0 bg-cyan-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity" />
                        <div className="relative bg-gradient-to-br from-cyan-400 to-blue-600 w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-lg">
                            <Hexagon size={18} strokeWidth={2.5} />
                        </div>
                    </div>
                    <span className="font-display font-bold text-lg text-slate-900 tracking-tight">PYMASTERS</span>
                </div>

                {/* User Card */}
                <div className="p-4">
                    <div className="bg-slate-50 rounded-xl p-4 border border-black/[0.06]">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 p-[1px]">
                                <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-slate-700 font-bold text-sm">
                                    {user.username.substring(0, 2).toUpperCase()}
                                </div>
                            </div>
                            <div>
                                <div className="text-slate-900 font-bold text-sm">{user.username}</div>
                                <div className="text-[10px] uppercase tracking-wider text-cyan-600 font-bold">
                                    {user.points > 1000 ? 'ARCHITECT' : user.points > 500 ? 'ENGINEER' : 'CADET'}
                                </div>
                            </div>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500"
                                style={{ width: `${Math.min((user.points / 1000) * 100, 100)}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-[10px] mt-1 font-mono text-slate-500">
                            <span>{user.points} XP</span>
                            <span>NEXT: {user.points > 500 ? '1000' : '500'}</span>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-2 space-y-1">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2 mb-2 mt-4">Mainframe</div>
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
                        return (
                            <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                className={clsx(
                                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                                    isActive
                                        ? "bg-cyan-50 text-cyan-700 border border-cyan-200 shadow-sm"
                                        : "hover:bg-slate-100 hover:text-slate-800 text-slate-500 border border-transparent"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <item.icon size={18} className={isActive ? "text-cyan-600" : "text-slate-400 group-hover:text-slate-600"} />
                                    {item.label}
                                </div>
                                {isActive && <motion.div layoutId="active-indicator" className="w-1.5 h-1.5 rounded-full bg-cyan-500" />}
                            </button>
                        )
                    })}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-black/[0.06] space-y-2">
                    <button
                        onClick={logout}
                        className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 transition-colors"
                    >
                        <LogOut size={14} /> TERMINATE SESSION
                    </button>
                    <div className="flex items-center justify-center gap-3 pt-1">
                        <Link to="/terms" className="text-[10px] text-slate-400 hover:text-cyan-600 transition-colors">Terms</Link>
                        <span className="text-slate-300 text-[10px]">&middot;</span>
                        <Link to="/privacy" className="text-[10px] text-slate-400 hover:text-cyan-600 transition-colors">Privacy</Link>
                        <span className="text-slate-300 text-[10px]">&middot;</span>
                        <Link to="/security" className="text-[10px] text-slate-400 hover:text-cyan-600 transition-colors">Security</Link>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto relative bg-gradient-to-b from-slate-50 via-[#f0f4f8] to-[#e8eef4]">
                {/* Subtle Grid Background */}
                <div className="absolute inset-0 bg-grid-pattern opacity-[0.04] pointer-events-none" />

                <div className="p-8 max-w-7xl mx-auto relative z-10 min-h-full">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
