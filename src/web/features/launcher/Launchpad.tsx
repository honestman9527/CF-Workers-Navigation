import type { Bookmark } from '@shared/api/types';

import { ArrowRight, RefreshCw, Star } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Tile({ bookmark }: { bookmark: Bookmark }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [bookmark.iconUrl]);
  const icon =
    failed || !bookmark.iconUrl ? (
      <span className="text-base font-semibold text-primary">
        {(bookmark.title.charAt(0) || '?').toUpperCase()}
      </span>
    ) : (
      <img
        src={bookmark.iconUrl}
        alt=""
        className="size-6 rounded"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  return (
    <a
      href={bookmark.url}
      target="_blank"
      rel="noreferrer"
      title={bookmark.title}
      className="group flex min-w-0 flex-col items-center gap-2.5 rounded-[1.1rem] border border-border/70 bg-card p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-soft"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-border/70 bg-muted">
        {icon}
      </span>
      <span className="w-full min-w-0">
        <span className="block truncate text-sm font-medium">{bookmark.title}</span>
        <span className="block truncate font-mono text-[10px] text-muted-foreground">
          {domainOf(bookmark.url)}
        </span>
      </span>
    </a>
  );
}

export function Launchpad({
  bookmarks,
  loading,
  error,
  onRetry,
  onOpenWorkspace,
}: {
  bookmarks: Bookmark[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenWorkspace: () => void;
}) {
  if (loading) {
    return (
      <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-[1.1rem] bg-muted" />
        ))}
      </div>
    );
  }

  if (error && bookmarks.length === 0) {
    return (
      <div className="w-full rounded-[1.1rem] border border-border/70 bg-card px-6 py-8 text-center">
        <p className="text-sm font-medium">常用网站加载失败</p>
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
      <div className="w-full rounded-[1.1rem] border border-dashed border-border bg-card/60 px-6 py-10 text-center">
        <Star className="mx-auto size-6 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium">还没有常用网站</p>
        <p className="mt-1 text-xs text-muted-foreground">
          在书签柜里把书签「置顶」，它就会出现在这里。
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
          常用网站
        </h2>
        <span className="font-mono text-[10px] text-muted-foreground">{bookmarks.length}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
        {bookmarks.map((bookmark) => (
          <Tile key={bookmark.id} bookmark={bookmark} />
        ))}
      </div>
    </section>
  );
}
