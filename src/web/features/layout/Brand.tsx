import { Bookmark as BookmarkIcon } from 'lucide-react';

/** 品牌标识：图标 + 名称 + 副标题。点击行为由调用方决定。 */
export function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3" aria-label="书签柜">
      <span className="grid size-9 place-items-center rounded-[0.9rem] bg-primary text-primary-foreground shadow-sm">
        <BookmarkIcon />
      </span>
      <span className="text-left">
        <strong className="block font-display text-base">书签柜</strong>
        <span className="hidden text-[10px] tracking-[0.2em] text-muted-foreground uppercase sm:block">
          personal index
        </span>
      </span>
    </button>
  );
}
