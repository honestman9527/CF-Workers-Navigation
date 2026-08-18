import type { Bookmark, Tag } from '@nav/api/types';

import {
  Archive,
  ArrowDownUp,
  Bookmark as BookmarkIcon,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Menu,
  Plus,
  Search,
  Star,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@nav/api/client';
import { pushToast } from '@nav/components/Toast';
import { BookmarkCard } from '@nav/features/bookmarks/BookmarkCard';
import { BookmarkForm } from '@nav/features/bookmarks/BookmarkForm';
import { ImportExportPanel } from '@nav/features/import-export/ImportExportPanel';
import { AppShell } from '@nav/features/layout/AppShell';
import { HeaderMenu } from '@nav/features/layout/HeaderMenu';
import { SettingsPanel } from '@nav/features/settings/SettingsPanel';
import { useTheme } from '@nav/hooks/useTheme';

type View = 'active' | 'archive' | 'trash';
const PAGE_SIZE = 24;

export function WorkspacePage({ logout }: { authed: boolean; logout: () => Promise<void> }) {
  const { theme, setTheme } = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>('active');
  const [homeOnly, setHomeOnly] = useState(true);
  const [tag, setTag] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [pinned, setPinned] = useState<Bookmark[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Bookmark | null | 'new'>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const [items, tagList, favorite] = await Promise.all([
        query.trim() && view === 'active'
          ? api.searchBookmarks(undefined, query.trim())
          : api.getBookmarks(undefined, undefined, false, undefined, { view, tag }),
        api.getTags(),
        api.getPinnedBookmarks(),
      ]);
      setBookmarks(items);
      setTags(tagList);
      setPinned(favorite);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) void logout();
      pushToast(error instanceof Error ? error.message : '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [view, tag, query]);
  useEffect(() => setPage(1), [view, homeOnly, tag, query]);
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

  const visible = view === 'active' && homeOnly && !query && !tag ? pinned : bookmarks;
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageItems = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount]);
  const title =
    view === 'active'
      ? query
        ? `搜索 “${query}”`
        : tag
          ? `#${tag}`
          : homeOnly
            ? '常用入口'
            : '所有书签'
      : view === 'archive'
        ? '归档'
        : '回收站';
  const subtitle = loading
    ? '同步中…'
    : pageCount > 1
      ? `${visible.length} 个书签 · 第 ${page} / ${pageCount} 页`
      : `${visible.length} 个书签`;

  async function mutate(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      await load();
      pushToast(message, 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '操作失败', 'error');
    }
  }

  const header = (
    <div className="flex h-[var(--header-h)] items-center justify-between gap-4 px-4 sm:px-8">
      <div className="flex items-center gap-2">
        <button
          className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
          onClick={() => setNavOpen(true)}
          aria-label="打开索引"
        >
          <Menu className="size-4" />
        </button>
        <button
          className="flex items-center gap-3"
          onClick={() => {
            setView('active');
            setHomeOnly(true);
            setTag(undefined);
            setQuery('');
          }}
        >
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <BookmarkIcon className="size-5" />
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => setTransferOpen(true)}
          aria-label="打开导入导出"
        >
          <ArrowDownUp className="size-4" />
          <span className="hidden md:inline">导入 / 导出</span>
        </Button>
        <Button size="sm" onClick={() => setEditor('new')}>
          <Plus className="size-4" />
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
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-center justify-between lg:hidden">
        <span className="font-display text-lg">索引</span>
        <Button variant="ghost" size="icon-sm" onClick={() => setNavOpen(false)}>
          <X className="size-4" />
        </Button>
      </div>
      <nav className="grid gap-1">
        <button
          onClick={() => {
            setView('active');
            setHomeOnly(false);
            setTag(undefined);
            setQuery('');
            setNavOpen(false);
          }}
          className={cn('nav-item', view === 'active' && !homeOnly && !tag && 'nav-item-active')}
        >
          <Inbox className="size-4" />
          所有书签 <span>{tags.reduce((n, t) => n + t.bookmarkCount, 0) || ''}</span>
        </button>
        <button
          onClick={() => {
            setView('active');
            setHomeOnly(true);
            setTag(undefined);
            setQuery('');
            setNavOpen(false);
          }}
          className={cn('nav-item', view === 'active' && homeOnly && !tag && 'nav-item-active')}
        >
          <Star className="size-4" />
          常用入口 <span>{pinned.length}</span>
        </button>
        <button
          onClick={() => {
            setView('archive');
            setHomeOnly(false);
            setTag(undefined);
            setQuery('');
            setNavOpen(false);
          }}
          className={cn('nav-item', view === 'archive' && 'nav-item-active')}
        >
          <Archive className="size-4" />
          归档
        </button>
        <button
          onClick={() => {
            setView('trash');
            setHomeOnly(false);
            setTag(undefined);
            setQuery('');
            setNavOpen(false);
          }}
          className={cn('nav-item', view === 'trash' && 'nav-item-active')}
        >
          <Trash2 className="size-4" />
          回收站
        </button>
      </nav>
      <div className="border-t border-border pt-4">
        <div className="mb-2 flex items-center gap-2 px-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          <TagIcon className="size-3.5" />
          标签
        </div>
        <div className="grid gap-0.5">
          {tags.map((item) => (
            <button
              key={item.slug}
              onClick={() => {
                setView('active');
                setHomeOnly(false);
                setTag(item.slug);
                setQuery('');
                setNavOpen(false);
              }}
              className={cn('nav-item', tag === item.slug && 'nav-item-active')}
            >
              <span className="truncate">{item.name}</span>
              <span>{item.bookmarkCount}</span>
            </button>
          ))}
        </div>
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
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 focus-within:border-primary/60">
            <Search className="size-4 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索标题、网址或描述"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query ? (
              <button onClick={() => setQuery('')} aria-label="清除搜索">
                <X className="size-4 text-muted-foreground" />
              </button>
            ) : (
              <kbd className="hidden text-[10px] text-muted-foreground sm:block">/</kbd>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium tracking-[0.18em] text-primary uppercase">
              {view === 'active' ? '你的网络入口' : view === 'archive' ? '暂时收起' : '可恢复项目'}
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="h-36 animate-pulse rounded-xl bg-muted" />
              <div className="h-36 animate-pulse rounded-xl bg-muted" />
              <div className="h-36 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : visible.length === 0 ? (
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
                {pageItems.map((bookmark) => (
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    viewMode={viewMode}
                    onEdit={(item) => setEditor(item)}
                    onDelete={(id) => mutate(() => api.deleteBookmark('', id), '已移入回收站')}
                    onTogglePin={(item) =>
                      mutate(
                        () => api.updateBookmark('', item.id, { isPinned: !item.isPinned }),
                        item.isPinned ? '已取消常用' : '已加入常用',
                      )
                    }
                    onArchive={(id) => mutate(() => api.archiveBookmark('', id), '已归档')}
                    onRestore={(id) => mutate(() => api.restoreBookmark('', id), '已恢复')}
                    onPermanentDelete={(id) =>
                      mutate(() => api.permanentDeleteBookmark('', id), '已永久删除')
                    }
                  />
                ))}
              </div>
              {pageCount > 1 ? (
                <nav
                  className="flex items-center justify-center gap-3 border-t border-border pt-5"
                  aria-label="书签分页"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    <ChevronLeft />
                    上一页
                  </Button>
                  <span className="min-w-20 text-center font-mono text-xs text-muted-foreground">
                    {page} / {pageCount}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page === pageCount}
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  >
                    下一页
                    <ChevronRight />
                  </Button>
                </nav>
              ) : null}
            </>
          )}
        </div>
      </AppShell>
      <Toaster />
      <BookmarkForm
        open={editor !== null}
        bookmark={editor === 'new' ? undefined : (editor ?? undefined)}
        onClose={() => setEditor(null)}
        onSubmit={async (input) => {
          const editingBookmark = editor !== null && editor !== 'new' ? editor : undefined;
          if (editingBookmark) {
            await api.updateBookmark('', editingBookmark.id, input);
          } else {
            await api.createBookmark('', input);
          }
          await load();
          pushToast(editingBookmark ? '书签已更新' : '书签已创建', 'success');
          setEditor(null);
        }}
      />
      <ImportExportPanel
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onImported={load}
      />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
