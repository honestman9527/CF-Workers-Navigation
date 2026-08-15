import type { ReactNode } from 'react';

import { AnimatePresence, motion } from 'motion/react';

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

      <div className="flex w-full max-w-full min-w-0">
        <aside className="sticky top-[calc(var(--header-h)+var(--safe-t))] hidden h-[calc(100dvh-var(--header-h)-var(--safe-t))] w-[15.5rem] shrink-0 overflow-y-auto border-r border-border bg-sidebar text-sidebar-foreground lg:block xl:w-[16.5rem]">
          <div className="flex h-full flex-col p-3">{sidebar}</div>
        </aside>

        <main className="min-w-0 flex-1 overflow-x-clip px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
          <div className="w-full max-w-[1100px]">{children}</div>
        </main>
      </div>

      {fab}

      <AnimatePresence>
        {navOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 bg-black/50"
              onClick={onCloseNav}
              aria-hidden
            />
            <motion.aside
              drag="x"
              dragConstraints={{ left: -120, right: 0 }}
              dragElastic={0.15}
              onDragEnd={(_, info) => {
                if (info.offset.x < -80 || info.velocity.x < -400) {
                  onCloseNav();
                }
              }}
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 340 }}
              className={cn(
                'absolute top-0 left-0 flex h-full w-[min(18rem,88vw)] flex-col border-r border-border bg-card pt-[var(--safe-t)] shadow-2xl',
              )}
              onClick={(event) => event.stopPropagation()}
              aria-label="分类导航"
            >
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">{sidebar}</div>
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
