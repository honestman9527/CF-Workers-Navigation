import {
  ADMIN_SIDEBAR_STORAGE_KEY,
  DEFAULT_ADMIN_SIDEBAR_OPEN,
  PALETTE_OPTIONS,
  parseSidebarOpen,
} from '@shared';
import { Link, Outlet, useLocation } from '@tanstack/react-router';
import {
  ArrowDownToLine,
  ArrowLeft,
  FolderTree,
  Globe,
  LayoutDashboard,
  LogOut,
  Moon,
  Palette as PaletteIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  Tags,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { pushToast } from '@nav/components/Toast';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { BrandIcon } from '@nav/features/layout/BrandIcon';
import { PaletteMenuOptions, ThemeMenuOptions } from '@nav/features/settings/ThemeMenuOptions';
import { useAppearance } from '@nav/hooks/useAppearance';
import { useTheme } from '@nav/hooks/useTheme';

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

/** 侧栏导航项：桌面支持展开态与 72px 图标栏（配合 Tooltip），移动端点击后收起抽屉。 */
function AdminNavItem({ to, label, icon: Icon, end }: (typeof NAV)[number]) {
  const { open, isMobile, setOpenMobile } = useSidebar();
  const { pathname } = useLocation();
  const collapsed = !isMobile && !open;
  const active = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <SidebarMenuItem className={cn(collapsed && 'flex justify-center')}>
      <SidebarMenuButton
        tooltip={label}
        render={<Link to={to} onClick={() => setOpenMobile(false)} />}
        isActive={active}
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed ? label : undefined}
        className={cn(
          'min-h-10 rounded-xl px-3 text-sm text-muted-foreground hover:bg-secondary/80 hover:text-foreground data-active:bg-accent data-active:font-semibold data-active:text-primary',
          collapsed && 'size-11 justify-center p-0',
        )}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {!collapsed ? <span>{label}</span> : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AdminSidebarContent({
  frontRoute,
  onLogout,
  loggingOut,
  themeSettings,
  appearance,
}: {
  frontRoute: '/';
  onLogout: () => void;
  loggingOut: boolean;
  themeSettings: ReturnType<typeof useTheme>;
  appearance: ReturnType<typeof useAppearance>;
}) {
  const { open, isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const { theme, resolvedTheme, setTheme } = themeSettings;
  const { palette, setPalette } = appearance;
  const collapsed = !isMobile && !open;
  const isDark = resolvedTheme === 'dark';
  const currentPaletteLabel = PALETTE_OPTIONS.find((item) => item.id === palette)?.label;
  const appearanceTooltip = currentPaletteLabel
    ? `外观与配色 · ${currentPaletteLabel}`
    : '外观与配色';

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-between">
      <div
        className={cn('flex min-h-0 flex-1 flex-col', collapsed ? 'items-center gap-3' : 'gap-4')}
      >
        <SidebarHeader
          className={cn('w-full', collapsed ? 'items-center px-2 pt-4 pb-0' : 'px-4 pt-5 pb-0')}
        >
          <div
            className={cn(
              'flex w-full items-center gap-2',
              collapsed ? 'flex-col' : 'justify-between',
            )}
          >
            <Tooltip disabled={!collapsed}>
              <TooltipTrigger
                render={
                  <Link
                    to="/admin"
                    onClick={() => setOpenMobile(false)}
                    aria-label={collapsed ? '管理后台概览' : undefined}
                    className={cn(
                      'flex min-w-0 items-center rounded-xl text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/45',
                      collapsed ? 'grid size-11 place-items-center' : 'gap-3 px-2',
                    )}
                  />
                }
              >
                <BrandIcon className="size-9 shrink-0" />
                {!collapsed ? (
                  <div className="min-w-0">
                    <strong className="block truncate font-display text-base font-semibold">
                      管理后台
                    </strong>
                    <span className="block truncate text-xs text-muted-foreground">
                      书签柜设置与整理
                    </span>
                  </div>
                ) : null}
              </TooltipTrigger>
              {collapsed ? (
                <TooltipContent side="right" sideOffset={10}>
                  管理后台
                </TooltipContent>
              ) : null}
            </Tooltip>

            {!isMobile ? (
              <Tooltip disabled={!collapsed}>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={open ? '收起管理导航' : '展开管理导航'}
                      aria-expanded={open}
                      aria-controls="admin-sidebar"
                      title={open ? '收起为图标栏 (⌘B / Ctrl+B)' : '展开侧边栏 (⌘B / Ctrl+B)'}
                      onClick={toggleSidebar}
                      className={cn(
                        'shrink-0 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground',
                        collapsed ? 'size-11' : 'size-9 min-h-9',
                      )}
                    />
                  }
                >
                  {open ? (
                    <PanelLeftClose aria-hidden="true" className="size-4" />
                  ) : (
                    <PanelLeftOpen aria-hidden="true" className="size-4" />
                  )}
                </TooltipTrigger>
                {collapsed ? (
                  <TooltipContent side="right" sideOffset={10}>
                    展开侧边栏 (⌘B / Ctrl+B)
                  </TooltipContent>
                ) : null}
              </Tooltip>
            ) : null}
          </div>
        </SidebarHeader>

        <SidebarContent
          className={cn('w-full', collapsed ? 'items-center px-2 py-1' : 'px-4 py-1')}
        >
          <nav aria-label="管理后台导航" className="w-full">
            {!collapsed ? (
              <div className="mb-2 px-2.5 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
                管理模块
              </div>
            ) : null}
            <SidebarMenu className={cn(collapsed ? 'items-center gap-1.5' : 'gap-1')}>
              {NAV.map((item) => (
                <AdminNavItem key={item.to} {...item} />
              ))}
            </SidebarMenu>
          </nav>
        </SidebarContent>
      </div>

      {/* 底部工具栏与前台保持镜像一致：展开态单行轻量无边框，折叠态竖排居中 44px 图标按钮。 */}
      <SidebarFooter className={cn('w-full', collapsed ? 'px-2 pt-0 pb-4' : 'px-4 pt-0 pb-5')}>
        {collapsed ? (
          <div className="flex w-full flex-col items-center gap-1.5 border-t border-border/70 pt-2.5">
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="外观与主题设置"
                          className="size-11 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
                        />
                      }
                    />
                  }
                >
                  <PaletteIcon aria-hidden="true" className="size-4" />
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  {appearanceTooltip}
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent side="right" align="end" sideOffset={10} className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>主题</DropdownMenuLabel>
                  <ThemeMenuOptions theme={theme} onThemeChange={setTheme} />
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>主题色</DropdownMenuLabel>
                  <PaletteMenuOptions
                    palette={palette}
                    resolvedTheme={resolvedTheme}
                    onPaletteChange={setPalette}
                  />
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    to={frontRoute}
                    onClick={() => setOpenMobile(false)}
                    aria-label="返回前台"
                    className="grid size-11 place-items-center rounded-xl text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
                  />
                }
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                返回前台
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="退出登录"
                    disabled={loggingOut}
                    onClick={onLogout}
                    className="size-11 rounded-xl text-muted-foreground hover:bg-destructive/12 hover:text-destructive"
                  />
                }
              >
                <LogOut aria-hidden="true" className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                {loggingOut ? '退出中…' : '退出登录'}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between gap-1 border-t border-border/70 pt-2.5">
            <Link
              to={frontRoute}
              onClick={() => setOpenMobile(false)}
              aria-label="返回前台"
              className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45 pointer-coarse:min-h-11"
            >
              <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
              <span>前台</span>
            </Link>

            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={isDark ? '切换亮色模式' : '切换暗色模式'}
                      onClick={() => setTheme(isDark ? 'light' : 'dark')}
                      className="size-9 min-h-9 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground pointer-coarse:size-11"
                    />
                  }
                >
                  {isDark ? (
                    <Sun aria-hidden="true" className="size-4" />
                  ) : (
                    <Moon aria-hidden="true" className="size-4" />
                  )}
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={8}>
                  {isDark ? '切换亮色' : '切换暗色'}
                </TooltipContent>
              </Tooltip>

              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="外观与主题设置"
                            className="size-9 min-h-9 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground pointer-coarse:size-11"
                          />
                        }
                      />
                    }
                  >
                    <PaletteIcon aria-hidden="true" className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={8}>
                    {appearanceTooltip}
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-48">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>主题</DropdownMenuLabel>
                    <ThemeMenuOptions theme={theme} onThemeChange={setTheme} />
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>主题色</DropdownMenuLabel>
                    <PaletteMenuOptions
                      palette={palette}
                      resolvedTheme={resolvedTheme}
                      onPaletteChange={setPalette}
                    />
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="退出登录"
                      disabled={loggingOut}
                      onClick={onLogout}
                      className="size-9 min-h-9 rounded-xl text-muted-foreground hover:bg-destructive/12 hover:text-destructive pointer-coarse:size-11"
                    />
                  }
                >
                  <LogOut aria-hidden="true" className="size-4" />
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={8}>
                  {loggingOut ? '退出中…' : '退出登录'}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}
      </SidebarFooter>
    </div>
  );
}

