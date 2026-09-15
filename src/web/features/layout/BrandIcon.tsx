import { useAtomValue } from 'jotai';

import { cn } from '@/lib/utils';
import { themeAtom } from '@nav/features/settings/store';

export function BrandIcon({ className }: { className?: string }) {
  const theme = useAtomValue(themeAtom);
  return (
    <img
      src={`/hm-${theme}.svg?v=1`}
      alt=""
      className={cn('size-7 shrink-0 rounded-md', className)}
    />
  );
}
