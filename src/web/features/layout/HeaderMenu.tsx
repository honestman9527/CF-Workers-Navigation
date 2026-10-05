import type { ResolvedTheme, Theme } from '@shared';

import { useNavigate } from '@tanstack/react-router';
import {
  Bookmark,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  LogIn,
  Moon,
  Rocket,
  Sun,
  UserRound,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@nav/features/auth/useAuthContext';
import { ThemeMenuOptions } from '@nav/features/settings/ThemeMenuOptions';

/** 启动台与工作区共用的右上角菜单：按传入的回调决定展示哪些导航项。归档/回收站只存在于管理后台。 */
export function HeaderMenu({
  surface = 'header',
  theme,
  resolvedTheme,
  onThemeChange,
  onOpenLauncher,
  onOpenWorkspace,
  onOpenAdmin,
  onLogout,
}: {
  surface?: 'header' | 'workspace';
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  onThemeChange: (theme: Theme) => void;
  onOpenLauncher?: () => void;
  onOpenWorkspace?: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}) {
  const { authed } = useAuthContext();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 gap-1.5 rounded-full px-2.5',
              surface === 'header' && 'text-white hover:bg-white/10 hover:text-white',
            )}
            aria-label="菜单"
          />
        }
      >
        <UserRound data-icon="inline-start" />
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">书签柜</span>
              <span className="text-xs font-normal text-muted-foreground">
                {authed ? '已登录，可整理书签' : '游客 · 浏览公开书签'}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {onOpenWorkspace ? (
            <DropdownMenuItem onClick={onOpenWorkspace}>
              <Bookmark />
              书签柜
            </DropdownMenuItem>
          ) : null}
          {onOpenLauncher ? (
            <DropdownMenuItem onClick={onOpenLauncher}>
              <Rocket />
              启动台
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {resolvedTheme === 'dark' ? <Moon /> : <Sun />}
              主题
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <ThemeMenuOptions theme={theme} onThemeChange={onThemeChange} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {authed ? (
            <>
              <DropdownMenuItem onClick={onOpenAdmin}>
                <LayoutDashboard />
                管理后台
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onLogout}>
                <LogOut />
                退出
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              onClick={() =>
                void navigate({
                  to: '/login',
                  search: {
                    redirect:
                      window.location.pathname + window.location.search + window.location.hash,
                  },
                })
              }
            >
              <LogIn />
              登录
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
