import { isTheme, type Theme } from '@shared';
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
  );
}
