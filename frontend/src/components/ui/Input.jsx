import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

/** Text input styled via `.input-neo`. */
export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={cn('input-neo', className)} {...props} />;
});

export default Input;
