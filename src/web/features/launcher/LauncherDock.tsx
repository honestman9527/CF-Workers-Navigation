import type { Bookmark } from '@shared/api/types';

import { ArrowRight, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { domainOf } from '@shared/search';

import { LauncherBookmarkIcon } from './LauncherBookmarkContent';

/** 固定链接区域，只缩放图标，避免鼠标移动改变排列与点击位置。 */
export function LauncherDock({
  bookmarks,
  hasMore,
  loading,
  loadingMore,
  error,
  hidden,
  onRetry,
  onLoadMore,
  onOpenWorkspace,
}: {
  bookmarks: Bookmark[];
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hidden: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpenWorkspace: () => void;
}) {
  const { authed } = useAuthContext();
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const media = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    );
    let pointerX: number | null = null;
    let focused: HTMLElement | null = null;
    let frame = 0;
    const update = () => {
      frame = 0;
      const focusBounds = focused?.getBoundingClientRect();
      const activeX = pointerX ?? (focusBounds ? focusBounds.left + focusBounds.width / 2 : null);
      for (const icon of scroller.querySelectorAll<HTMLElement>('[data-dock-icon]')) {
        const link = icon.closest('a')!;
        const bounds = link.getBoundingClientRect();
        const distance =
          activeX === null ? Infinity : Math.abs(activeX - bounds.left - bounds.width / 2);
        const scale = media.matches && !hidden ? 1 + 0.5 * Math.max(0, 1 - distance / 140) : 1;
        icon.style.transform = `scale(${scale})`;
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !media.matches) return;
      pointerX = event.clientX;
      schedule();
    };
    const leave = () => {
      pointerX = null;
      schedule();
    };
    const focus = (event: FocusEvent) => {
      pointerX = null;
      focused = event.target instanceof HTMLElement ? event.target.closest('a') : null;
      focused?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      schedule();
    };
    const blur = () => {
      focused = null;
      schedule();
    };
    const reset = () => {
      pointerX = null;
      focused = null;
      schedule();
    };
    scroller.addEventListener('pointermove', move);
    scroller.addEventListener('pointerleave', leave);
    scroller.addEventListener('focusin', focus);
    scroller.addEventListener('focusout', blur);
    scroller.addEventListener('scroll', reset);
    window.addEventListener('resize', reset);
    media.addEventListener('change', reset);
    update();
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('pointermove', move);
      scroller.removeEventListener('pointerleave', leave);
      scroller.removeEventListener('focusin', focus);
      scroller.removeEventListener('focusout', blur);
      scroller.removeEventListener('scroll', reset);
      window.removeEventListener('resize', reset);
      media.removeEventListener('change', reset);
    };
  }, [bookmarks, hidden, loading]);

  return (
    <nav
      aria-label="常用书签"
      hidden={hidden}
      className="fixed inset-x-4 bottom-[calc(var(--safe-b)+0.75rem)] z-20 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-2xl border border-border bg-card/85 shadow-lg backdrop-blur-md"
    >
      {loading ? (
        <div className="flex gap-3 overflow-hidden p-4" role="status" aria-label="正在加载常用书签">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="size-11 shrink-0 rounded-lg" />
          ))}
        </div>
      ) : error && bookmarks.length === 0 ? (
        <Alert className="max-w-md" variant="destructive">
          <TriangleAlert />
          <AlertTitle>常用书签加载失败</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span className="line-clamp-2 break-all" title={error}>
              {error}
            </span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw data-icon="inline-start" />
              重试
            </Button>
          </AlertDescription>
        </Alert>
      ) : bookmarks.length === 0 ? (
        <Empty className="gap-2 p-3">
          <EmptyHeader>
            <EmptyTitle>{authed ? '还没有常用书签' : '暂无公开常用书签'}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="ghost" onClick={onOpenWorkspace}>
              前往书签柜
              <ArrowRight data-icon="inline-end" />
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <TooltipProvider>
          <div ref={scrollerRef} className="flex items-end gap-2 overflow-x-auto px-3 pt-7 pb-3">
            {bookmarks.map((bookmark) => (
              <Tooltip key={bookmark.id}>
                <TooltipTrigger
                  render={
                    <a
                      href={bookmark.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`打开 ${bookmark.title}`}
                      className="flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-lg px-1 py-1"
                    />
                  }
                >
                  <span
                    data-dock-icon
                    className="origin-bottom transition-transform duration-150 ease-out motion-reduce:transition-none"
                  >
                    <LauncherBookmarkIcon bookmark={bookmark} className="size-11" />
                  </span>
                  <span className="w-full truncate text-center text-xs text-muted-foreground lg:hidden [@media(hover:none)]:block">
                    {bookmark.title}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={28}>
                  <span className="flex min-w-0 flex-col gap-1 break-all">
                    <span>{bookmark.title}</span>
                    <span>{domainOf(bookmark.url)}</span>
                  </span>
                </TooltipContent>
              </Tooltip>
            ))}
            {hasMore ? (
              <Button
                variant="ghost"
                className="h-11 shrink-0 self-center"
                disabled={loadingMore}
                onClick={onLoadMore}
              >
                {loadingMore ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : (
                  <ArrowRight data-icon="inline-start" />
                )}
                {loadingMore ? '加载中…' : error ? '重试加载' : '加载更多'}
              </Button>
            ) : null}
          </div>
          {error ? (
            <p
              role="alert"
              className="line-clamp-2 max-w-md px-4 pb-3 text-xs text-destructive"
              title={error}
            >
              {error}
            </p>
          ) : null}
        </TooltipProvider>
      )}
    </nav>
  );
}
