import { cn } from '../../lib/cn';

const SIZES = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
};

/** Initials avatar with the brand gradient. */
export function Avatar({ name = '', size = 'md', className = '' }) {
  const initials = name.trim().slice(0, 2).toUpperCase() || '??';
  return (
    <div
      className={cn(
        'rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold shrink-0 select-none',
        SIZES[size] || SIZES.md,
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

export default Avatar;
