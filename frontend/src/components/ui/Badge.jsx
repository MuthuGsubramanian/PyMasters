import { cn } from '../../lib/cn';

const VARIANTS = {
  neutral: 'bg-bg-inset text-text-muted border-border-default',
  primary: 'bg-accent-subtle text-accent-primary border-accent-primary/30',
  success: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/25',
  warning: 'bg-amber-500/12 text-amber-600 dark:text-amber-300 border-amber-500/25',
  danger: 'bg-red-500/12 text-red-600 dark:text-red-300 border-red-500/25',
  info: 'bg-secondary/12 text-secondary border-secondary/25',
};

/** Small status/role/plan/tag pill. */
export function Badge({ variant = 'neutral', className = '', children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap',
        VARIANTS[variant] || VARIANTS.neutral,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;
