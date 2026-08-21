import type { AdminStats } from '@shared/api/types';

import type { AdminTab } from './AdminPage';

import { Archive, Bookmark, FolderTree, Inbox, Tags, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { api } from '@nav/api/client';

type StatCard = {
  key: string;
  label: string;
  value: number;
  icon: typeof Bookmark;
  tone: 'primary' | 'muted' | 'accent' | 'warn';
  navigate?: AdminTab;
};

function StatCards({
  stats,
  onNavigate,
}: {
  stats: AdminStats;
  onNavigate: (tab: AdminTab) => void;
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
      navigate: 'categories',
    },
    { key: 'tags', label: '标签', value: stats.tags, icon: Tags, tone: 'muted', navigate: 'tags' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className={cn(
              'flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm',
              card.navigate &&
                'cursor-pointer transition hover:border-primary/45 hover:shadow-soft',
            )}
            role={card.navigate ? 'button' : undefined}
            tabIndex={card.navigate ? 0 : undefined}
            onClick={card.navigate ? () => onNavigate(card.navigate!) : undefined}
            onKeyDown={
              card.navigate
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onNavigate(card.navigate!);
                    }
                  }
                : undefined
            }
          >
            <div className="flex items-center justify-between gap-2">
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
            </div>
            <span className="truncate text-xs text-muted-foreground">{card.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function OverviewTab({ onNavigate }: { onNavigate: (tab: AdminTab) => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getAdminStats()
      .then((next) => {
        if (alive) setStats(next);
      })
      .catch((caught) => {
        if (alive) setError(caught instanceof Error ? caught.message : '统计加载失败');
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">概览</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          书签柜的整体规模一览。分类与标签的整理入口在对应 tab。
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : stats === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <StatCards stats={stats} onNavigate={onNavigate} />
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onNavigate('categories')}
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
          onClick={() => onNavigate('tags')}
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
