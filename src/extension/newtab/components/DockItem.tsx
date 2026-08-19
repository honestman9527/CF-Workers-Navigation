import { useRef, type MouseEvent } from "react";
import { motion, useMotionValue, useTransform, useSpring } from "motion/react";
import type { Bookmark } from "@shared/api/types";
import { resolveBookmarkIcon, faviconFor, domainOf } from "@ext/shared/config";
import { openLink } from "@ext/shared/navigation";

type DockItemProps = {
  bookmark: Bookmark;
  mouseX: ReturnType<typeof useMotionValue<number>>;
  index: number;
  total: number;
  openInNewTab: boolean;
  onOpen?: (bm: Bookmark) => void | Promise<void>;
};

const BASE_SIZE = 48;
const MAX_SCALE = 1.6;
const INFLUENCE = 120; // 影响半径 (px)

export default function DockItem({
  bookmark,
  mouseX,
  index,
  openInNewTab,
  onOpen,
}: DockItemProps) {
  const ref = useRef<HTMLButtonElement>(null);

  // 根据鼠标 X 距离本 item 中心的距离计算缩放
  // 使用 offsetLeft/offsetWidth 而非 getBoundingClientRect() 避免 transform 反馈循环
  const distance = useTransform(mouseX, (mx: number) => {
    const el = ref.current;
    if (!el) return Infinity;
    const parent = el.offsetParent as HTMLElement | null;
    if (!parent) return Infinity;
    const center = el.offsetLeft + el.offsetWidth / 2;
    const localX = mx - parent.getBoundingClientRect().left;
    return Math.abs(localX - center);
  });

  // hover 时同时驱动 width 与 scale：
  //  - width 占据布局空间，通过 flexbox 把相邻 item 推开（避免重叠，macOS Dock 行为）
  //  - scale 放大视觉内容，transformOrigin bottom 向上放大
  // 两者共享 distance 源与 spring 参数，视觉宽度 ≈ button width，邻居刚好不重叠
  const widthTarget = useTransform(distance, [0, INFLUENCE], [BASE_SIZE * MAX_SCALE, BASE_SIZE], {
    clamp: true,
  });
  const scaleTarget = useTransform(distance, [0, INFLUENCE], [MAX_SCALE, 1], { clamp: true });
  const springOpts = { stiffness: 300, damping: 22, mass: 0.1 };
  const width = useSpring(widthTarget, springOpts);
  const scale = useSpring(scaleTarget, springOpts);

  async function handleClick(e: MouseEvent) {
    const forceNewTab = e.metaKey || e.ctrlKey || e.button === 1;
    try {
      await onOpen?.(bookmark);
    } catch {
      // ignore
    }
    openLink(bookmark.url, { openInNewTab, forceNewTab });
  }

  const iconSrc = resolveBookmarkIcon(bookmark.iconUrl, bookmark.url);

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={(e) => void handleClick(e)}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          void (async () => {
            try {
              await onOpen?.(bookmark);
            } catch {
              // ignore
            }
            openLink(bookmark.url, { openInNewTab, forceNewTab: true });
          })();
        }
      }}
      // 外层只做 opacity + y 入场动画，去掉 scale 避免与 hover 的 MotionValue 冲突
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.4 + index * 0.04,
        type: "spring",
        stiffness: 260,
        damping: 20,
      }}
      className="group relative flex shrink-0 items-end justify-center overflow-visible"
      // width 占布局空间推开邻居；height 固定 BASE_SIZE，放大内容向上溢出
      style={{ width, height: BASE_SIZE, transformOrigin: "bottom" }}
      title={bookmark.title}
      aria-label={bookmark.title}
    >
      {/* 内层 motion.div 承载 hover 放大，transformOrigin bottom 使图标向上放大 */}
      <motion.div
        style={{ scale, width: BASE_SIZE, height: BASE_SIZE, transformOrigin: "bottom" }}
        className="glass-panel flex items-center justify-center rounded-2xl border border-[var(--border-color)]"
      >
        <img
          src={iconSrc}
          alt=""
          className="h-7 w-7 rounded-lg"
          loading="lazy"
          draggable={false}
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            const fallback = faviconFor(domainOf(bookmark.url));
            if (img.src !== fallback) {
              img.src = fallback;
            } else {
              img.style.opacity = "0.3";
            }
          }}
        />
      </motion.div>
      {/* tooltip */}
      <span className="pointer-events-none absolute -top-10 whitespace-nowrap rounded-lg bg-black/80 px-2.5 py-1 text-xs text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
        {bookmark.title}
      </span>
    </motion.button>
  );
}
