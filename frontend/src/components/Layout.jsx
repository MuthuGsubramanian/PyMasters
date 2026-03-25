import { useNavigate, useLocation, Outlet } from 'react-router-dom';
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
    Hexagon
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
    ];

    return (
        <div className="flex h-screen overflow-hidden bg-[var(--bg-deep)] text-slate-400 font-sans">
            {/* Sidebar */}
            <aside className="w-64 flex flex-col border-r border-white/5 bg-[#0b101b]">
                {/* Brand */}
                <div className="h-16 flex items-center gap-3 px-6 border-b border-white/5">
                    <div className="relative group cursor-pointer" onClick={() => navigate('/')}>
                        <div className="absolute inset-0 bg-cyan-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity" />
                        <div className="relative bg-gradient-to-br from-cyan-400 to-blue-600 w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-lg">
                            <Hexagon size={18} strokeWidth={2.5} />
                        </div>
                    </div>
                    <span className="font-display font-bold text-lg text-white tracking-tight">PYMASTERS</span>
                </div>

                {/* User Card */}
                <div className="p-4">
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 p-[1px]">
                                <div className="w-full h-full rounded-full bg-[#0b101b] flex items-center justify-center text-white font-bold text-sm">
                                    {user.username.substring(0, 2).toUpperCase()}
                                </div>
                            </div>
                            <div>
                                <div className="text-white font-bold text-sm">{user.username}</div>
                                <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold">
                                    {user.points > 1000 ? 'ARCHITECT' : user.points > 500 ? 'ENGINEER' : 'CADET'}
                                </div>
                            </div>
                        </div>
                        <div className="w-full bg-black/50 h-1.5 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500"
                                style={{ width: `${Math.min((user.points / 1000) * 100, 100)}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-[10px] mt-1 font-mono">
                            <span>{user.points} XP</span>
                            <span>NEXT: {user.points > 500 ? '1000' : '500'}</span>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-2 space-y-1">
                    <div className="text-xs font-bold text-slate-600 uppercase tracking-widest px-2 mb-2 mt-4">Mainframe</div>
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
                        return (
                            <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                className={clsx(
                                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                                    isActive
                                        ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                                        : "hover:bg-white/5 hover:text-white text-slate-400 border border-transparent"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <item.icon size={18} className={isActive ? "text-cyan-400" : "text-slate-500 group-hover:text-slate-300"} />
                                    {item.label}
                                </div>
                                {isActive && <motion.div layoutId="active-indicator" className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                            </button>
                        )
                    })}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-white/5">
                    <button
                        onClick={logout}
                        className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <LogOut size={14} /> TERMINATE SESSION
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#030712] to-[#030712]">
                {/* Subtle Grid Background */}
                <div className="absolute inset-0 bg-grid-pattern opacity-[0.2] pointer-events-none" />

                <div className="p-8 max-w-7xl mx-auto relative z-10 min-h-full">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
