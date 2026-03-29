import { Bookmark } from 'lucide-react';
import { motion } from 'framer-motion';
import { useBookmarks } from '../hooks/useBookmarks';

/**
 * A small animated bookmark toggle button.
 *
 * Renders a Bookmark icon that fills/unfills on toggle with a spring animation.
 * A native tooltip displays "Bookmark" or "Remove bookmark" based on current state.
 *
 * @param {{
 *   item: { id: string, title: string, type: string, path: string },
 *   className?: string,
 * }} props
 */
export default function BookmarkButton({ item, className = '' }) {
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const active = isBookmarked(item.id);

  return (
    <motion.button
      type="button"
      title={active ? 'Remove bookmark' : 'Bookmark'}
      aria-label={active ? `Remove bookmark for ${item.title}` : `Bookmark ${item.title}`}
      onClick={(e) => {
        e.stopPropagation();
        toggleBookmark(item);
      }}
      whileTap={{ scale: 0.8 }}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-200 ${
        active
          ? 'text-amber-500 bg-amber-50 hover:bg-amber-100'
          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
      } ${className}`}
    >
      <motion.div
        initial={false}
        animate={{ scale: active ? [1, 1.3, 1] : 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <Bookmark
          size={16}
          fill={active ? 'currentColor' : 'none'}
          strokeWidth={active ? 2.5 : 2}
        />
      </motion.div>
    </motion.button>
  );
}
