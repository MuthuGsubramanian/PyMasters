import { cn } from '../../lib/cn';

/** Surface card. Pass `interactive` for hover affordance. When `interactive`
 *  is combined with an `onClick` on the default <div>, the card becomes a proper
 *  keyboard-operable control (role="button", tabIndex=0, Enter/Space activation)
 *  so mouse-only users aren't the only ones who can trigger it (WCAG 2.1.1 / 4.1.2).
 *  Cards rendered as a native control (e.g. as={motion.button}) or non-interactive
 *  cards that only use onClick for stopPropagation are left untouched. */
export function Card({
  as: Tag = 'div',
  className = '',
  interactive = false,
  children,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  ...props
}) {
  const isButtonCard = interactive && typeof onClick === 'function' && Tag === 'div';

  const handleKeyDown = (e) => {
    if (isButtonCard && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(e);
    }
    onKeyDown?.(e);
  };

  return (
    <Tag
      className={cn(
        'bg-bg-surface backdrop-blur-xl rounded-2xl border border-border-default',
        interactive && 'transition-all hover:border-border-strong hover:shadow-cyan',
        className,
      )}
      onClick={onClick}
      onKeyDown={isButtonCard || onKeyDown ? handleKeyDown : undefined}
      role={isButtonCard ? role ?? 'button' : role}
      tabIndex={isButtonCard ? tabIndex ?? 0 : tabIndex}
      {...props}
    >
      {children}
    </Tag>
  );
}

/** Compact metric card (label / value / optional icon + hint). */
export function StatCard({ label, value, icon: Icon, hint, className = '' }) {
  return (
    <Card className={cn('p-4 flex items-start gap-3', className)}>
      {Icon && (
        <div className="w-9 h-9 rounded-xl bg-accent-subtle text-accent-primary flex items-center justify-center shrink-0">
          <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
        <p className="text-2xl font-bold font-display text-text-primary leading-tight">{value}</p>
        {hint && <p className="text-xs text-text-muted mt-0.5">{hint}</p>}
      </div>
    </Card>
  );
}

export default Card;
