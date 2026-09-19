import { isTheme, type ResolvedTheme, type Theme } from '@shared';
import { useNavigate } from '@tanstack/react-router';
import {
  Bookmark,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  LogIn,
  Monitor,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthContext } from '@nav/features/auth/useAuthContext';

/** 启动台与工作区共用的右上角菜单：按传入的回调决定展示哪些导航项。归档/回收站只存在于管理后台。 */
export function HeaderMenu({
  theme,
  resolvedTheme,
  onThemeChange,
  onOpenLauncher,
  onOpenWorkspace,
  onOpenAdmin,
  onLogout,
}: {
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
            className="h-8 gap-1.5 rounded-full px-2.5 text-white hover:bg-white/10 hover:text-white"
            aria-label="菜单"
          />
        }
      >
        <UserRound className="size-4" />
        <ChevronDown className="size-3 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">书签柜</span>
              <span className="text-xs font-normal text-muted-foreground">
                {authed ? '已登录，可整理书签' : '游客 · 浏览公开网站'}
              </span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {onOpenWorkspace ? (
          <DropdownMenuItem onClick={onOpenWorkspace}>
            <Bookmark className="size-4" />
            书签柜
          </DropdownMenuItem>
        ) : null}
        {onOpenLauncher ? (
          <DropdownMenuItem onClick={onOpenLauncher}>
            <Rocket className="size-4" />
            启动台
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {resolvedTheme === 'dark' ? <Moon /> : <Sun />}
            主题
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(value) => {
                if (isTheme(value)) onThemeChange(value);
              }}
            >
              <DropdownMenuRadioItem value="light">
                <Sun />
                亮色
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon />
                暗色
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor />
                跟随系统
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuGroup>
          {authed ? (
            <>
              <DropdownMenuItem onClick={onOpenAdmin}>
                <LayoutDashboard className="size-4 text-primary" />
                管理后台
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onLogout}>
                <LogOut className="size-4" />
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
