import type { ReactNode } from 'react';

import { Sidebar, SidebarContent, SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

export function AppShell({
  header,
  sidebar,
  navOpen,
  onCloseNav,
  children,
  fab,
}: {
  header: ReactNode;
  sidebar: ReactNode;
  navOpen: boolean;
  onCloseNav: () => void;
  children: ReactNode;
  fab?: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] w-full max-w-full overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-40 w-full max-w-full border-b border-border bg-background/90 pt-[var(--safe-t)] backdrop-blur-md">
        {header}
      </header>

      <SidebarProvider>
        {/* 桌面端（lg+）由 Sidebar 原语渲染常驻索引栏；`hidden lg:contents` 同时屏蔽原语
            自带的内部状态抽屉（openMobile），避免与下方受 navOpen 控制的抽屉重复。 */}
        <div className="hidden lg:contents">
          <Sidebar
            collapsible="none"
            className="top-[calc(var(--header-h)+var(--safe-t))] h-[calc(100dvh-var(--header-h)-var(--safe-t))] w-[15.5rem] xl:w-[16.5rem]"
          >
            <SidebarContent className="p-3">{sidebar}</SidebarContent>
          </Sidebar>
        </div>

        <SidebarInset className="overflow-x-clip">
          <div className="w-full max-w-[1100px] px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>

      {fab}

      {/* 移动端抽屉：受 navOpen/onCloseNav 控制；常驻挂载以保留滑入滑出过渡，
          关闭时用 inert 阻止焦点与读屏进入，替代原 AnimatePresence 卸载。 */}
      <div
        className={cn('fixed inset-0 z-50 lg:hidden', !navOpen && 'pointer-events-none')}
        role="presentation"
      >
        <div
          className={cn(
            'absolute inset-0 bg-black/50 transition-opacity duration-200',
            navOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={onCloseNav}
          aria-hidden
        />
        <aside
          className={cn(
            'absolute top-0 left-0 flex h-full w-[min(18rem,88vw)] flex-col border-r border-border bg-card pt-[var(--safe-t)] shadow-2xl transition-transform duration-200 ease-out',
            navOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          onClick={(event) => event.stopPropagation()}
          inert={!navOpen}
          aria-label="标签索引"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">{sidebar}</div>
        </aside>
      </div>
    </div>
  );
}
