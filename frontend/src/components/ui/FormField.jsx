import { useId } from 'react';

/**
 * Labelled form row. Associates a real <label> with the control (fixes the
 * placeholder-as-label antipattern). `children` may be a node or a render
 * function receiving the generated id: `{(id) => <input id={id} />}`.
 */
export function FormField({ label, hint, children, className = '' }) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-text-secondary mb-1.5">
          {label}
        </label>
      )}
      {typeof children === 'function' ? children(id) : children}
      {hint && <p className="text-[11px] text-text-muted mt-1">{hint}</p>}
    </div>
  );
}

export default FormField;
