import { cn } from '../../lib/cn';

/** Horizontally-scrollable table shell. */
export function Table({ className = '', children }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-sm', className)}>{children}</table>
    </div>
  );
}

export function THead({ children }) {
  return (
    <thead>
      <tr className="text-left text-xs text-text-muted border-b border-border-default">{children}</tr>
    </thead>
  );
}

export function TH({ className = '', children }) {
  return <th className={cn('px-4 py-2 font-semibold', className)}>{children}</th>;
}

export function TBody({ children }) {
  return <tbody className="divide-y divide-border-default">{children}</tbody>;
}

export function TR({ className = '', ...props }) {
  return <tr className={cn(className)} {...props} />;
}

export function TD({ className = '', children, ...props }) {
  return (
    <td className={cn('px-4 py-2.5', className)} {...props}>
      {children}
    </td>
  );
}

export default Table;
