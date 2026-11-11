import type { Bookmark } from '@shared/api/types';

export type FeedState = {
  key: string;
  items: Bookmark[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  loaded: boolean;
  error: string | null;
};

/** Page-owned change propagation. Patches live only as long as an older read needs them. */
export function createBookmarkFeedCache() {
  const listeners = new Set<(bookmark: Bookmark) => void>();
  const reads = new Set<Map<number, Bookmark>>();
  const snapshots = new Map<string, FeedState>();
  let contentVersion = 0;
  let commonVersion = 0;
  return {
    snapshots,
    invalidate(version: number, pinnedVersion: number) {
      if (contentVersion !== version) snapshots.clear();
      else if (commonVersion !== pinnedVersion) {
        for (const key of snapshots.keys()) if (JSON.parse(key)[3]) snapshots.delete(key);
      }
      contentVersion = version;
      commonVersion = pinnedVersion;
    },
    subscribe(listener: (bookmark: Bookmark) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    apply(bookmark: Bookmark) {
      for (const patches of reads) patches.set(bookmark.id, bookmark);
      for (const [key, value] of snapshots) {
        snapshots.set(key, {
          ...value,
          items: value.items.map((item) => (item.id === bookmark.id ? bookmark : item)),
        });
      }
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
