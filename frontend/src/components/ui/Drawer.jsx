import { useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';

/**
 * Right-side slide-over with a header, backdrop-click + Escape close, and
 * focus trapping / restoration. Use for admin detail panels.
 */
export function Drawer({ open, onClose, title, children, className = '' }) {
  const ref = useRef(null);
  useEscapeKey(onClose, open);
  useFocusTrap(ref, open);
  if (!open) return null;
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex justify-end bg-black/40 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        className={cn(
          'w-full max-w-md h-full overflow-y-auto bg-bg-surface border-l border-border-default shadow-2xl',
          className,
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default sticky top-0 bg-bg-surface/95 backdrop-blur z-10">
          <h2 className="font-display font-bold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-text-muted hover:bg-bg-elevated hover:text-text-secondary"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </motion.aside>
    </motion.div>
  );
}

export default Drawer;
