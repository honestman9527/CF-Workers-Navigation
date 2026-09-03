import {
  Bookmark,
  ChevronDown,
  LayoutDashboard,
  LogOut,
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** 启动台与工作区共用的右上角菜单：按传入的回调决定展示哪些导航项。归档/回收站只存在于管理后台。 */
export function HeaderMenu({
  theme,
  onThemeChange,
  onOpenLauncher,
  onOpenWorkspace,
  onOpenAdmin,
  onLogout,
}: {
  theme: 'dark' | 'light';
  onThemeChange: (theme: 'dark' | 'light') => void;
  onOpenLauncher?: () => void;
  onOpenWorkspace?: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}) {
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
              <span className="text-xs font-normal text-muted-foreground">已登录，可整理书签</span>
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
        <DropdownMenuItem onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {theme === 'dark' ? '切换为亮色' : '切换为暗色'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenAdmin}>
          <LayoutDashboard className="size-4 text-primary" />
          管理后台
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onLogout}>
          <LogOut className="size-4" />
          退出
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
