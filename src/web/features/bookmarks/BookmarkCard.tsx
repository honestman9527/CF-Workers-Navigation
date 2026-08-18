import type { Bookmark } from '@nav/api/types';

import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  Pencil,
  Star,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export const BookmarkCard = memo(function BookmarkCard({
  bookmark,
  viewMode = 'grid',
  onEdit,
  onDelete,
  onTogglePin,
  onArchive,
  onRestore,
  onPermanentDelete,
}: {
  bookmark: Bookmark;
  viewMode?: 'grid' | 'list';
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: number) => void;
  onTogglePin: (bookmark: Bookmark) => void;
  onArchive: (id: number) => void;
  onRestore: (id: number) => void;
  onPermanentDelete: (id: number) => void;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [bookmark.iconUrl]);
  const domain = useMemo(() => domainOf(bookmark.url), [bookmark.url]);
  const icon =
    !bookmark.iconUrl || failed ? (
      <span className="text-sm font-semibold text-primary">{domain.charAt(0).toUpperCase()}</span>
    ) : (
      <img
        src={bookmark.iconUrl}
        alt=""
        className="size-5 rounded"
        onError={() => setFailed(true)}
      />
    );
  const active = !bookmark.deletedAt && !bookmark.archivedAt;
  const actions = (
    <div className="relative z-10 flex items-center gap-0.5">
      {active ? (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onTogglePin(bookmark)}
            aria-label="切换常用"
          >
            <Star className={cn('size-4', bookmark.isPinned && 'fill-current text-primary')} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onArchive(bookmark.id)}
            aria-label="归档"
          >
            <Archive className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onEdit(bookmark)} aria-label="编辑">
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(bookmark.id)}
            aria-label="移入回收站"
          >
            <Trash2 className="size-4" />
          </Button>
        </>
      ) : bookmark.deletedAt ? (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRestore(bookmark.id)}
            aria-label="恢复"
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPermanentDelete(bookmark.id)}
            aria-label="永久删除"
          >
            <X className="size-4" />
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onRestore(bookmark.id)}
          aria-label="取消归档"
        >
          <ArchiveRestore className="size-4" />
        </Button>
      )}
    </div>
  );
  return (
    <article
      className={cn(
        'group relative flex min-w-0 gap-3 border border-border bg-card p-4 transition hover:border-primary/45 hover:shadow-soft',
        viewMode === 'grid' ? 'min-h-36 flex-col rounded-2xl' : 'items-center rounded-xl py-3',
      )}
    >
      {active ? (
        <a
          href={bookmark.url}
          target="_blank"
          rel="noreferrer"
          className="absolute inset-0 z-0 rounded-[inherit]"
          aria-label={`打开 ${bookmark.title}`}
        />
      ) : null}
      <div className="relative z-10 flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-muted">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{bookmark.title}</h2>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{domain}</p>
          </div>
        </div>
        {actions}
      </div>
      {viewMode === 'grid' ? (
        <>
          <p className="relative z-10 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
            {bookmark.description || '没有描述'}
          </p>
          <div className="relative z-10 mt-auto flex flex-wrap gap-1.5">
            {bookmark.tags.map((item) => (
              <span
                key={item}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
              >
                #{item}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="relative z-10 ml-auto hidden min-w-0 flex-1 items-center gap-2 sm:flex">
          {bookmark.tags.slice(0, 3).map((item) => (
            <span key={item} className="text-[11px] text-primary">
              #{item}
            </span>
          ))}
        </div>
      )}
      {active ? (
        <ExternalLink className="pointer-events-none absolute right-4 bottom-4 z-10 size-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
      ) : null}
    </article>
  );
});
