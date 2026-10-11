import type { Theme } from '@shared';

import { Menu } from '@base-ui/react/menu';
import { Check, LayoutDashboard, LogIn, LogOut, Moon, Settings2, Sun } from 'lucide-react';

import { FrontButton } from './controls';

const menuItem =
  'flex min-h-11 cursor-default items-center gap-3 rounded-lg px-3 text-sm outline-none data-highlighted:bg-secondary data-disabled:opacity-40';

export function NavigationMenu({
  theme,
  setTheme,
  authed,
  loggingOut,
  onAdmin,
  onLogin,
  onLogout,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  authed: boolean;
  loggingOut: boolean;
  onAdmin: () => void;
  onLogin: () => void;
  onLogout: () => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger render={<FrontButton aria-label="打开菜单" className="size-11 p-0" />}>
        <Settings2 className="size-5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-40">
          <Menu.Popup className="front-surface w-56 rounded-[1.125rem] border border-border bg-popover p-2 text-popover-foreground outline-none">
            <Menu.RadioGroup
              value={theme}
              onValueChange={(value) => {
                if (value === 'light' || value === 'dark' || value === 'system') setTheme(value);
              }}
            >
              {(
                [
                  { value: 'light', label: '亮色', icon: Sun },
                  { value: 'dark', label: '暗色', icon: Moon },
                  { value: 'system', label: '跟随系统', icon: Settings2 },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <Menu.RadioItem key={value} value={value} className={menuItem}>
                  <Icon className="size-4" />
                  {label}
                  <Menu.RadioItemIndicator className="ml-auto">
                    <Check className="size-4 text-primary" />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
            <Menu.Separator className="my-2 h-px bg-border/60" />
            {authed ? (
              <>
                <Menu.Item className={menuItem} onClick={onAdmin}>
                  <LayoutDashboard className="size-4" />
                  管理后台
                </Menu.Item>
                <Menu.Item disabled={loggingOut} className={menuItem} onClick={onLogout}>
                  <LogOut className="size-4" />
                  {loggingOut ? '退出中…' : '退出登录'}
                </Menu.Item>
              </>
            ) : (
              <Menu.Item className={menuItem} onClick={onLogin}>
                <LogIn className="size-4" />
                管理员登录
              </Menu.Item>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
