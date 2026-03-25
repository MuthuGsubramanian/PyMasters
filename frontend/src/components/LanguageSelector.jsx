import { useState, useRef, useEffect } from 'react';
import { Globe, X } from 'lucide-react';
import { SUPPORTED_LANGUAGES, BLOCKED_LANGUAGES } from '../i18n/index.js';

/**
 * LanguageSelector
 * Props:
 *   currentLanguage {string}  — ISO code of the active language (default 'en')
 *   onSelect        {function} — called with (code) when a supported language is chosen
 */
export default function LanguageSelector({ currentLanguage = 'en', onSelect }) {
  const [open, setOpen] = useState(false);
  const [blockMessage, setBlockMessage] = useState('');
  const ref = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setBlockMessage('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === currentLanguage) ||
    SUPPORTED_LANGUAGES[0];

  function handleSelectSupported(code) {
    setBlockMessage('');
    setOpen(false);
    if (onSelect) onSelect(code);
  }

  function handleSelectBlocked(blockedEntry) {
    setBlockMessage(blockedEntry.message);
  }

  return (
    <div className="relative inline-block" ref={ref}>
      {/* Trigger Button */}
      <button
        onClick={() => {
          setOpen((prev) => !prev);
          setBlockMessage('');
        }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all duration-200 text-sm font-medium"
        aria-label="Select language"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Globe size={16} className="text-cyan-400 flex-shrink-0" />
        <span className="font-mono">{activeLang.flag}</span>
        <span>{activeLang.name}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          aria-label="Available languages"
          className="absolute right-0 mt-2 w-64 rounded-xl panel border border-white/10 shadow-2xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Language
            </span>
            <button
              onClick={() => { setOpen(false); setBlockMessage(''); }}
              className="text-slate-500 hover:text-white transition-colors"
              aria-label="Close language selector"
            >
              <X size={14} />
            </button>
          </div>

          {/* Supported Languages */}
          <ul className="py-1 max-h-72 overflow-y-auto">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const isActive = lang.code === currentLanguage;
              return (
                <li key={lang.code}>
                  <button
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handleSelectSupported(lang.code)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-150 ${
                      isActive
                        ? 'bg-cyan-500/10 text-cyan-400'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="text-base w-6 text-center">{lang.flag}</span>
                    <span className="flex-1 text-left">{lang.name}</span>
                    {isActive && (
                      <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </button>
                </li>
              );
            })}

            {/* Blocked Languages */}
            {BLOCKED_LANGUAGES.map((lang) => (
              <li key={lang.code}>
                <button
                  role="option"
                  aria-selected={false}
                  aria-disabled="true"
                  onClick={() => handleSelectBlocked(lang)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 cursor-pointer hover:bg-red-500/5 transition-colors duration-150 group"
                >
                  <span className="text-base w-6 text-center opacity-40">🚫</span>
                  <span className="flex-1 text-left line-through opacity-50">{lang.name}</span>
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-red-500/70 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                    Not Supported
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* Block Message */}
          {blockMessage && (
            <div className="px-4 py-3 bg-red-500/10 border-t border-red-500/20 text-red-400 text-xs leading-relaxed">
              {blockMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