function AdminMobileSidebarTrigger() {
  const { isMobile, openMobile } = useSidebar();
  if (!isMobile) return null;
  const label = openMobile ? '收起管理导航' : '展开管理导航';
  return (
    <SidebarTrigger
      aria-label={label}
      title={label}
      aria-expanded={openMobile}
      className="lg:hidden"
    />
  );
}

/** 管理后台布局：桌面侧栏与前台统一支持 264px 展开态与 72px 紧凑图标栏，移动端为抽屉。 */
export function AdminPage() {
  const auth = useAuthContext();
  const themeSettings = useTheme();
  const appearance = useAppearance();
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPending = useRef(false);
  const { pathname } = useLocation();
  const currentLabel = NAV.find((item) => item.to === pathname)?.label ?? '概览';
  useEffect(() => {
    document.title = `${currentLabel} · 管理后台 · 书签柜`;
  }, [currentLabel]);
  const frontRoute = '/';
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return parseSidebarOpen(
        localStorage.getItem(ADMIN_SIDEBAR_STORAGE_KEY),
        DEFAULT_ADMIN_SIDEBAR_OPEN,
      );
    } catch {
      return DEFAULT_ADMIN_SIDEBAR_OPEN;
    }
  });

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== ADMIN_SIDEBAR_STORAGE_KEY) return;
      setSidebarOpen(parseSidebarOpen(event.newValue, DEFAULT_ADMIN_SIDEBAR_OPEN));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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
    <TooltipProvider delay={220}>
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={changeSidebarOpen}
        style={
          {
            '--sidebar-width': '16.5rem',
            '--sidebar-width-icon': '4.5rem',
          } as CSSProperties
        }
        className="admin-surface app-root min-h-dvh w-full max-w-full bg-background text-foreground"
      >
        <a href="#admin-main" className="skip-link">
          跳至主内容
        </a>
        <Sidebar
          id="admin-sidebar"
          collapsible="icon"
          variant="sidebar"
          className="top-[var(--safe-t)] bottom-[env(safe-area-inset-bottom)] h-auto border-border"
        >
          <AdminSidebarContent
            frontRoute={frontRoute}
            onLogout={() => void logout()}
            loggingOut={loggingOut}
            themeSettings={themeSettings}
            appearance={appearance}
          />
        </Sidebar>

        <SidebarInset className="app-inset min-w-0">
          <header className="glass-surface sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
            <AdminMobileSidebarTrigger />
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

          <div
            id="admin-main"
            tabIndex={-1}
            className="mx-auto w-full max-w-[86rem] px-4 py-7 outline-none sm:px-8 sm:py-10 xl:px-10"
          >
            <Outlet />
          </div>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}
