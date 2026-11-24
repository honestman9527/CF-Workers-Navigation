import {
  isPalette,
  isTheme,
  PALETTE_OPTIONS,
  type Palette,
  type ResolvedTheme,
  type Theme,
} from '@shared';
import { Monitor, Moon, Sun } from 'lucide-react';

import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';

export function ThemeMenuOptions({
  theme,
  onThemeChange,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  return (
    <DropdownMenuRadioGroup
      aria-label="主题"
      value={theme}
      onValueChange={(value) => {
        if (isTheme(value)) onThemeChange(value);
      }}
    >
      <DropdownMenuRadioItem value="light">
        <Sun aria-hidden="true" />
        亮色
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark">
        <Moon aria-hidden="true" />
        暗色
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="system">
        <Monitor aria-hidden="true" />
        跟随系统
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );
}

export function PaletteMenuOptions({
  palette,
  resolvedTheme,
  onPaletteChange,
}: {
  palette: Palette;
  resolvedTheme?: ResolvedTheme;
  onPaletteChange: (palette: Palette) => void;
}) {
  const isDark = resolvedTheme === 'dark';
  return (
    <DropdownMenuRadioGroup
      aria-label="主题色"
      value={palette}
      onValueChange={(value) => {
        if (isPalette(value)) onPaletteChange(value);
      }}
    >
      {PALETTE_OPTIONS.map((option) => (
        <DropdownMenuRadioItem key={option.id} value={option.id}>
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-full ring-1 ring-black/10 [forced-color-adjust:none] dark:ring-white/15"
            style={{ backgroundColor: isDark ? option.dark : option.light }}
          />
          {option.label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
