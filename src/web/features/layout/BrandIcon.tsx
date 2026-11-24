import { cn } from '@/lib/utils';
import { useTheme } from '@nav/hooks/useTheme';

export function BrandIcon({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  return (
    <img
      src={`/hm-${resolvedTheme}.svg?v=1`}
      alt=""
      width={36}
      height={36}
      decoding="async"
      className={cn('size-7 shrink-0 rounded-md', className)}
    />
  );
}
