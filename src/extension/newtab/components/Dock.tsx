import { useRef } from "react";
import { motion, useMotionValue } from "motion/react";
import type { Bookmark } from "@ext/shared/api/types";
import DockItem from "./DockItem";

type DockProps = {
  bookmarks: Bookmark[];
  loading: boolean;
  error: string | null;
  openInNewTab: boolean;
  /** 站点根地址，用于空态「打开 Nav」。 */
  siteUrl?: string;
  onOpenBookmark?: (bm: Bookmark) => void | Promise<void>;
  onOpenSettings?: () => void;
  onRetry?: () => void;
};

export default function Dock({
  bookmarks,
  loading,
  error,
  openInNewTab,
  siteUrl,
  onOpenBookmark,
  onOpenSettings,
  onRetry,
}: DockProps) {
  const mouseX = useMotionValue(Infinity);
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent) {
    mouseX.set(e.clientX);
  }

  function handleMouseLeave() {
    mouseX.set(Infinity);
  }

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="glass-panel flex items-center gap-2 rounded-3xl px-5 py-3"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-12 w-12 animate-pulse rounded-2xl bg-[var(--bg-muted)]"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="glass-panel max-w-[min(92vw,28rem)] rounded-2xl px-5 py-3 text-sm"
      >
        <p className="text-amber-400/90">无法加载 Dock：{error}</p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="text-[var(--cobalt)] underline-offset-2 hover:underline"
            >
              重试
            </button>
          ) : null}
          {onOpenSettings ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="text-[var(--text-secondary)] underline-offset-2 hover:underline"
            >
              打开设置
            </button>
          ) : null}
        </div>
      </motion.div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="glass-panel max-w-[min(92vw,28rem)] rounded-2xl px-5 py-3 text-sm text-[var(--text-secondary)]"
      >
        <p className="opacity-80">暂无置顶书签 — 在 Nav 中将书签「置顶」即可显示于此</p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {siteUrl ? (
            <a
              href={siteUrl}
              className="text-[var(--cobalt)] underline-offset-2 hover:underline"
            >
              打开 Nav 网站
            </a>
          ) : null}
          {onOpenSettings ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="text-[var(--text-secondary)] underline-offset-2 hover:underline"
            >
              打开设置
            </button>
          ) : null}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative glass-panel flex max-w-[min(92vw,48rem)] items-end gap-2 overflow-x-auto rounded-3xl px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {bookmarks.map((bm, i) => (
        <DockItem
          key={bm.id}
          bookmark={bm}
          mouseX={mouseX}
          index={i}
          total={bookmarks.length}
          openInNewTab={openInNewTab}
          onOpen={onOpenBookmark}
        />
      ))}
    </motion.div>
  );
}
