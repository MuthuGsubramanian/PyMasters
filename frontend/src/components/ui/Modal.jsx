import { useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';

/**
 * Centered modal dialog with backdrop-click + Escape close and focus
 * trapping / restoration. Pass `title` to render the default header.
 */
export function Modal({ open, onClose, title, children, className = '' }) {
  const ref = useRef(null);
  useEscapeKey(onClose, open);
  useFocusTrap(ref, open);
  if (!open) return null;
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className={cn('w-full max-w-lg max-h-[85vh] overflow-y-auto panel rounded-2xl', className)}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-text-primary">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-text-muted hover:bg-bg-elevated hover:text-text-secondary"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {children}
      </motion.div>
    </motion.div>
  );
}

export default Modal;
