import {
  Archive,
  ChevronDown,
  LayoutDashboard,
  LayoutGrid,
  List,
  LogOut,
  Moon,
  Sun,
  Trash2,
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function HeaderMenu({
  theme,
  viewMode,
  onThemeChange,
  onViewModeChange,
  onOpenArchive,
  onOpenTrash,
  onOpenLauncher,
  onOpenAdmin,
  onLogout,
}: {
  theme: 'dark' | 'light';
  viewMode: 'grid' | 'list';
  onThemeChange: (theme: 'dark' | 'light') => void;
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onOpenArchive: () => void;
  onOpenTrash: () => void;
  onOpenLauncher: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 rounded-full px-2.5"
            aria-label="菜单"
          />
        }
      >
        <UserRound className="size-4 text-primary" />
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
        <DropdownMenuRadioGroup
          value={viewMode}
          onValueChange={(value: string) => {
            if (value === 'grid' || value === 'list') {
              onViewModeChange(value);
            }
          }}
        >
          <DropdownMenuLabel className="text-xs text-muted-foreground">视图</DropdownMenuLabel>
          <DropdownMenuRadioItem value="grid">
            <LayoutGrid className="size-4" />
            网格
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="list">
            <List className="size-4" />
            列表
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onOpenLauncher}>
          <LayoutGrid className="size-4" />
          启动台
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenArchive}>
          <Archive className="size-4" />
          归档
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenTrash}>
          <Trash2 className="size-4" />
          回收站
        </DropdownMenuItem>
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
