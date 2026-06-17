import { cn } from '../../lib/cn';

const BASE =
  'inline-flex items-center justify-center gap-2 font-bold rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none';
const VARIANTS = {
  primary: 'btn-neo btn-neo-primary',
  ghost: 'btn-neo btn-neo-ghost',
  danger: 'btn-neo-danger',
  outline:
    'border border-border-strong text-text-secondary hover:border-accent-primary hover:text-text-primary bg-bg-surface',
  link: 'text-accent-primary hover:underline underline-offset-4 font-semibold',
};
const SIZES = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-5 py-2.5',
  lg: 'text-sm px-6 py-3.5',
  icon: 'p-2 rounded-lg',
};

/** Button or link (`as="a"` / `as={Link}`) with shared variants + sizes. */
export function Button({ as: Tag = 'button', variant = 'primary', size = 'md', className = '', children, ...props }) {
  return (
    <Tag className={cn(BASE, VARIANTS[variant] || VARIANTS.primary, SIZES[size], className)} {...props}>
      {children}
    </Tag>
  );
}

export default Button;
