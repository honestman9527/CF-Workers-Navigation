import type { Bookmark, BookmarkInput, BookmarkView, Tag } from '@shared/api/types';

import {
  Archive,
  ArrowDownUp,
  Bookmark as BookmarkIcon,
  Inbox,
  Menu,
  Plus,
  Search,
  Star,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { api } from '@nav/api/client';
import { pushToast } from '@nav/components/Toast';
import { BookmarkCard } from '@nav/features/bookmarks/BookmarkCard';
import { useBookmarkPage } from '@nav/features/bookmarks/useBookmarkPage';
import { AppShell } from '@nav/features/layout/AppShell';
import { HeaderMenu } from '@nav/features/layout/HeaderMenu';
import { useTheme } from '@nav/hooks/useTheme';

const BookmarkForm = lazy(() =>
  import('@nav/features/bookmarks/BookmarkForm').then((module) => ({
    default: module.BookmarkForm,
  })),
);
const ImportExportPanel = lazy(() =>
  import('@nav/features/import-export/ImportExportPanel').then((module) => ({
    default: module.ImportExportPanel,
  })),
);
const SettingsPanel = lazy(() =>
  import('@nav/features/settings/SettingsPanel').then((module) => ({
    default: module.SettingsPanel,
  })),
);

type View = Exclude<BookmarkView, 'all'>;

export function WorkspacePage({ logout }: { authed: boolean; logout: () => Promise<void> }) {
  const { theme, setTheme } = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>('active');
  const [pinnedOnly, setPinnedOnly] = useState(true);
  const [tag, setTag] = useState<string>();
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagQuery, setTagQuery] = useState('');
  const [editor, setEditor] = useState<Bookmark | 'new' | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  function reportError(message: string) {
    pushToast(message, 'error');
  }

  function handleUnauthorized() {
    void logout();
  }

  const page = useBookmarkPage({
    view,
    tag,
    pinned: view === 'active' && pinnedOnly && !tag,
    query,
    onUnauthorized: handleUnauthorized,
    onError: reportError,
  });

  async function loadTags() {
    try {
      setTags(await api.getTags());
    } catch (error) {
      reportError(error instanceof Error ? error.message : '标签加载失败');
    }
  }

  useEffect(() => {
    void loadTags();
  }, []);

  useEffect(() => {
    document.title =
      view === 'active' ? '书签柜' : view === 'archive' ? '归档 · 书签柜' : '回收站 · 书签柜';
  }, [view]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === '/' && !(event.target as HTMLElement)?.closest('input,textarea')) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function selectView(next: View, options?: { pinned?: boolean; tag?: string }) {
    setView(next);
    setPinnedOnly(options?.pinned ?? false);
    setTag(options?.tag);
    setQuery('');
    setNavOpen(false);
  }

  const visibleTags = tags.filter((item) =>
    item.name.toLocaleLowerCase().includes(tagQuery.trim().toLocaleLowerCase()),
  );
  const selectedTagName = tag ? (tags.find((item) => item.slug === tag)?.name ?? tag) : null;

  async function mutate(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      page.refresh();
      await loadTags();
      pushToast(message, 'success');
    } catch (error) {
      reportError(error instanceof Error ? error.message : '操作失败');
    }
  }

  const title =
    view === 'active'
      ? query
        ? `搜索 “${query}”`
        : tag
          ? (selectedTagName ?? tag)
          : pinnedOnly
            ? '常用入口'
            : '所有书签'
      : view === 'archive'
        ? '归档'
        : '回收站';

  const header = (
    <div className="flex h-[var(--header-h)] items-center justify-between gap-4 px-4 sm:px-8">
      <div className="flex items-center gap-2">
        <button
          className="grid size-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground lg:hidden"
          onClick={() => setNavOpen(true)}
          aria-label="打开索引"
        >
          <Menu />
        </button>
        <button
          className="flex items-center gap-3"
          onClick={() => selectView('active', { pinned: true })}
        >
          <span className="grid size-9 place-items-center rounded-[0.9rem] bg-primary text-primary-foreground shadow-sm">
            <BookmarkIcon />
          </span>
          <span className="text-left">
            <strong className="block font-display text-base">书签柜</strong>
            <span className="hidden text-[10px] tracking-[0.2em] text-muted-foreground uppercase sm:block">
              personal index
            </span>
          </span>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
          <ArrowDownUp />
          <span className="hidden md:inline">导入 / 导出</span>
        </Button>
        <Button size="sm" onClick={() => setEditor('new')}>
          <Plus />
          <span className="hidden sm:inline">添加书签</span>
        </Button>
        <HeaderMenu
          theme={theme}
          viewMode={viewMode}
          onThemeChange={setTheme}
          onViewModeChange={setViewMode}
          onOpenSettings={() => setSettingsOpen(true)}
          onLogout={() => void logout()}
        />
      </div>
    </div>
  );

  const sidebar = (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between lg:hidden">
        <span className="font-display text-lg font-semibold">索引</span>
        <Button variant="ghost" size="icon-sm" onClick={() => setNavOpen(false)}>
          <X />
        </Button>
      </div>
      <nav className="grid gap-1">
        <button
          onClick={() => selectView('active')}
          className={cn('nav-item', view === 'active' && !pinnedOnly && !tag && 'nav-item-active')}
        >
          <Inbox />
          所有书签
        </button>
        <button
          onClick={() => selectView('active', { pinned: true })}
          className={cn('nav-item', view === 'active' && pinnedOnly && !tag && 'nav-item-active')}
        >
          <Star />
          常用入口
        </button>
        <button
          onClick={() => selectView('archive')}
          className={cn('nav-item', view === 'archive' && 'nav-item-active')}
        >
          <Archive />
          归档
        </button>
        <button
          onClick={() => selectView('trash')}
          className={cn('nav-item', view === 'trash' && 'nav-item-active')}
        >
          <Trash2 />
          回收站
        </button>
      </nav>
      <div className="border-t border-border/80 pt-5">
        <div className="mb-3 flex items-center gap-2 px-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          <TagIcon className="size-3.5" />
          标签
          <span className="ml-auto font-mono text-[10px] font-normal tracking-normal">
            {tags.length}
          </span>
        </div>
        {tags.length > 0 ? (
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={tagQuery}
              onChange={(event) => setTagQuery(event.target.value)}
              placeholder="搜索标签"
              aria-label="搜索标签"
              className="h-9 w-full rounded-xl border border-transparent bg-background/70 pr-3 pl-9 text-xs transition outline-none placeholder:text-muted-foreground/80 focus:border-primary/35 focus:bg-card"
            />
            {tagQuery ? (
              <button
                type="button"
                onClick={() => setTagQuery('')}
                className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="清除标签搜索"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="grid max-h-[min(44vh,28rem)] gap-0.5 overflow-y-auto pr-1">
          {visibleTags.map((item) => (
            <button
              key={item.slug}
              onClick={() => selectView('active', { tag: item.slug })}
              className={cn(
                'nav-item rounded-xl px-3 py-2.5',
                tag === item.slug && 'nav-item-active',
              )}
            >
              <span className="truncate">{item.name}</span>
              <span className="font-mono text-[10px] opacity-70">{item.bookmarkCount}</span>
            </button>
          ))}
        </div>
        {tags.length > 0 && visibleTags.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">没有匹配的标签</p>
        ) : null}
        {tags.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">保存书签时添加标签</p>
        ) : null}
      </div>
      <div className="mt-auto border-t border-border pt-3">
        <p className="px-2 text-[11px] text-muted-foreground">私人索引 · 自动保存</p>
      </div>
    </div>
  );

  return (
    <>
      <AppShell
        header={header}
        sidebar={sidebar}
        navOpen={navOpen}
        onCloseNav={() => setNavOpen(false)}
      >
        <div className="mx-auto w-full max-w-6xl space-y-7 px-1 sm:px-2">
          <div className="flex items-center gap-3 rounded-[1.1rem] border border-border/70 bg-card px-4 py-3.5 shadow-sm transition focus-within:border-primary/50 focus-within:shadow-md">
            <Search className="size-4.5 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、网址或描述"
              aria-label="搜索书签"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setQuery('');
              }}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setQuery('')}
                aria-label="清除搜索"
              >
                <X />
              </Button>
            ) : (
              <kbd className="hidden rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
                /
              </kbd>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium tracking-[0.18em] text-primary uppercase">
              {view === 'active' ? '你的网络入口' : view === 'archive' ? '暂时收起' : '可恢复项目'}
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {page.loading ? '同步中…' : `已加载 ${page.items.length} 个书签`}
            </p>
          </div>
          {page.loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-36 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : page.items.length === 0 ? (
            <div className="border-y border-border py-16 text-center">
              <BookmarkIcon className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-3 font-medium">这里还没有书签</p>
              <p className="mt-1 text-sm text-muted-foreground">粘贴一个网址，给它一个标签。</p>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'
                    : 'grid gap-2',
                )}
              >
                {page.items.map((bookmark) => (
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    viewMode={viewMode}
                    onEdit={setEditor}
                    onDelete={(id) => void mutate(() => api.deleteBookmark('', id), '已移入回收站')}
                    onTogglePin={(item) =>
                      void mutate(
                        () => api.updateBookmark('', item.id, { isPinned: !item.isPinned }),
                        item.isPinned ? '已取消常用' : '已加入常用',
                      )
                    }
                    onArchive={(id) => void mutate(() => api.archiveBookmark('', id), '已归档')}
                    onRestore={(id) => void mutate(() => api.restoreBookmark('', id), '已恢复')}
                    onPermanentDelete={(id) =>
                      void mutate(() => api.permanentDeleteBookmark('', id), '已永久删除')
                    }
                    onSelectTag={
                      view === 'active'
                        ? (nextTag) => selectView('active', { tag: nextTag })
                        : undefined
                    }
                  />
                ))}
              </div>
              {page.hasMore ? (
                <div className="flex justify-center border-t border-border pt-5">
                  <Button
                    variant="outline"
                    disabled={page.loadingMore}
                    onClick={() => void page.loadMore()}
                  >
                    {page.loadingMore ? '加载中…' : '加载更多'}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </AppShell>
      <Toaster />
      <Suspense fallback={null}>
        {editor !== null ? (
          <BookmarkForm
            open
            bookmark={editor === 'new' ? undefined : editor}
            availableTags={tags}
            onClose={() => setEditor(null)}
            onSubmit={async (input: BookmarkInput) => {
              if (editor !== 'new' && editor !== null)
                await api.updateBookmark('', editor.id, input);
              else await api.createBookmark('', input);
              setEditor(null);
              page.refresh();
              await loadTags();
              pushToast(editor === 'new' ? '书签已创建' : '书签已更新', 'success');
            }}
          />
        ) : null}
        {transferOpen ? (
          <ImportExportPanel
            open
            onClose={() => setTransferOpen(false)}
            onImported={async () => {
              page.refresh();
              await loadTags();
            }}
          />
        ) : null}
        {settingsOpen ? <SettingsPanel open onClose={() => setSettingsOpen(false)} /> : null}
      </Suspense>
    </>
  );
}
