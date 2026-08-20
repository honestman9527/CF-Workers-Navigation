import type { Bookmark } from '@shared/api/types';

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
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function BookmarkCard({
  bookmark,
  viewMode = 'grid',
  onEdit,
  onDelete,
  onTogglePin,
  onArchive,
  onRestore,
  onPermanentDelete,
  onSelectTag,
}: {
  bookmark: Bookmark;
  viewMode?: 'grid' | 'list';
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: number) => void;
  onTogglePin: (bookmark: Bookmark) => void;
  onArchive: (id: number) => void;
  onRestore: (id: number) => void;
  onPermanentDelete: (id: number) => void;
  onSelectTag?: (tag: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [bookmark.iconUrl]);
  const domain = domainOf(bookmark.url);
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
    <div className="pointer-events-auto relative z-20 flex items-center gap-0.5">
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
  const tagButton = (item: string) =>
    onSelectTag ? (
      <button
        key={item}
        type="button"
        className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary transition hover:bg-primary/20"
        onClick={() => onSelectTag(item)}
      >
        #{item}
      </button>
    ) : (
      <span key={item} className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
        #{item}
      </span>
    );
  return (
    <article
      className={cn(
        'group relative flex min-w-0 touch-manipulation gap-3 border border-border/80 bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-soft',
        viewMode === 'grid'
          ? 'min-h-36 flex-col rounded-[1.1rem]'
          : 'items-center rounded-[1rem] py-3',
      )}
    >
      {active ? (
        <a
          href={bookmark.url}
          target="_blank"
          rel="noreferrer"
          className="absolute inset-0 z-0 cursor-pointer rounded-[inherit] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-label={`打开 ${bookmark.title}`}
        />
      ) : null}
      <div className="pointer-events-none relative z-10 flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-[0.85rem] border border-border/70 bg-muted">
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
          <p className="pointer-events-none relative z-10 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
            {bookmark.description || '没有描述'}
          </p>
          <div className="relative z-20 mt-auto flex flex-wrap gap-1.5">
            {bookmark.tags.map(tagButton)}
          </div>
        </>
      ) : (
        <div className="relative z-20 ml-auto hidden min-w-0 flex-1 items-center gap-2 sm:flex">
          {bookmark.tags.slice(0, 3).map(tagButton)}
        </div>
      )}
      {active ? (
        <ExternalLink className="pointer-events-none absolute right-4 bottom-4 z-10 size-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
      ) : null}
    </article>
  );
}
