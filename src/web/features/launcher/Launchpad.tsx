import type { Bookmark } from '@shared/api/types';

import { ArrowRight, LoaderCircle, RefreshCw, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuthContext } from '@nav/features/auth/useAuthContext';

import { LauncherBookmarkContent } from './LauncherBookmarkContent';

function Tile({ bookmark }: { bookmark: Bookmark }) {
  return (
    <a
      href={bookmark.url}
      target="_blank"
      rel="noreferrer"
      title={bookmark.title}
      className="group flex min-w-0 flex-col items-center gap-2.5 rounded-lg border border-border bg-card p-4 text-center transition hover:-translate-y-0.5 hover:border-primary"
    >
      <LauncherBookmarkContent bookmark={bookmark} />
    </a>
  );
}

export function Launchpad({
  bookmarks,
  hasMore,
  loading,
  loadingMore,
  error,
  onRetry,
  onLoadMore,
  onOpenWorkspace,
}: {
  bookmarks: Bookmark[];
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpenWorkspace: () => void;
}) {
  const { authed } = useAuthContext();
  if (loading) {
    return (
      <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (error && bookmarks.length === 0) {
    return (
      <div className="w-full rounded-lg border border-border bg-card px-6 py-8 text-center">
        <p className="text-sm font-medium">常用书签加载失败</p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="size-4" />
          重试
        </Button>
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="w-full rounded-lg border border-dashed border-border bg-card/60 px-6 py-10 text-center">
        <Star className="mx-auto size-6 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium">{authed ? '还没有常用书签' : '暂无公开常用书签'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {authed
            ? '在书签柜中选择「加入常用」，书签就会出现在这里。'
            : '前往书签柜浏览公开书签，或登录查看私有内容。'}
        </p>
        <Button size="sm" className="mt-4" onClick={onOpenWorkspace}>
          前往书签柜
          <ArrowRight className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <section className="w-full" aria-labelledby="launchpad-heading">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Star className="size-4 text-primary" />
        <h2 id="launchpad-heading" className="font-display text-sm font-semibold">
          常用书签
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          {bookmarks.length}
          {hasMore ? '+' : ''}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
        {bookmarks.map((bookmark) => (
          <Tile key={bookmark.id} bookmark={bookmark} />
        ))}
      </div>
      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
            {loadingMore ? '加载中…' : '加载更多书签'}
          </Button>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-center text-xs text-destructive">{error}</p> : null}
    </section>
  );
}
