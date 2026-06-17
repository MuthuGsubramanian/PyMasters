import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

/** Native select styled via `.input-neo`. */
export const Select = forwardRef(function Select({ className = '', children, ...props }, ref) {
  return (
    <select ref={ref} className={cn('input-neo cursor-pointer', className)} {...props}>
      {children}
    </select>
  );
});

export default Select;
