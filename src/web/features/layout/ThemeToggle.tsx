import { Moon, Sun } from 'lucide-react';

import { Button } from '@nav/components/Button';

export function ThemeToggle({
  theme,
  onChange,
}: {
  theme: 'dark' | 'light';
  onChange: (theme: 'dark' | 'light') => void;
}) {
  const isDark = theme === 'dark';

  return (
    <Button
      onClick={() => onChange(isDark ? 'light' : 'dark')}
      variant="icon"
      size="md"
      aria-label={isDark ? '切换到亮色模式' : '切换到暗色模式'}
      title={isDark ? '亮色' : '暗色'}
    >
      {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </Button>
  );
}
