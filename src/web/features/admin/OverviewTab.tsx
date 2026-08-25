import type { AdminStats } from '@shared/api/types';

import { useNavigate } from '@tanstack/react-router';
import { Archive, Bookmark, FolderTree, Globe, Inbox, Tags, Trash2 } from 'lucide-react';
import { useCallback } from 'react';

import { cn } from '@/lib/utils';
import { api } from '@nav/api/client';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { useApiData } from '@nav/hooks/useApiData';

type StatCard = {
  key: string;
  label: string;
  value: number;
  icon: typeof Bookmark;
  tone: 'primary' | 'muted' | 'accent' | 'warn';
  to?: '/admin/categories' | '/admin/tags' | '/admin/websites';
};

function StatCards({
  stats,
  onNavigate,
}: {
  stats: AdminStats;
  onNavigate: (to: '/admin/categories' | '/admin/tags' | '/admin/websites') => void;
}) {
  const cards: StatCard[] = [
    {
      key: 'total',
      label: '书签总数',
      value: stats.bookmarks.total,
      icon: Bookmark,
      tone: 'primary',
    },
    {
      key: 'active',
      label: '活动书签',
      value: stats.bookmarks.active,
      icon: Inbox,
      tone: 'accent',
    },
    {
      key: 'archived',
      label: '已归档',
      value: stats.bookmarks.archived,
      icon: Archive,
      tone: 'muted',
    },
    {
      key: 'trash',
      label: '回收站',
      value: stats.bookmarks.trash,
      icon: Trash2,
      tone: 'warn',
    },
    {
      key: 'categories',
      label: '分类',
      value: stats.categories,
      icon: FolderTree,
      tone: 'muted',
      to: '/admin/categories',
    },
    { key: 'tags', label: '标签', value: stats.tags, icon: Tags, tone: 'muted', to: '/admin/tags' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => {
        const Icon = card.icon;
        if (card.to) {
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => onNavigate(card.to!)}
              className={cn(
                'flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm transition hover:border-primary/45 hover:shadow-soft',
              )}
            >
              <span
                className={cn(
                  'grid size-8 place-items-center rounded-lg',
                  card.tone === 'primary' && 'bg-primary/10 text-primary',
                  card.tone === 'accent' && 'bg-accent text-accent-foreground',
                  card.tone === 'warn' && 'bg-amber-500/10 text-amber-500',
                  card.tone === 'muted' && 'bg-muted text-muted-foreground',
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="font-display text-2xl font-semibold tabular-nums">{card.value}</span>
              <span className="truncate text-xs text-muted-foreground">{card.label}</span>
            </button>
          );
        }
        return (
          <div
            key={card.key}
            className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm"
          >
            <span
              className={cn(
                'grid size-8 place-items-center rounded-lg',
                card.tone === 'primary' && 'bg-primary/10 text-primary',
                card.tone === 'accent' && 'bg-accent text-accent-foreground',
                card.tone === 'warn' && 'bg-amber-500/10 text-amber-500',
                card.tone === 'muted' && 'bg-muted text-muted-foreground',
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="font-display text-2xl font-semibold tabular-nums">{card.value}</span>
            <span className="truncate text-xs text-muted-foreground">{card.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function OverviewTab() {
  const navigate = useNavigate();
  const auth = useAuthContext();

  const loadStats = useCallback((signal: AbortSignal) => api.getAdminStats(undefined, signal), []);
  const {
    data: stats,
    loading,
    error,
  } = useApiData(loadStats, {
    onUnauthorized: () => void auth.logout(),
  });

  function go(to: '/admin/categories' | '/admin/tags' | '/admin/websites') {
    void navigate({ to });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">概览</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          书签柜的整体规模一览。分类、标签与网站的整理入口在对应侧栏。
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : stats === null ? null : (
        <StatCards stats={stats} onNavigate={go} />
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          onClick={() => go('/admin/websites')}
          className="flex items-center gap-4 rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm transition hover:border-primary/45 hover:shadow-soft"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Globe className="size-5" />
          </span>
          <span className="min-w-0">
            <strong className="block text-sm font-semibold">管理网站</strong>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              统一浏览全部书签，搜索、筛选与整理
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => go('/admin/categories')}
          className="flex items-center gap-4 rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm transition hover:border-primary/45 hover:shadow-soft"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <FolderTree className="size-5" />
          </span>
          <span className="min-w-0">
            <strong className="block text-sm font-semibold">管理分类</strong>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              新建、重命名、移动、排序与删除分类
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => go('/admin/tags')}
          className="flex items-center gap-4 rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm transition hover:border-primary/45 hover:shadow-soft"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Tags className="size-5" />
          </span>
          <span className="min-w-0">
            <strong className="block text-sm font-semibold">管理标签</strong>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              新建、重命名、合并与删除标签
            </span>
          </span>
        </button>
      </section>

      {stats !== null ? (
        <p className="rounded-lg border border-border/70 bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          当前共有 {stats.bookmarks.total} 个书签（含回收站），分类 {stats.categories} 个，标签{' '}
          {stats.tags} 个。回收站中的书签可随时永久删除。
        </p>
      ) : null}
    </div>
  );
}
