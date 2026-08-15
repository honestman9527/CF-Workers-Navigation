import type { Bookmark } from '@nav/api/types';

import { ExternalLink, Pencil, Star, Trash2 } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { extractDomain } from '@nav/utils/bookmarks';

export const BookmarkCard = memo(function BookmarkCard({
  bookmark,
  categoryLabel,
  viewMode = 'grid',
  onEdit,
  onDelete,
  onTogglePin,
}: {
  bookmark: Bookmark;
  categoryLabel?: string;
  viewMode?: 'grid' | 'list';
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: number) => void;
  onTogglePin: (bookmark: Bookmark) => void;
}) {
  const domain = useMemo(() => extractDomain(bookmark.url), [bookmark.url]);
  const initial = domain.charAt(0).toUpperCase() || '?';
  const [iconFailed, setIconFailed] = useState(false);

  useEffect(() => {
    setIconFailed(false);
  }, [bookmark.iconUrl]);

  const showFallback = !bookmark.iconUrl || iconFailed;

  const adminActions = (
    <div className="pointer-events-auto relative z-10 flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onTogglePin(bookmark)}
        aria-label={bookmark.isPinned ? '取消收藏' : '加入收藏'}
        title={bookmark.isPinned ? '取消收藏' : '加入收藏'}
        className={cn('size-8', bookmark.isPinned ? 'text-amber-500' : 'text-muted-foreground')}
      >
        <Star className={cn('size-4', bookmark.isPinned && 'fill-current')} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onEdit(bookmark)}
        aria-label="编辑书签"
        title="编辑书签"
        className="size-8 text-muted-foreground"
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onDelete(bookmark.id)}
        aria-label="删除书签"
        title="删除书签"
        className="size-8 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );

  const icon = (
    <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
      {showFallback ? (
        <span className="text-xs font-semibold text-muted-foreground">{initial}</span>
      ) : (
        <img
          alt=""
          className="size-5 rounded object-cover"
          src={bookmark.iconUrl ?? undefined}
          loading="lazy"
          decoding="async"
          onError={() => setIconFailed(true)}
        />
      )}
    </div>
  );

  const badges = (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      {categoryLabel ? <span className="truncate">{categoryLabel}</span> : null}
    </div>
  );

  const link = (
    <a
      href={bookmark.url}
      target="_blank"
      rel="noreferrer"
      className="absolute inset-0 z-0 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      aria-label={`打开 ${bookmark.title}`}
    />
  );

  if (viewMode === 'list') {
    return (
      <article
        className={cn(
          'group relative flex w-full min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-[0_1px_0_oklch(0_0_0/0.02)] transition-[border-color,background-color,box-shadow] hover:border-border-strong hover:shadow-soft',
        )}
      >
        {link}
        <div className="pointer-events-none relative z-1 contents">
          {icon}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="min-w-0 truncate text-sm font-medium">{bookmark.title}</h3>
              {bookmark.isPinned ? (
                <Star className="size-3 shrink-0 fill-current text-amber-500" />
              ) : null}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              <p className="truncate text-[11px] text-muted-foreground">{domain}</p>
              {bookmark.description ? (
                <p className="hidden min-w-0 flex-1 truncate text-[11px] text-muted-foreground sm:block">
                  · {bookmark.description}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {badges}
            <ExternalLink className="ml-0.5 size-3.5 text-muted-foreground opacity-60 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100" />
          </div>
        </div>
        {adminActions}
      </article>
    );
  }

  return (
    <article
      className={cn(
        'group relative flex h-full w-full min-w-0 flex-col rounded-lg border border-border bg-card p-3.5 shadow-[0_1px_0_oklch(0_0_0/0.02)] transition-[border-color,background-color,box-shadow] hover:border-border-strong hover:shadow-soft',
      )}
    >
      {link}
      <div className="pointer-events-none relative z-1 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium">{bookmark.title}</h3>
            <p className="truncate text-[11px] text-muted-foreground">{domain}</p>
          </div>
        </div>
        {adminActions}
      </div>

      <p className="pointer-events-none relative z-1 mt-2.5 line-clamp-2 flex-1 text-xs leading-5 text-muted-foreground">
        {bookmark.description || '\u00a0'}
      </p>

      <div className="pointer-events-none relative z-1 mt-3 flex items-center justify-between border-t border-border pt-2.5">
        {badges}
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary opacity-80 transition group-hover:opacity-100">
          打开
          <ExternalLink className="size-3" />
        </span>
      </div>
    </article>
  );
});
