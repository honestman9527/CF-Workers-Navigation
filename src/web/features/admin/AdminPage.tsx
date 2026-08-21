import { ArrowLeft, FolderTree, LayoutDashboard, Settings, Tags } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { CategoriesTab } from './CategoriesTab';
import { OverviewTab } from './OverviewTab';
import { SettingsTab } from './SettingsTab';
import { TagsTab } from './TagsTab';

export type AdminTab = 'overview' | 'categories' | 'tags' | 'settings';

const TABS: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: '概览', icon: LayoutDashboard },
  { id: 'categories', label: '分类', icon: FolderTree },
  { id: 'tags', label: '标签', icon: Tags },
  { id: 'settings', label: '设置', icon: Settings },
];

export function AdminPage({
  initialTab = 'overview',
  onExit,
}: {
  initialTab?: AdminTab;
  onExit: () => void;
}) {
  const [tab, setTab] = useState<AdminTab>(initialTab);

  return (
    <div className="min-h-[100dvh] w-full max-w-full overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-40 w-full max-w-full border-b border-border/60 bg-background/80 pt-[var(--safe-t)] backdrop-blur-xl">
        <div className="mx-auto flex h-[var(--header-h)] max-w-[70rem] items-center gap-3 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            onClick={onExit}
            aria-label="返回书签柜"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">书签柜</span>
          </Button>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <LayoutDashboard className="size-4" />
          </span>
          <strong className="min-w-0 truncate font-display text-base">管理后台</strong>
        </div>
      </header>

      <nav className="sticky top-[var(--header-h)] z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-[70rem] overflow-x-auto px-4 sm:px-6">
          <div className="flex gap-1">
            {TABS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm text-muted-foreground transition hover:text-foreground',
                    active
                      ? 'border-primary font-medium text-primary'
                      : 'border-transparent hover:border-border',
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[70rem] px-4 py-6 sm:px-6 sm:py-8">
        {tab === 'overview' ? <OverviewTab onNavigate={setTab} /> : null}
        {tab === 'categories' ? <CategoriesTab /> : null}
        {tab === 'tags' ? <TagsTab /> : null}
        {tab === 'settings' ? <SettingsTab /> : null}
      </main>
    </div>
  );
}
