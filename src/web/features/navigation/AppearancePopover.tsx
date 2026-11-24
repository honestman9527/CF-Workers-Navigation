import { Popover } from '@base-ui/react/popover';
import { Tooltip } from '@base-ui/react/tooltip';
import {
  DEFAULT_BG_OVERLAY_OPACITY,
  MAX_BG_OVERLAY_OPACITY,
  MIN_BG_OVERLAY_OPACITY,
  PALETTE_OPTIONS,
  type Palette,
  type ResolvedTheme,
  type Theme,
  type ViewDensity,
} from '@shared';
import {
  Check,
  LayoutGrid,
  List,
  Monitor,
  Moon,
  Palette as PaletteIcon,
  RotateCcw,
  Sun,
} from 'lucide-react';

import { cn } from '@/lib/utils';

import { FrontButton } from './controls';

export function AppearancePopover({
  theme,
  resolvedTheme,
  setTheme,
  palette,
  setPalette,
  density,
  setDensity,
  bgOverlayOpacity,
  setBgOverlayOpacity,
  hasBackground,
  side = 'top',
  align = 'start',
  compactTrigger = false,
  showTooltip = false,
  triggerClassName,
}: {
  theme: Theme;
  resolvedTheme?: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  palette: Palette;
  setPalette: (palette: Palette) => void;
  density: ViewDensity;
  setDensity: (density: ViewDensity) => void;
  bgOverlayOpacity: number;
  setBgOverlayOpacity: (value: number) => void;
  hasBackground: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  compactTrigger?: boolean;
  showTooltip?: boolean;
  triggerClassName?: string;
}) {
  const isDark = resolvedTheme === 'dark';
  const opacityPercent = Math.round(bgOverlayOpacity * 100);
  const currentPaletteLabel = PALETTE_OPTIONS.find((item) => item.id === palette)?.label;
  const triggerButton = (
    <FrontButton
      tone={compactTrigger ? 'quiet' : 'subtle'}
      aria-label="外观与配色设置"
      className={cn(
        compactTrigger
          ? 'size-10 p-0'
          : 'min-h-9 w-full justify-between rounded-xl px-3 text-xs font-medium',
        triggerClassName,
      )}
    />
  );

  return (
    <Popover.Root>
      {compactTrigger && showTooltip ? (
        <Tooltip.Root>
          <Tooltip.Trigger render={<Popover.Trigger render={triggerButton} />}>
            <PaletteIcon aria-hidden="true" className="size-4" />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner side="right" align="center" sideOffset={10} className="z-50">
              <Tooltip.Popup className="front-surface glass-surface inline-flex items-center gap-1.5 rounded-lg border border-border bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg transition-[opacity,transform] duration-150 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
                外观与配色{currentPaletteLabel ? ` · ${currentPaletteLabel}` : ''}
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : (
        <Popover.Trigger render={triggerButton}>
          {compactTrigger ? (
            <PaletteIcon aria-hidden="true" className="size-4" />
          ) : (
            <>
              <span className="flex items-center gap-2">
                <PaletteIcon aria-hidden="true" className="size-3.5 text-primary" />
                <span>外观与配色</span>
              </span>
              <span className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full bg-primary ring-2 ring-primary/25 [forced-color-adjust:none]"
                />
                {currentPaletteLabel}
              </span>
            </>
          )}
        </Popover.Trigger>
      )}
      <Popover.Portal>
        <Popover.Positioner
          side={side}
          align={align}
          sideOffset={8}
          className="z-50 max-w-[calc(100vw-1.5rem)]"
        >
          <Popover.Popup
            aria-label="外观设置"
            className="front-surface glass-surface animate-panel-enter w-76 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-xl outline-none"
          >
            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">明暗模式</div>
                <div
                  role="group"
                  aria-label="明暗模式"
                  className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1"
                >
                  {(
                    [
                      { value: 'light', label: '亮色', icon: Sun },
                      { value: 'dark', label: '暗色', icon: Moon },
                      { value: 'system', label: '系统', icon: Monitor },
                    ] as const
                  ).map(({ value, label, icon: Icon }) => (
                    <FrontButton
                      key={value}
                      aria-pressed={theme === value}
                      onClick={() => setTheme(value)}
                      className={cn(
                        'min-h-8 gap-1.5 rounded-lg px-2 py-1 text-xs',
                        theme === value
                          ? 'bg-card font-semibold text-foreground shadow-2xs'
                          : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      <span>{label}</span>
                    </FrontButton>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">主题色</div>
                <div role="radiogroup" aria-label="主题色" className="grid grid-cols-2 gap-1.5">
                  {PALETTE_OPTIONS.map((option) => {
                    const selected = palette === option.id;
                    const swatch = isDark ? option.dark : option.light;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPalette(option.id)}
                        className={cn(
                          'flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/45',
                          selected
                            ? 'border-primary/50 bg-accent text-foreground'
                            : 'border-border bg-background/60 text-muted-foreground hover:border-border-strong hover:text-foreground',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="size-3.5 shrink-0 rounded-full ring-1 ring-black/10 [forced-color-adjust:none] dark:ring-white/15"
                          style={{ backgroundColor: swatch }}
                        />
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        {selected ? (
                          <Check aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">卡片视图密度</div>
                <div
                  role="group"
                  aria-label="视图密度"
                  className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1"
                >
                  {(
                    [
                      { value: 'comfortable', label: '舒适卡片', icon: LayoutGrid },
                      { value: 'compact', label: '紧凑网格', icon: List },
                    ] as const
                  ).map(({ value, label, icon: Icon }) => (
                    <FrontButton
                      key={value}
                      aria-pressed={density === value}
                      onClick={() => setDensity(value)}
                      className={cn(
                        'min-h-8 gap-1.5 rounded-lg px-2.5 py-1 text-xs',
                        density === value
                          ? 'bg-card font-semibold text-foreground shadow-2xs'
                          : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      <span>{label}</span>
                    </FrontButton>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label
                    htmlFor="front-bg-overlay-opacity"
                    className="text-xs font-semibold text-muted-foreground"
                  >
                    壁纸遮罩浓度
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-medium text-foreground tabular-nums">
                      {opacityPercent}%
                    </span>
                    {bgOverlayOpacity !== DEFAULT_BG_OVERLAY_OPACITY ? (
                      <button
                        type="button"
                        aria-label="重置壁纸遮罩浓度"
                        title="重置为 72%"
                        onClick={() => setBgOverlayOpacity(DEFAULT_BG_OVERLAY_OPACITY)}
                        className="grid size-6 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <RotateCcw className="size-3" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <input
                  id="front-bg-overlay-opacity"
                  type="range"
                  min={Math.round(MIN_BG_OVERLAY_OPACITY * 100)}
                  max={Math.round(MAX_BG_OVERLAY_OPACITY * 100)}
                  step={5}
                  value={opacityPercent}
                  aria-valuetext={`${opacityPercent}%`}
                  onChange={(event) => setBgOverlayOpacity(Number(event.target.value) / 100)}
                  className="h-9 w-full cursor-pointer accent-primary"
                />
                <div className="mt-1 flex items-center justify-between text-[0.6875rem] text-muted-foreground">
                  <span>25% 通透</span>
                  <span>{hasBackground ? '实时保护文字对比度' : '启用壁纸后生效'}</span>
                  <span>95% 柔和</span>
                </div>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
