import { Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import useDarkMode from '../hooks/useDarkMode';

export default function DarkModeToggle() {
    const { isDark, toggle } = useDarkMode();

    return (
        <button
            onClick={toggle}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-bg-elevated hover:bg-border-strong transition-colors duration-300"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            <motion.div
                key={isDark ? 'sun' : 'moon'}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
            >
                {isDark ? (
                    <Sun size={16} className="text-amber-400" />
                ) : (
                    <Moon size={16} className="text-slate-500" />
                )}
            </motion.div>
        </button>
    );
}
