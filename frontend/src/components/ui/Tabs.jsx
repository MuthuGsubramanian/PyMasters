import { cn } from '../../lib/cn';

/**
 * Accessible tab strip. `tabs`: [{ key, label, icon? }]. Arrow keys move
 * between tabs; only the active tab is in the tab order (roving tabindex).
 */
export function Tabs({ tabs, active, onChange, className = '' }) {
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.key === active);
    if (i < 0) return;
    if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length].key);
    if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length].key);
  };
  return (
    <div
      role="tablist"
      onKeyDown={onKey}
      className={cn('flex gap-1 bg-bg-surface rounded-xl p-1 border border-border-default w-fit', className)}
    >
      {tabs.map((t) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              selected
                ? 'bg-gradient-primary text-white shadow-glow'
                : 'text-text-muted hover:text-text-secondary',
            )}
          >
            {t.icon && <t.icon className="w-4 h-4" aria-hidden="true" />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
