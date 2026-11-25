import { Menu } from '@base-ui/react/menu';
import {
  isPalette,
  isTheme,
  PALETTE_OPTIONS,
  type Palette,
  type ResolvedTheme,
  type Theme,
} from '@shared';
import { Check, LayoutDashboard, LogIn, LogOut, Monitor, Moon, Settings2, Sun } from 'lucide-react';

import { FrontButton } from './controls';

const menuItem =
  'flex min-h-10 cursor-default items-center gap-2.5 rounded-xl px-3 text-sm outline-none transition-colors data-highlighted:bg-accent data-highlighted:text-foreground data-disabled:opacity-40';

export function NavigationMenu({
  theme,
  resolvedTheme,
  setTheme,
  palette,
  setPalette,
  authed,
  loggingOut,
  onAdmin,
  onLogin,
  onLogout,
}: {
  theme: Theme;
  resolvedTheme?: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  palette: Palette;
  setPalette: (palette: Palette) => void;
  authed: boolean;
  loggingOut: boolean;
  onAdmin: () => void;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const isDark = resolvedTheme === 'dark';
  return (
    <Menu.Root>
      <Menu.Trigger render={<FrontButton aria-label="打开菜单" className="size-10 p-0" />}>
        <Settings2 aria-hidden="true" className="size-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="front-surface glass-surface overlay-popup w-60 origin-(--transform-origin) rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-xl outline-none">
            <Menu.Group>
              <Menu.GroupLabel className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                明暗模式
              </Menu.GroupLabel>
              <Menu.RadioGroup
                value={theme}
                onValueChange={(value) => {
                  if (isTheme(value)) setTheme(value);
                }}
              >
                {(
                  [
                    { value: 'light', label: '亮色', icon: Sun },
                    { value: 'dark', label: '暗色', icon: Moon },
                    { value: 'system', label: '跟随系统', icon: Monitor },
                  ] as const
                ).map(({ value, label, icon: Icon }) => (
                  <Menu.RadioItem key={value} value={value} className={menuItem}>
                    <Icon className="size-4 text-muted-foreground" />
                    {label}
                    <Menu.RadioItemIndicator className="ml-auto">
                      <Check className="size-4 text-primary" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
            <Menu.Separator className="my-2 h-px bg-border" />
            <Menu.Group>
              <Menu.GroupLabel className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                主题色
              </Menu.GroupLabel>
              <Menu.RadioGroup
                value={palette}
                onValueChange={(value) => {
                  if (isPalette(value)) setPalette(value);
                }}
              >
                {PALETTE_OPTIONS.map((option) => (
                  <Menu.RadioItem key={option.id} value={option.id} className={menuItem}>
                    <span
                      aria-hidden="true"
                      className="size-3.5 shrink-0 rounded-full ring-1 ring-black/10 forced-color-adjust-none dark:ring-white/15"
                      style={{ backgroundColor: isDark ? option.dark : option.light }}
                    />
                    {option.label}
                    <Menu.RadioItemIndicator className="ml-auto">
                      <Check className="size-4 text-primary" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
            <Menu.Separator className="my-2 h-px bg-border" />
            {authed ? (
              <>
                <Menu.Item className={menuItem} onClick={onAdmin}>
                  <LayoutDashboard className="size-4 text-muted-foreground" />
                  管理后台
                </Menu.Item>
                <Menu.Item
                  disabled={loggingOut}
                  className={`${menuItem} text-destructive data-highlighted:bg-destructive/12 data-highlighted:text-destructive`}
                  onClick={onLogout}
                >
                  <LogOut className="size-4" />
                  {loggingOut ? '退出中…' : '退出登录'}
                </Menu.Item>
              </>
            ) : (
              <Menu.Item className={menuItem} onClick={onLogin}>
                <LogIn className="size-4 text-muted-foreground" />
                管理员登录
              </Menu.Item>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
