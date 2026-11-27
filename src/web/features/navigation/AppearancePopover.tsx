import { Menu } from '@base-ui/react/menu';
import { Tooltip } from '@base-ui/react/tooltip';
import {
  isPalette,
  isTheme,
  PALETTE_OPTIONS,
  type Palette,
  type ResolvedTheme,
  type Theme,
} from '@shared';
import { Check, Monitor, Moon, Palette as PaletteIcon, Sun } from 'lucide-react';

import { cn } from '@/lib/utils';

import { FrontButton } from './controls';

const menuItem =
  'flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2.5 text-sm outline-none transition-colors data-highlighted:bg-accent data-highlighted:text-foreground pointer-coarse:min-h-11';

/** 统一前后台的主题与主题色菜单（Base UI 实现，仅保留主题与 4 套主题色）。 */
export function AppearancePopover({
  theme,
  resolvedTheme,
  setTheme,
  palette,
  setPalette,
  side = 'top',
  align = 'end',
  showTooltip = false,
  tooltipSide = 'right',
  tooltipOffset = 10,
  triggerClassName,
}: {
  theme: Theme;
  resolvedTheme?: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  palette: Palette;
  setPalette: (palette: Palette) => void;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  showTooltip?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  tooltipOffset?: number;
  triggerClassName?: string;
}) {
  const isDark = resolvedTheme === 'dark';
  const currentPaletteLabel = PALETTE_OPTIONS.find((item) => item.id === palette)?.label;
  const triggerButton = (
    <FrontButton
      tone="quiet"
      aria-label="外观与主题设置"
      className={cn('size-10 rounded-xl p-0', triggerClassName)}
    />
  );

  return (
    <Menu.Root>
      {showTooltip ? (
        <Tooltip.Root>
          <Tooltip.Trigger render={<Menu.Trigger render={triggerButton} />}>
            <PaletteIcon aria-hidden="true" className="size-4" />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner
              side={tooltipSide}
              align="center"
              sideOffset={tooltipOffset}
              className="z-50"
            >
              <Tooltip.Popup className="front-surface glass-surface overlay-popup inline-flex origin-(--transform-origin) items-center gap-1.5 rounded-lg border border-border bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg outline-none">
                外观与主题{currentPaletteLabel ? ` · ${currentPaletteLabel}` : ''}
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : (
        <Menu.Trigger render={triggerButton}>
          <PaletteIcon aria-hidden="true" className="size-4" />
        </Menu.Trigger>
      )}
      <Menu.Portal>
        <Menu.Positioner
          side={side}
          align={align}
          sideOffset={8}
          className="z-50 max-w-[calc(100vw-1.5rem)]"
        >
          <Menu.Popup
            aria-label="外观与主题设置"
            className="front-surface glass-surface overlay-popup w-48 max-w-[calc(100vw-1.5rem)] origin-(--transform-origin) rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl outline-none"
          >
            <Menu.Group>
              <Menu.GroupLabel className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
                主题
              </Menu.GroupLabel>
              <Menu.RadioGroup
                aria-label="主题"
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
                    <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                    <span>{label}</span>
                    <Menu.RadioItemIndicator className="ml-auto">
                      <Check aria-hidden="true" className="size-4 text-primary" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
            <Menu.Separator className="my-1.5 h-px bg-border" />
            <Menu.Group>
              <Menu.GroupLabel className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
                主题色
              </Menu.GroupLabel>
              <Menu.RadioGroup
                aria-label="主题色"
                value={palette}
                onValueChange={(value) => {
                  if (isPalette(value)) setPalette(value);
                }}
              >
                {PALETTE_OPTIONS.map((option) => (
                  <Menu.RadioItem key={option.id} value={option.id} className={menuItem}>
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-full ring-1 ring-black/10 forced-color-adjust-none dark:ring-white/15"
                      style={{ backgroundColor: isDark ? option.dark : option.light }}
                    />
                    <span>{option.label}</span>
                    <Menu.RadioItemIndicator className="ml-auto">
                      <Check aria-hidden="true" className="size-4 text-primary" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
