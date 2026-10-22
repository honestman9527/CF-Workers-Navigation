import type { AdminStats } from '@shared/api/types';

import { useNavigate } from '@tanstack/react-router';
import { Archive, Bookmark, FolderTree, Globe, Inbox, Tags, Trash2 } from 'lucide-react';
import { useCallback } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@nav/api/client';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { useApiData } from '@nav/hooks/useApiData';

import { AdminErrorAlert } from './AdminErrorAlert';

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
      label: '正常书签',
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
    <section
      aria-label="书签统计"
      className="grid overflow-hidden rounded-2xl border border-border/60 bg-card lg:grid-cols-[1fr_2fr]"
    >
      <div className="flex flex-col justify-center border-b border-border/50 p-6 sm:p-8 lg:border-r lg:border-b-0">
        <Bookmark className="mb-5 size-6 text-primary" />
        <span className="text-sm text-muted-foreground">书签总数</span>
        <strong className="mt-2 text-5xl font-semibold tracking-tight tabular-nums">
          {stats.bookmarks.total}
        </strong>
        <span className="mt-3 text-xs text-muted-foreground">包含使用中、已归档与回收站</span>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3">
        {cards.slice(1).map(({ key, label, value, icon: Icon, to }) => (
          <div key={key} className="min-w-0 p-5 sm:p-7">
            <dt className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon className="size-4" />
              {label}
            </dt>
            <dd className="mt-3 text-2xl font-semibold tabular-nums">
              {to ? (
                <button
                  type="button"
                  className="min-h-11 rounded-lg text-primary hover:underline"
                  aria-label={`管理${label}，共 ${value} 个`}
                  onClick={() => onNavigate(to)}
                >
                  {value}
                </button>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function OverviewTab() {
  const navigate = useNavigate();
  const auth = useAuthContext();

  const loadStats = useCallback((signal: AbortSignal) => api.getAdminStats(signal), []);
  const {
    data: stats,
    loading,
    error,
    refresh,
  } = useApiData(loadStats, {
    onUnauthorized: () => void auth.logout(),
  });

  function go(to: '/admin/categories' | '/admin/tags' | '/admin/websites') {
    void navigate({ to });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight">概览</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          书签柜的整体规模一览。分类、标签与书签的整理入口在对应侧栏。
        </p>
      </div>

      {error ? <AdminErrorAlert message={error} onRetry={refresh} retrying={loading} /> : null}
      {loading && stats === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : stats === null ? null : (
        <StatCards stats={stats} onNavigate={go} />
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          onClick={() => go('/admin/websites')}
          className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-5 text-left transition hover:border-primary/45 sm:p-6"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Globe className="size-5" />
          </span>
          <span className="min-w-0">
            <strong className="block text-sm font-semibold">管理书签</strong>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              统一浏览全部书签，搜索、筛选与整理
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => go('/admin/categories')}
          className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-5 text-left transition hover:border-primary/45 sm:p-6"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
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
          className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-5 text-left transition hover:border-primary/45 sm:p-6"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
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
        <p className="px-1 py-2 text-xs text-muted-foreground">
          当前共有 {stats.bookmarks.total} 个书签（含回收站），分类 {stats.categories} 个，标签{' '}
          {stats.tags} 个。回收站中的书签可随时永久删除。
        </p>
      ) : null}
    </div>
  );
}
