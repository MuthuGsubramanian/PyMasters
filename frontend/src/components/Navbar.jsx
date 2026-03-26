import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Trophy, LogOut, Hexagon } from 'lucide-react';
import { motion } from 'framer-motion';
import NotificationBell from './NotificationBell';

export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    if (!user) return null;

    return (
        <motion.nav
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            className="sticky top-0 z-50 px-6 py-4 glass border-b border-white/5 backdrop-blur-xl bg-black/40"
        >
            <div className="max-w-7xl mx-auto flex justify-between items-center">
                <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate('/dashboard')}>
                    <div className="relative">
                        <div className="absolute inset-0 bg-cyan-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
                        <div className="bg-gradient-to-br from-cyan-400 to-blue-600 w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg relative z-10">
                            <Hexagon size={24} strokeWidth={2} />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-widest font-mono text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 group-hover:to-cyan-200 transition-all">
                            PYMASTERS
                        </h1>
                        <p className="text-[10px] text-cyan-400 tracking-[0.2em] uppercase font-bold">
                            {user.points > 1000 ? 'Architect Class' : user.points > 500 ? 'Engineer Class' : 'Cadet Class'}
                        </p>
                    </div>
                </div>

                <div className="flex gap-6 items-center">
                    <div className="hidden md:flex items-center gap-3 bg-slate-900/80 px-4 py-1.5 rounded-full border border-white/5 shadow-inner">
                        <Trophy size={14} className="text-yellow-400" />
                        <div className="flex flex-col leading-none">
                            <span className="font-mono text-yellow-100 font-bold text-sm">{user.points || 0} XP</span>
                            <span className="text-[9px] text-gray-500 uppercase">Current Score</span>
                        </div>
                    </div>

                    <div className="h-8 w-[1px] bg-white/10 hidden md:block"></div>

                    <div className="flex items-center gap-3">
                        <NotificationBell />
                        <div className="text-right hidden sm:block">
                            <div className="text-xs text-gray-400">Operator</div>
                            <div className="text-sm font-bold text-white leading-none">{user.username}</div>
                        </div>
                        <button
                            onClick={logout}
                            className="p-2 hover:bg-red-500/10 text-gray-400 hover:text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
                            title="Disconnect"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>
            </div>
        </motion.nav>
    );
}
