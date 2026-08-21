import type { Bookmark, BookmarkInput, BookmarkView, Category, Tag } from '@shared/api/types';

import {
  ArrowDownUp,
  Bookmark as BookmarkIcon,
  FolderPlus,
  FolderTree,
  Menu,
  Plus,
  Search,
  Settings2,
  Star,
  X,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { api } from '@nav/api/client';
import { pushToast } from '@nav/components/Toast';
import { BookmarkCard } from '@nav/features/bookmarks/BookmarkCard';
import { useBookmarkPage } from '@nav/features/bookmarks/useBookmarkPage';
import { CategorySidebar } from '@nav/features/categories/CategorySidebar';
import { categoryIcon } from '@nav/features/categories/icons';
import { buildCategoryTree } from '@nav/features/categories/tree';
import { AppShell } from '@nav/features/layout/AppShell';
import { HeaderMenu } from '@nav/features/layout/HeaderMenu';
import { TagFilterBar } from '@nav/features/tags/TagFilterBar';
import { useTheme } from '@nav/hooks/useTheme';
import { UNCATEGORIZED_SLUG } from '@shared/api/types';

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
const CategoryManager = lazy(() =>
  import('@nav/features/categories/CategoryManager').then((module) => ({
    default: module.CategoryManager,
  })),
);

type View = Exclude<BookmarkView, 'all'>;

export function WorkspacePage({ logout }: { authed: boolean; logout: () => Promise<void> }) {
  const { theme, setTheme } = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>('active');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [category, setCategory] = useState<string>();
  const [tag, setTag] = useState<string>();
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editor, setEditor] = useState<Bookmark | 'new' | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  function reportError(message: string) {
    pushToast(message, 'error');
  }

  function handleUnauthorized() {
    void logout();
  }

  /** 落地视图：活动书签、无任何筛选 —— 全部网站按分类分组展示。 */
  const landing = view === 'active' && !pinnedOnly && !tag && !category && !query;

  const page = useBookmarkPage({
    view,
    category,
    tag,
    pinned: view === 'active' && pinnedOnly && !tag && !category,
    query,
    fetchAll: landing,
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

  async function loadCategories(): Promise<Category[] | null> {
    try {
      const result = await api.getCategories();
      setCategories(result);
      return result;
    } catch (error) {
      reportError(error instanceof Error ? error.message : '分类加载失败');
      return null;
    }
  }

  useEffect(() => {
    void loadTags();
    void loadCategories();
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

  function selectView(next: View, options?: { pinned?: boolean }) {
    setView(next);
    setPinnedOnly(options?.pinned ?? false);
    setCategory(undefined);
    setTag(undefined);
    setQuery('');
    setNavOpen(false);
  }

  /** 选择分类筛选：保留已选标签，二者可叠加；再点当前分类则取消筛选回到全部。 */
  function selectCategory(slug: string) {
    setView('active');
    setCategory((current) => (current === slug ? undefined : slug));
    setPinnedOnly(false);
    setQuery('');
    setNavOpen(false);
  }

  /** 选择/清除标签筛选：保留已选分类，二者可叠加。 */
  function selectTagFilter(next: string | undefined) {
    setView('active');
    setTag(next);
    setPinnedOnly(false);
    setQuery('');
    setNavOpen(false);
  }

  const selectedTagName = tag ? (tags.find((item) => item.slug === tag)?.name ?? tag) : null;
  const selectedCategoryName = category
    ? category === UNCATEGORIZED_SLUG
      ? '未分类'
      : (categories.find((item) => item.slug === category)?.name ?? category)
    : null;

  /** 落地视图：把全部活动书签按顶层根分类分区块，子分类书签并入所属根分类。 */
  const grouped = useMemo(() => {
    if (!landing) return [];
    const nodes = buildCategoryTree(categories);
    const byId = new Map(categories.map((category) => [category.id, category]));
    const bySlug = new Map<string, Bookmark[]>();
    const pushTo = (slug: string, bookmark: Bookmark) => {
      const list = bySlug.get(slug);
      if (list) list.push(bookmark);
      else bySlug.set(slug, [bookmark]);
    };
    for (const bookmark of page.items) {
      let node = bookmark.categoryId !== null ? byId.get(bookmark.categoryId) : undefined;
      let slug: string = UNCATEGORIZED_SLUG;
      let guard = categories.length + 1;
      while (node && guard-- > 0) {
        slug = node.slug;
        node = node.parentId !== null ? byId.get(node.parentId) : undefined;
      }
      pushTo(slug, bookmark);
    }
    const sections: Array<{
      slug: string;
      name: string;
      icon: string | null;
      bookmarks: Bookmark[];
    }> = [];
    const seen = new Set<string>();
    for (const node of nodes) {
      const bookmarks = bySlug.get(node.slug);
      if (!bookmarks) continue;
      seen.add(node.slug);
      sections.push({ slug: node.slug, name: node.name, icon: node.icon, bookmarks });
    }
    if (bySlug.has(UNCATEGORIZED_SLUG)) {
      seen.add(UNCATEGORIZED_SLUG);
      sections.push({
        slug: UNCATEGORIZED_SLUG,
        name: '未分类',
        icon: null,
        bookmarks: bySlug.get(UNCATEGORIZED_SLUG)!,
      });
    }
    // 防御：树外的孤儿分类（如数据不一致）仍展示。
    for (const [slug, bookmarks] of bySlug) {
      if (!seen.has(slug) && slug !== UNCATEGORIZED_SLUG) {
        sections.push({ slug, name: slug, icon: null, bookmarks });
      }
    }
    return sections;
  }, [categories, landing, page.items]);

  async function mutate(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      page.refresh();
      await loadTags();
      await loadCategories();
      pushToast(message, 'success');
    } catch (error) {
      reportError(error instanceof Error ? error.message : '操作失败');
    }
  }

  const title =
    view === 'active'
      ? query
        ? `搜索 “${query}”`
        : category
          ? (selectedCategoryName ?? category)
          : tag
            ? (selectedTagName ?? tag)
            : pinnedOnly
              ? '常用入口'
              : '全部网站'
      : view === 'archive'
        ? '归档'
        : '回收站';

  /** 书签卡片统一渲染：落地分组与普通列表共用一套操作与筛选回调。 */
  const renderCard = (bookmark: Bookmark) => (
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
      onSelectTag={view === 'active' ? selectTagFilter : undefined}
      onSelectCategory={
        view === 'active' ? (nextCategory) => selectCategory(nextCategory) : undefined
      }
    />
  );

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
        <button className="flex items-center gap-3" onClick={() => selectView('active')}>
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
          onOpenArchive={() => selectView('archive')}
          onOpenTrash={() => selectView('trash')}
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
      <div className="grid gap-1">
        <button
          onClick={() => selectView('active', { pinned: true })}
          className={cn(
            'nav-item',
            view === 'active' && pinnedOnly && !tag && !category && 'nav-item-active',
          )}
        >
          <Star />
          常用入口
        </button>
      </div>
      <div className="border-t border-border/80 pt-5">
        <div className="mb-3 flex items-center gap-2 px-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          <FolderTree className="size-3.5" />
          分类
          <span className="ml-auto font-mono text-[10px] font-normal tracking-normal">
            {categories.length}
          </span>
          <button
            type="button"
            onClick={() => setCategoryManagerOpen(true)}
            className="grid size-6 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="管理分类"
          >
            <Settings2 className="size-3.5" />
          </button>
        </div>
        <CategorySidebar
          categories={categories}
          selectedSlug={category}
          onSelect={selectCategory}
        />
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
          {view === 'active' ? (
            <TagFilterBar tags={tags} selected={tag} onSelect={selectTagFilter} />
          ) : null}
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
          ) : landing ? (
            <div className="space-y-10">
              {grouped.map((section) => {
                const Icon = section.icon ? categoryIcon(section.icon) : FolderPlus;
                return (
                  <section key={section.slug} aria-labelledby={`landing-section-${section.slug}`}>
                    <div className="mb-3 flex items-center gap-2">
                      <Icon className="size-4 text-primary" />
                      <h2
                        id={`landing-section-${section.slug}`}
                        className="font-display text-base font-semibold"
                      >
                        {section.name}
                      </h2>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {section.bookmarks.length}
                      </span>
                    </div>
                    <div
                      className={cn(
                        viewMode === 'grid'
                          ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'
                          : 'grid gap-2',
                      )}
                    >
                      {section.bookmarks.map(renderCard)}
                    </div>
                  </section>
                );
              })}
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
                {page.items.map(renderCard)}
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
            availableCategories={categories}
            defaultCategoryId={
              editor === 'new' && category && category !== UNCATEGORIZED_SLUG
                ? (categories.find((item) => item.slug === category)?.id ?? null)
                : null
            }
            onClose={() => setEditor(null)}
            onSubmit={async (input: BookmarkInput) => {
              if (editor !== 'new' && editor !== null)
                await api.updateBookmark('', editor.id, input);
              else await api.createBookmark('', input);
              setEditor(null);
              page.refresh();
              await loadTags();
              await loadCategories();
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
              await loadCategories();
            }}
          />
        ) : null}
        {settingsOpen ? <SettingsPanel open onClose={() => setSettingsOpen(false)} /> : null}
        {categoryManagerOpen ? (
          <CategoryManager
            open
            categories={categories}
            onClose={() => setCategoryManagerOpen(false)}
            onChanged={async () => {
              const next = await loadCategories();
              page.refresh();
              // 若当前按分类筛选时该分类被删除，清空筛选避免空结果。
              if (
                category &&
                category !== UNCATEGORIZED_SLUG &&
                next !== null &&
                !next.some((item) => item.slug === category)
              ) {
                setCategory(undefined);
              }
            }}
          />
        ) : null}
      </Suspense>
    </>
  );
}
