import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

// Browsers open these pickers only from their small icon; learners click anywhere in the field.
const PICKER_TYPES = new Set(['date', 'time', 'datetime-local', 'month', 'week']);

/** Text input styled via `.input-neo`. Date/time types open their native picker on any click. */
export const Input = forwardRef(function Input({ className = '', type, onClick, ...props }, ref) {
  const handleClick = (e) => {
    if (PICKER_TYPES.has(type) && !props.disabled && !props.readOnly) {
      try { e.currentTarget.showPicker?.(); } catch { /* not allowed (e.g. cross-origin iframe) — icon still works */ }
    }
    onClick?.(e);
  };
  return <input ref={ref} type={type} className={cn('input-neo', className)} onClick={handleClick} {...props} />;
});

export default Input;
