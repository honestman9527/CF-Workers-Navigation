import type { ReactNode } from 'react';

/** 启动台与工作区共用的顶栏：左侧品牌（可选移动端索引按钮），右侧动作区与菜单。 */
export function AppHeader({
  navButton,
  brand,
  actions,
  menu,
}: {
  /** 工作区移动端「打开索引」按钮等（可选）。 */
  navButton?: ReactNode;
  /** 品牌标识（Brand 组件）。 */
  brand: ReactNode;
  /** 菜单左侧的快捷动作，如「添加书签」（可选）。 */
  actions?: ReactNode;
  /** 右上角下拉菜单（HeaderMenu 组件）。 */
  menu: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 w-full max-w-full border-b border-border/60 bg-background/80 pt-[var(--safe-t)] backdrop-blur-xl">
      <div className="flex h-[var(--header-h)] items-center justify-between gap-4 px-4 sm:px-8">
        <div className="flex items-center gap-2">
          {navButton}
          {brand}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {menu}
        </div>
      </div>
    </header>
  );
}
