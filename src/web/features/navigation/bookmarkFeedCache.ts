import type { Bookmark } from '@shared/api/types';

/** Page-owned change propagation. Patches live only as long as an older read needs them. */
export function createBookmarkFeedCache() {
  const listeners = new Set<(bookmark: Bookmark) => void>();
  const reads = new Set<Map<number, Bookmark>>();
  return {
    subscribe(listener: (bookmark: Bookmark) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    apply(bookmark: Bookmark) {
      for (const patches of reads) patches.set(bookmark.id, bookmark);
      for (const listener of listeners) listener(bookmark);
    },
    beginRead(signal?: AbortSignal) {
      const patches = new Map<number, Bookmark>();
      const finish = () => {
        reads.delete(patches);
        patches.clear();
        signal?.removeEventListener('abort', finish);
      };
      if (!signal?.aborted) {
        reads.add(patches);
        signal?.addEventListener('abort', finish, { once: true });
      }
      return {
        reconcile: (items: Bookmark[]) => items.map((item) => patches.get(item.id) ?? item),
        finish,
      };
    },
  };
}

export type BookmarkFeedCache = ReturnType<typeof createBookmarkFeedCache>;
