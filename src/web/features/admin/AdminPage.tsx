import { Link, Outlet, useLocation } from '@tanstack/react-router';
import {
  ArrowDownToLine,
  ArrowLeft,
  FolderTree,
  Globe,
  LayoutDashboard,
  LogOut,
  Settings,
  Tags,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { getPreferredFrontRoute, getPreferredFrontView } from '@nav/features/settings/store';

const NAV: Array<{
  to:
    | '/admin'
    | '/admin/websites'
    | '/admin/categories'
    | '/admin/tags'
    | '/admin/settings'
    | '/admin/data';
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}> = [
  { to: '/admin', label: '概览', icon: LayoutDashboard, end: true },
  { to: '/admin/websites', label: '网站', icon: Globe },
  { to: '/admin/categories', label: '分类', icon: FolderTree },
  { to: '/admin/tags', label: '标签', icon: Tags },
  { to: '/admin/settings', label: '设置', icon: Settings },
  { to: '/admin/data', label: '导入/导出', icon: ArrowDownToLine },
];

/** 侧栏导航项：移动端点击后收起抽屉；active 态由当前路径决定。 */
function AdminNavItem({ to, label, icon: Icon, end }: (typeof NAV)[number]) {
  const { setOpenMobile } = useSidebar();
  const { pathname } = useLocation();
  const active = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <Link
      to={to}
      onClick={() => setOpenMobile(false)}
      aria-current={active ? 'page' : undefined}
      className={cn('nav-item rounded-xl px-3 py-2.5', active && 'nav-item-active')}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}

/** 管理后台布局：侧边栏导航（桌面常驻浮动栏 + 移动端抽屉）+ 路由内容区。 */
export function AdminPage() {
  const auth = useAuthContext();
  const frontRoute = getPreferredFrontRoute();
  const frontViewMode = getPreferredFrontView();
  const returnLabel = frontViewMode === 'workspace' ? '返回书签柜' : '返回启动台';

  return (
    <div className="app-root min-h-[100dvh] w-full max-w-full overflow-x-clip bg-background text-foreground">
      <SidebarProvider>
        <Sidebar
          collapsible="none"
          variant="floating"
          className="top-4 m-4 h-[calc(100dvh-2rem)] w-[15rem] xl:w-[16rem]"
        >
          <SidebarContent className="gap-6 p-4">
            <div className="flex items-center gap-2.5 px-1">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                <LayoutDashboard className="size-4" />
              </span>
              <div className="min-w-0">
                <strong className="block truncate font-display text-base">管理后台</strong>
                <span className="block text-[11px] text-muted-foreground">书签柜设置与整理</span>
              </div>
            </div>

            <nav className="grid gap-1" aria-label="管理后台导航">
              {NAV.map((item) => (
                <AdminNavItem
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  icon={item.icon}
                  end={item.end}
                />
              ))}
            </nav>

            <div className="mt-auto grid gap-1 border-t border-border/80 pt-3">
              <Link to={frontRoute} className="nav-item rounded-xl px-3 py-2.5">
                <ArrowLeft className="size-4" />
                {returnLabel}
              </Link>
              <button
                type="button"
                onClick={() => void auth.logout()}
                className="nav-item rounded-xl px-3 py-2.5 text-destructive hover:text-destructive"
              >
                <LogOut className="size-4" />
                退出登录
              </button>
            </div>
          </SidebarContent>
        </Sidebar>

        <SidebarInset className="app-inset overflow-x-clip">
          <header className="sticky top-0 z-30 flex h-[var(--header-h)] items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:px-6">
            <div className="lg:hidden">
              <SidebarTrigger />
            </div>
            <span className="font-display text-sm font-semibold sm:hidden">管理后台</span>
            <span className="hidden font-mono text-[11px] tracking-wide text-muted-foreground uppercase sm:block">
              管理后台 · 设置与整理
            </span>
          </header>

          <main className="mx-auto w-full max-w-[70rem] px-4 py-6 sm:px-6 sm:py-8">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
