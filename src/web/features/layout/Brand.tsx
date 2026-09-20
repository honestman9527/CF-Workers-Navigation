import { cn } from '@/lib/utils';

import { BrandIcon } from './BrandIcon';

/** 品牌标识：图标 + 名称 + 副标题。点击行为由调用方决定。 */
export function Brand({
  onClick,
  surface = 'header',
}: {
  onClick: () => void;
  surface?: 'header' | 'sidebar';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring',
        surface === 'sidebar' ? 'text-sidebar-foreground' : 'text-white',
      )}
      aria-label="书签柜"
    >
      <BrandIcon />
      <span className="text-left">
        <strong className="block font-display text-sm font-medium">书签柜</strong>
        <span
          className={cn(
            'text-[9px] tracking-[0.18em] uppercase',
            surface === 'sidebar' ? 'text-muted-foreground' : 'hidden text-white/55 sm:block',
          )}
        >
          personal index
        </span>
      </span>
    </button>
  );
}
