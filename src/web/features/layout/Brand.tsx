import { BrandIcon } from './BrandIcon';

/** 品牌标识：图标 + 名称 + 副标题。点击行为由调用方决定。 */
export function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 text-white"
      aria-label="书签柜"
    >
      <BrandIcon />
      <span className="text-left">
        <strong className="block font-display text-sm font-medium">书签柜</strong>
        <span className="hidden text-[9px] tracking-[0.18em] text-white/55 uppercase sm:block">
          personal index
        </span>
      </span>
    </button>
  );
}
