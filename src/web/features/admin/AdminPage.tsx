import { Link, Outlet } from '@tanstack/react-router';
import {
  ArrowDownToLine,
  ArrowLeft,
  FolderTree,
  LayoutDashboard,
  Settings,
  Tags,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TABS: Array<{
  to: '/admin' | '/admin/categories' | '/admin/tags' | '/admin/settings' | '/admin/data';
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}> = [
  { to: '/admin', label: '概览', icon: LayoutDashboard, end: true },
  { to: '/admin/categories', label: '分类', icon: FolderTree },
  { to: '/admin/tags', label: '标签', icon: Tags },
  { to: '/admin/settings', label: '设置', icon: Settings },
  { to: '/admin/data', label: '导入/导出', icon: ArrowDownToLine },
];

function tabClass(active: boolean) {
  return cn(
    'flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm text-muted-foreground transition hover:text-foreground',
    active ? 'border-primary font-medium text-primary' : 'border-transparent hover:border-border',
  );
}

/** 管理后台布局：tab 导航由 URL 驱动，各 tab 内容经 Outlet 渲染（独立懒加载 chunk）。 */
export function AdminPage() {
  return (
    <div className="min-h-[100dvh] w-full max-w-full overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-40 w-full max-w-full border-b border-border/60 bg-background/80 pt-[var(--safe-t)] backdrop-blur-xl">
        <div className="mx-auto flex h-[var(--header-h)] max-w-[70rem] items-center gap-3 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            render={<Link to="/" />}
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
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={tabClass(false)}
                  activeProps={{ className: tabClass(true) }}
                  activeOptions={item.end ? { exact: true } : undefined}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[70rem] px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
