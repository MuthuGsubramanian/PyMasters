import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class strings, resolving conflicts (last wins). */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default cn;
