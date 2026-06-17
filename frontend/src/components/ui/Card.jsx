import { cn } from '../../lib/cn';

/** Surface card. Pass `interactive` for hover affordance. */
export function Card({ as: Tag = 'div', className = '', interactive = false, children, ...props }) {
  return (
    <Tag
      className={cn(
        'bg-bg-surface backdrop-blur-xl rounded-2xl border border-border-default',
        interactive && 'transition-all hover:border-border-strong hover:shadow-cyan',
        className,
      )}
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
