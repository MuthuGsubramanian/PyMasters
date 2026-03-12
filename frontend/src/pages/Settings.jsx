import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { saveSettings } from '../api';
import { Settings as SettingsIcon, Key, CheckCircle2, User, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Settings() {
    const { user } = useAuth();
    const [hfToken, setHfToken] = useState(() => localStorage.getItem('pm_hf_token') || '');
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveSettings(user.id, hfToken);
            localStorage.setItem('pm_hf_token', hfToken);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error('Settings save error:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleClear = () => {
        setHfToken('');
        localStorage.removeItem('pm_hf_token');
        setSaved(false);
    };

    return (
        <div className="animate-fade-in max-w-3xl mx-auto space-y-8">
            <header>
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                    <SettingsIcon size={28} className="text-cyan-400" />
                    Settings
                </h1>
                <p className="text-slate-400">Configure your PyMasters environment.</p>
            </header>

            {/* Profile Section */}
            <div className="panel rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex items-center gap-2">
                    <User size={16} className="text-cyan-400" />
                    <span className="text-sm font-bold text-white uppercase tracking-wider">Profile</span>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Username</label>
                            <div className="input-neo bg-white/5 cursor-not-allowed text-slate-400">{user.username}</div>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Name</label>
                            <div className="input-neo bg-white/5 cursor-not-allowed text-slate-400">{user.name || user.username}</div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Total XP</label>
                            <div className="input-neo bg-white/5 cursor-not-allowed text-cyan-400 font-mono">{user.points || 0}</div>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Rank</label>
                            <div className="input-neo bg-white/5 cursor-not-allowed text-cyan-400 font-mono uppercase">
                                {user.points > 1000 ? 'Architect' : user.points > 500 ? 'Engineer' : 'Cadet'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* API Token Section */}
            <div className="panel rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex items-center gap-2">
                    <Key size={16} className="text-yellow-400" />
                    <span className="text-sm font-bold text-white uppercase tracking-wider">API Configuration</span>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-2">
                            HuggingFace API Token
                        </label>
                        <input
                            type="password"
                            className="input-neo w-full"
                            placeholder="hf_..."
                            value={hfToken}
                            onChange={e => { setHfToken(e.target.value); setSaved(false); }}
                        />
                        <p className="text-[10px] text-slate-600 mt-1.5">
                            Override the default API token for AI features. Stored locally in your browser.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="btn-neo btn-neo-primary text-sm py-2 px-6"
                        >
                            {saving ? 'Saving...' : 'Save Token'}
                        </button>
                        {hfToken && (
                            <button
                                onClick={handleClear}
                                className="btn-neo btn-neo-ghost text-sm py-2 px-4"
                            >
                                Clear
                            </button>
                        )}
                        {saved && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-center gap-1.5 text-green-400 text-xs font-bold"
                            >
                                <CheckCircle2 size={14} /> Token saved for this session.
                            </motion.div>
                        )}
                    </div>
                </div>
            </div>

            {/* Security Info */}
            <div className="panel rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex items-center gap-2">
                    <Shield size={16} className="text-green-400" />
                    <span className="text-sm font-bold text-white uppercase tracking-wider">Security</span>
                </div>
                <div className="p-6">
                    <div className="text-xs text-slate-500 space-y-2">
                        <p>API tokens are stored locally in your browser and are never sent to third parties.</p>
                        <p>Passwords are hashed server-side. Session tokens are ephemeral.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
