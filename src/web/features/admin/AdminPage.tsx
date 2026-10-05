import { Link, Outlet, useLocation } from '@tanstack/react-router';
import {
  ArrowDownToLine,
  ArrowLeft,
  Ellipsis,
  FolderTree,
  Globe,
  LayoutDashboard,
  LogOut,
  Settings,
  Tags,
} from 'lucide-react';
import { useRef, useState, type CSSProperties } from 'react';

import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { pushToast } from '@nav/components/Toast';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { BrandIcon } from '@nav/features/layout/BrandIcon';
import { getPreferredFrontRoute, getPreferredFrontView } from '@nav/features/settings/store';
import { ThemeMenuOptions } from '@nav/features/settings/ThemeMenuOptions';
import { useTheme } from '@nav/hooks/useTheme';

const ADMIN_SIDEBAR_STORAGE_KEY = 'nav-admin-sidebar-open';

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
  { to: '/admin/websites', label: '书签', icon: Globe },
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
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link to={to} onClick={() => setOpenMobile(false)} />}
        isActive={active}
        aria-current={active ? 'page' : undefined}
        className="h-10 px-2"
      >
        <Icon />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AdminSidebarContent({
  frontRoute,
  returnLabel,
  onLogout,
  loggingOut,
  themeSettings,
}: {
  frontRoute: '/launch' | '/workspace';
  returnLabel: string;
  onLogout: () => void;
  loggingOut: boolean;
  themeSettings: ReturnType<typeof useTheme>;
}) {
  const { open, isMobile, setOpenMobile } = useSidebar();
  const { theme, setTheme } = themeSettings;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      inert={!isMobile && !open}
      aria-hidden={!isMobile && !open ? true : undefined}
    >
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-2.5">
          <BrandIcon className="size-9" />
          <div className="min-w-0">
            <strong className="block truncate font-display text-base">管理后台</strong>
            <span className="block text-[11px] text-muted-foreground">书签柜设置与整理</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-1">
        <nav aria-label="管理后台导航">
          <SidebarMenu className="gap-1">
            {NAV.map((item) => (
              <AdminNavItem key={item.to} {...item} />
            ))}
          </SidebarMenu>
        </nav>
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter className="p-2">
        <SidebarMenu className="flex-row items-center gap-1">
          <SidebarMenuItem className="min-w-0 flex-1">
            <SidebarMenuButton
              render={<Link to={frontRoute} onClick={() => setOpenMobile(false)} />}
              className="h-10 px-2"
            >
              <ArrowLeft />
              <span>{returnLabel}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    type="button"
                    className="size-10 justify-center"
                    aria-label="更多管理操作"
                    title="更多管理操作"
                  />
                }
              >
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isMobile ? 'top' : 'right'}
                align="end"
                sideOffset={8}
                className="w-44"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>主题</DropdownMenuLabel>
                  <ThemeMenuOptions theme={theme} onThemeChange={setTheme} />
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem variant="destructive" disabled={loggingOut} onClick={onLogout}>
                    <LogOut />
                    {loggingOut ? '退出中…' : '退出登录'}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </div>
  );
}

function AdminSidebarTrigger() {
  const { open, openMobile, isMobile } = useSidebar();
  const expanded = isMobile ? openMobile : open;
  const label = expanded ? '收起管理导航' : '展开管理导航';
  return <SidebarTrigger aria-label={label} title={label} aria-expanded={expanded} />;
}

/** 管理后台布局：桌面侧栏可收起，移动端为抽屉；主题设置位于侧栏底部。 */
export function AdminPage() {
  const auth = useAuthContext();
  const themeSettings = useTheme();
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPending = useRef(false);
  const { pathname } = useLocation();
  const currentLabel = NAV.find((item) => item.to === pathname)?.label ?? '概览';
  const frontRoute = getPreferredFrontRoute();
  const frontViewMode = getPreferredFrontView();
  const returnLabel = frontViewMode === 'workspace' ? '返回书签柜' : '返回启动台';
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_SIDEBAR_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  function changeSidebarOpen(value: boolean) {
    setSidebarOpen(value);
    try {
      localStorage.setItem(ADMIN_SIDEBAR_STORAGE_KEY, String(value));
    } catch {
      /* optional preference */
    }
  }

  async function logout() {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLoggingOut(true);
    try {
      await auth.logout();
    } catch {
      pushToast('退出登录失败，请重试', 'error');
    } finally {
      logoutPending.current = false;
      setLoggingOut(false);
    }
  }

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={changeSidebarOpen}
      style={{ '--sidebar-width': '17rem' } as CSSProperties}
      className="app-root min-h-dvh w-full max-w-full overflow-x-clip bg-background text-foreground motion-reduce:**:transition-none"
    >
      <Sidebar
        collapsible="offcanvas"
        variant="floating"
        className="top-[var(--safe-t)] bottom-[env(safe-area-inset-bottom)] h-auto p-3"
      >
        <AdminSidebarContent
          frontRoute={frontRoute}
          returnLabel={returnLabel}
          onLogout={() => void logout()}
          loggingOut={loggingOut}
          themeSettings={themeSettings}
        />
      </Sidebar>

      <SidebarInset className="app-inset min-w-0 overflow-x-clip">
        <header className="sticky top-0 z-30 flex h-[var(--header-h)] items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:px-6">
          <AdminSidebarTrigger />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link to="/admin" />}>管理后台</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{currentLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="mx-auto w-full max-w-[70rem] px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
