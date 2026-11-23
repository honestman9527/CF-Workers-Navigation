import type { CategoryNode } from '@nav/features/categories/tree';
import type { Bookmark } from '@shared/api/types';

import { Dialog } from '@base-ui/react/dialog';
import {
  PALETTE_OPTIONS,
  type Palette,
  type ResolvedTheme,
  type Theme,
  type ViewDensity,
} from '@shared';
import {
  Check,
  CornerDownLeft,
  ExternalLink,
  Folder,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  List,
  LockKeyhole,
  LogIn,
  Monitor,
  Moon,
  Plus,
  Search,
  Star,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { isComposingKey } from '@/lib/keyboard';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@nav/api/client';
import { ImageWithFallback } from '@nav/components/ImageWithFallback';
import { flattenCategoryTree } from '@nav/features/categories/tree';
import { domainOf } from '@shared/search';

type PaletteEntry = {
  id: string;
  group: 'bookmarks' | 'categories' | 'actions' | 'appearance';
  title: string;
  subtitle?: string;
  badge?: string;
  iconUrl?: string | null;
  swatch?: string;
  active?: boolean;
  privateItem?: boolean;
  iconKind?:
    | 'star'
    | 'inbox'
    | 'folder'
    | 'plus'
    | 'admin'
    | 'login'
    | 'light'
    | 'dark'
    | 'system'
    | 'comfortable'
    | 'compact';
  onSelect: () => void;
};

const GROUP_LABELS: Record<PaletteEntry['group'], string> = {
  bookmarks: '书签直达',
  categories: '切换分类',
  actions: '快捷操作',
  appearance: '主题与视图',
};

const GROUP_ORDER: readonly PaletteEntry['group'][] = [
  'bookmarks',
  'categories',
  'actions',
  'appearance',
];

function EntryIcon({ entry }: { entry: PaletteEntry }) {
  if (entry.swatch) {
    return (
      <span
        aria-hidden="true"
        className="size-4 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
        style={{ backgroundColor: entry.swatch }}
      />
    );
  }
  if (entry.group === 'bookmarks') {
    return (
      <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-secondary/70">
        <ImageWithFallback
          src={entry.iconUrl ?? null}
          loading="lazy"
          className="size-4 rounded-sm object-contain"
          fallback={
            <span className="text-xs font-semibold text-primary">
              {entry.title.charAt(0).toUpperCase()}
            </span>
          }
        />
      </span>
    );
  }
  const iconClass = 'size-4 shrink-0 text-muted-foreground';
  switch (entry.iconKind) {
    case 'star':
      return <Star className={iconClass} />;
    case 'inbox':
      return <Inbox className={iconClass} />;
    case 'folder':
      return <Folder className={iconClass} />;
    case 'plus':
      return <Plus className="size-4 shrink-0 text-primary" />;
    case 'admin':
      return <LayoutDashboard className={iconClass} />;
    case 'login':
      return <LogIn className={iconClass} />;
    case 'light':
      return <Sun className={iconClass} />;
    case 'dark':
      return <Moon className={iconClass} />;
    case 'system':
      return <Monitor className={iconClass} />;
    case 'comfortable':
      return <LayoutGrid className={iconClass} />;
    case 'compact':
      return <List className={iconClass} />;
    default:
      return <ExternalLink className={iconClass} />;
  }
}

/**
 * 全局命令面板（Cmd/Ctrl + K）：
 * 整合站内书签快速跳转（200ms 防抖检索）、两级分类切换、主题/配色/视图密度切换与管理员快捷入口。
 */
export function CommandPalette({
  open,
  onOpenChange,
  roots,
  totals,
  recentBookmarks,
  theme,
  resolvedTheme,
  setTheme,
  palette,
  setPalette,
  density,
  setDensity,
  authed,
  onSelectCategory,
  onOpenBookmark,
  onCreateBookmark,
  onAdmin,
  onLogin,
  onUnauthorized,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roots: CategoryNode[];
  totals: Map<number, number>;
  recentBookmarks: Bookmark[];
  theme: Theme;
  resolvedTheme?: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  palette: Palette;
  setPalette: (palette: Palette) => void;
  density: ViewDensity;
  setDensity: (density: ViewDensity) => void;
  authed: boolean;
  onSelectCategory: (slug?: string) => void;
  onOpenBookmark: (url: string) => void;
  onCreateBookmark: () => void;
  onAdmin: () => void;
  onLogin: () => void;
  onUnauthorized: () => void;
}) {
  const [query, setQuery] = useState('');
  const [composing, setComposing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [remoteItems, setRemoteItems] = useState<Bookmark[]>([]);
  const [searchingRemote, setSearchingRemote] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const unauthorizedRef = useRef(onUnauthorized);
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    unauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      setRemoteItems([]);
      setSearchingRemote(false);
    }
  }, [open]);

  // 输入关键词时防抖 200ms 检索站内书签，支持跨分类秒级直达。
  useEffect(() => {
    if (!open || composing) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setRemoteItems([]);
      setSearchingRemote(false);
      return;
    }
    const controller = new AbortController();
    setSearchingRemote(true);
    const timer = window.setTimeout(() => {
      void api
        .searchBookmarks(trimmed, { view: 'active', limit: 8 }, controller.signal)
        .then((page) => {
          if (!controller.signal.aborted) {
            setRemoteItems(page.items);
            setSearchingRemote(false);
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSearchingRemote(false);
          if (error instanceof ApiError && error.status === 401) {
            unauthorizedRef.current();
          }
        });
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, composing]);

  const flatCategories = useMemo(() => {
    const parentName = new Map<number, string>();
    for (const root of roots) parentName.set(root.id, root.name);
    return flattenCategoryTree(roots).map((node) => ({
      node,
      path:
        node.parentId !== null && parentName.has(node.parentId)
          ? `${parentName.get(node.parentId)} / ${node.name}`
          : node.name,
      count:
        node.parentId === null
          ? (totals.get(node.id) ?? node.bookmarkCount ?? 0)
          : (node.bookmarkCount ?? 0),
    }));
  }, [roots, totals]);

  const entries = useMemo<PaletteEntry[]>(() => {
    const keyword = query.trim().toLocaleLowerCase();
    const matches = (...fields: (string | null | undefined)[]) =>
      !keyword || fields.some((field) => field?.toLocaleLowerCase().includes(keyword));

    const bookmarkPool = keyword
      ? [
          ...remoteItems,
          ...recentBookmarks.filter(
            (local) =>
              !remoteItems.some((remote) => remote.id === local.id) &&
              matches(
                local.title,
                local.url,
                local.description,
                local.categoryName,
                ...(local.tags ?? []),
              ),
          ),
        ].slice(0, 8)
      : recentBookmarks.slice(0, 5);

    const bookmarkEntries: PaletteEntry[] = bookmarkPool.map((bookmark) => ({
      id: `bm-${bookmark.id}`,
      group: 'bookmarks',
      title: bookmark.title,
      subtitle: bookmark.description || domainOf(bookmark.url),
      badge: bookmark.categoryName ?? undefined,
      iconUrl: bookmark.iconUrl,
      privateItem: bookmark.effectiveVisibility === 'private',
      onSelect: () => {
        onOpenBookmark(bookmark.url);
        onOpenChange(false);
      },
    }));

    const categoryEntries: PaletteEntry[] = [];
    if (matches('常用', '星标', 'pinned', 'common')) {
      categoryEntries.push({
        id: 'cat-common',
        group: 'categories',
        title: '常用',
        subtitle: '查看置顶常用网站',
        iconKind: 'star',
        onSelect: () => {
          onSelectCategory();
          onOpenChange(false);
        },
      });
    }
    for (const { node, path, count } of flatCategories) {
      if (!matches(node.name, node.slug, path)) continue;
      categoryEntries.push({
        id: `cat-${node.id}`,
        group: 'categories',
        title: node.name,
        subtitle: node.depth > 0 ? path : '一级分类',
        badge: count > 0 ? `${count} 项` : undefined,
        privateItem: node.effectiveVisibility === 'private',
        iconKind: 'folder',
        onSelect: () => {
          onSelectCategory(node.slug);
          onOpenChange(false);
        },
      });
    }
    if (matches('未分类', 'uncategorized')) {
      categoryEntries.push({
        id: 'cat-uncategorized',
        group: 'categories',
        title: '未分类',
        subtitle: '查看尚未归类的书签',
        iconKind: 'inbox',
        onSelect: () => {
          onSelectCategory('uncategorized');
          onOpenChange(false);
        },
      });
    }

    const actionEntries: PaletteEntry[] = [];
    if (authed) {
      if (matches('添加书签', '新建书签', '新增', 'add', 'new', 'bookmark')) {
        actionEntries.push({
          id: 'act-new',
          group: 'actions',
          title: '添加书签',
          subtitle: '快速收藏一个新网站',
          iconKind: 'plus',
          onSelect: () => {
            onOpenChange(false);
            onCreateBookmark();
          },
        });
      }
      if (matches('管理后台', '后台', 'admin', 'dashboard')) {
        actionEntries.push({
          id: 'act-admin',
          group: 'actions',
          title: '打开管理后台',
          subtitle: '管理书签、分类、标签与系统设置',
          iconKind: 'admin',
          onSelect: () => {
            onOpenChange(false);
            onAdmin();
          },
        });
      }
    } else if (matches('管理员登录', '登录', 'login')) {
      actionEntries.push({
        id: 'act-login',
        group: 'actions',
        title: '管理员登录',
        subtitle: '登录后查看私有内容并快速编辑',
        iconKind: 'login',
        onSelect: () => {
          onOpenChange(false);
          onLogin();
        },
      });
    }

    const appearanceEntries: PaletteEntry[] = [];
    const themeItems = [
      { value: 'light', title: '切换到亮色模式', aliases: '亮色 白天 light', iconKind: 'light' },
      { value: 'dark', title: '切换到暗色模式', aliases: '暗色 夜间 深色 dark', iconKind: 'dark' },
      {
        value: 'system',
        title: '跟随系统主题',
        aliases: '系统 自动 system theme',
        iconKind: 'system',
      },
    ] as const;
    for (const item of themeItems) {
      if (!matches(item.title, item.aliases)) continue;
      appearanceEntries.push({
        id: `theme-${item.value}`,
        group: 'appearance',
        title: item.title,
        active: theme === item.value,
        iconKind: item.iconKind,
        onSelect: () => {
          setTheme(item.value);
          onOpenChange(false);
        },
      });
    }

    for (const option of PALETTE_OPTIONS) {
      if (!matches(`主题色 ${option.label}`, option.id, '配色', 'palette', 'color')) continue;
      appearanceEntries.push({
        id: `palette-${option.id}`,
        group: 'appearance',
        title: `主题色：${option.label}`,
        subtitle: option.id,
        swatch: isDark ? option.dark : option.light,
        active: palette === option.id,
        onSelect: () => {
          setPalette(option.id);
          onOpenChange(false);
        },
      });
    }

    if (matches('舒适卡片视图', '舒适', 'density', 'comfortable')) {
      appearanceEntries.push({
        id: 'density-comfortable',
        group: 'appearance',
        title: '切换为舒适卡片视图',
        active: density === 'comfortable',
        iconKind: 'comfortable',
        onSelect: () => {
          setDensity('comfortable');
          onOpenChange(false);
        },
      });
    }
    if (matches('紧凑网格视图', '紧凑', 'density', 'compact')) {
      appearanceEntries.push({
        id: 'density-compact',
        group: 'appearance',
        title: '切换为紧凑网格视图',
        active: density === 'compact',
        iconKind: 'compact',
        onSelect: () => {
          setDensity('compact');
          onOpenChange(false);
        },
      });
    }

    return [...bookmarkEntries, ...categoryEntries, ...actionEntries, ...appearanceEntries];
  }, [
    query,
    remoteItems,
    recentBookmarks,
    flatCategories,
    authed,
    theme,
    palette,
    density,
    isDark,
    onOpenBookmark,
    onOpenChange,
    onSelectCategory,
    onCreateBookmark,
    onAdmin,
    onLogin,
    setTheme,
    setPalette,
    setDensity,
  ]);

  const safeIndex = entries.length === 0 ? -1 : Math.min(activeIndex, entries.length - 1);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (safeIndex < 0) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-cmd-index="${safeIndex}"]`);
    node?.scrollIntoView?.({ block: 'nearest' });
  }, [safeIndex]);

  const grouped = useMemo(() => {
    const groups: Array<{
      group: PaletteEntry['group'];
      items: Array<{ entry: PaletteEntry; index: number }>;
    }> = [];
    for (const group of GROUP_ORDER) {
      const items: Array<{ entry: PaletteEntry; index: number }> = [];
      entries.forEach((entry, index) => {
        if (entry.group === group) items.push({ entry, index });
      });
      if (items.length > 0) groups.push({ group, items });
    }
    return groups;
  }, [entries]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          aria-label="全局命令面板"
          initialFocus={inputRef}
          className="front-surface glass-surface animate-panel-enter fixed top-[12vh] left-1/2 z-50 flex max-h-[min(76dvh,38rem)] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none"
        >
          <Dialog.Title className="sr-only">全局命令面板</Dialog.Title>
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索书签、分类或快捷命令"
              placeholder="搜索书签、切换分类、主题色或执行操作…"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground sm:text-base"
              onKeyDown={(event) => {
                if (isComposingKey(event.nativeEvent)) return;
                if (event.key === 'ArrowDown' && entries.length > 0) {
                  event.preventDefault();
                  setActiveIndex((prev) => (prev + 1) % entries.length);
                } else if (event.key === 'ArrowUp' && entries.length > 0) {
                  event.preventDefault();
                  setActiveIndex((prev) => (prev <= 0 ? entries.length - 1 : prev - 1));
                } else if (event.key === 'Home' && entries.length > 0) {
                  event.preventDefault();
                  setActiveIndex(0);
                } else if (event.key === 'End' && entries.length > 0) {
                  event.preventDefault();
                  setActiveIndex(entries.length - 1);
                } else if (event.key === 'Enter' && safeIndex >= 0 && entries[safeIndex]) {
                  event.preventDefault();
                  entries[safeIndex].onSelect();
                }
              }}
            />
            {query ? (
              <button
                type="button"
                aria-label="清空命令输入"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : null}
            <kbd className="hidden rounded-md border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline-block">
              Esc
            </kbd>
          </div>

          <div
            ref={listRef}
            role="listbox"
            aria-label="命令结果"
            className="scrollbar-safe min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
          >
            {searchingRemote ? (
              <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
                正在检索站内书签…
              </p>
            ) : null}
            {grouped.length === 0 && !searchingRemote ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                没有匹配的结果，试试输入其他关键词
              </div>
            ) : (
              grouped.map(({ group, items }) => (
                <div key={group} className="mb-2 last:mb-0">
                  <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
                    {GROUP_LABELS[group]}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {items.map(({ entry, index }) => {
                      const selected = index === safeIndex;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          data-cmd-index={index}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={entry.onSelect}
                          className={cn(
                            'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors outline-none',
                            selected
                              ? 'bg-accent text-foreground'
                              : 'text-foreground hover:bg-secondary/70',
                          )}
                        >
                          <EntryIcon entry={entry} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-medium">{entry.title}</span>
                              {entry.privateItem ? (
                                <LockKeyhole
                                  aria-label="私有"
                                  className="size-3.5 shrink-0 text-primary"
                                />
                              ) : null}
                            </span>
                            {entry.subtitle ? (
                              <span className="block truncate text-xs text-muted-foreground">
                                {entry.subtitle}
                              </span>
                            ) : null}
                          </span>
                          {entry.badge ? (
                            <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                              {entry.badge}
                            </span>
                          ) : null}
                          {entry.active ? (
                            <Check className="size-4 shrink-0 text-primary" />
                          ) : selected ? (
                            <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border bg-secondary/45 px-4 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-3">
              <span>↑↓ 选择</span>
              <span>↵ 执行</span>
              <span>Esc 关闭</span>
            </span>
            <span className="hidden sm:inline">Cmd / Ctrl + K</span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
