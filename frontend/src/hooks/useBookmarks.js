import { useState, useCallback } from 'react';

const STORAGE_KEY = 'pm_bookmarks';
const MAX_BOOKMARKS = 50;

/**
 * Reads bookmarks from localStorage.
 * @returns {Array<{id: string, title: string, type: string, path: string, timestamp: number}>}
 */
function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Writes bookmarks array to localStorage.
 * @param {Array<{id: string, title: string, type: string, path: string, timestamp: number}>} bookmarks
 */
function writeStorage(bookmarks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // localStorage full or unavailable — silent fail
  }
}

/**
 * Custom hook for managing a localStorage-backed bookmarks collection.
 *
 * Provides CRUD operations for bookmark items with a maximum capacity of 50.
 * Bookmarks persist across sessions via localStorage under the key 'pm_bookmarks'.
 *
 * @returns {{
 *   bookmarks: Array<{id: string, title: string, type: string, path: string, timestamp: number}>,
 *   addBookmark: (item: {id: string, title: string, type: string, path: string}) => void,
 *   removeBookmark: (id: string) => void,
 *   isBookmarked: (id: string) => boolean,
 *   toggleBookmark: (item: {id: string, title: string, type: string, path: string}) => void,
 * }}
 */
export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState(readStorage);

  /**
   * Add a bookmark item. Duplicate ids are ignored.
   * When the list exceeds MAX_BOOKMARKS the oldest entry is evicted.
   * @param {{id: string, title: string, type: string, path: string}} item
   */
  const addBookmark = useCallback((item) => {
    setBookmarks((prev) => {
      if (prev.some((b) => b.id === item.id)) return prev;

      const entry = {
        id: item.id,
        title: item.title,
        type: item.type,
        path: item.path,
        timestamp: Date.now(),
      };

      // Prepend new bookmark; trim oldest if over capacity
      const next = [entry, ...prev].slice(0, MAX_BOOKMARKS);
      writeStorage(next);
      return next;
    });
  }, []);

  /**
   * Remove a bookmark by its id.
   * @param {string} id
   */
  const removeBookmark = useCallback((id) => {
    setBookmarks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      writeStorage(next);
      return next;
    });
  }, []);

  /**
   * Check whether an item is currently bookmarked.
   * @param {string} id
   * @returns {boolean}
   */
  const isBookmarked = useCallback(
    (id) => bookmarks.some((b) => b.id === id),
    [bookmarks],
  );

  /**
   * Toggle a bookmark on or off.
   * @param {{id: string, title: string, type: string, path: string}} item
   */
  const toggleBookmark = useCallback(
    (item) => {
      if (bookmarks.some((b) => b.id === item.id)) {
        removeBookmark(item.id);
      } else {
        addBookmark(item);
      }
    },
    [bookmarks, addBookmark, removeBookmark],
  );

  return { bookmarks, addBookmark, removeBookmark, isBookmarked, toggleBookmark };
}
