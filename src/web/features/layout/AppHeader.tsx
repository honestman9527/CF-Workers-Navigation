import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** 启动台与工作区共用的顶栏：左侧品牌（可选索引切换按钮），右侧动作区与菜单。 */
export function AppHeader({
  surface = 'header',
  navButton,
  brand,
  search,
  actions,
  menu,
}: {
  /** 工作区「展开／收起索引」按钮等（可选）。 */
  navButton?: ReactNode;
  /** 品牌标识（Brand 组件）。 */
  brand?: ReactNode;
  /** 工作区搜索，在窄屏自动换到第二行。 */
  search?: ReactNode;
  surface?: 'header' | 'workspace';
  /** 菜单左侧的快捷动作，如「添加书签」（可选）。 */
  actions?: ReactNode;
  /** 右上角下拉菜单（HeaderMenu 组件）。 */
  menu: ReactNode;
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full max-w-full pt-[var(--safe-t)]',
        surface === 'workspace' ? 'bg-transparent text-foreground' : 'bg-black text-white',
      )}
    >
      <div
        className={cn(
          'flex items-center',
          surface === 'workspace'
            ? 'mx-auto w-full max-w-[90rem] flex-wrap gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6 lg:px-8'
            : 'h-[var(--header-h)] justify-between gap-4 px-4 sm:px-8',
        )}
      >
        <div className="flex items-center gap-2">
          {navButton}
          {brand}
        </div>
        {search ? (
          <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:max-w-2xl sm:flex-1">
            {search}
          </div>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
          {menu}
        </div>
      </div>
    </header>
  );
}
