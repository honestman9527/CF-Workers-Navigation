import type { ReactNode } from 'react';

import { Sidebar, SidebarContent, SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export function AppShell({
  header,
  sidebar,
  children,
}: {
  header: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <SidebarProvider className="app-root min-h-dvh w-full max-w-full flex-col overflow-x-clip bg-background text-foreground">
      {header}
      <div className="flex min-h-[calc(100dvh-var(--header-h)-var(--safe-t))] flex-1">
        <Sidebar
          collapsible="offcanvas"
          variant="floating"
          className="top-[calc(var(--header-h)+var(--safe-t)+1rem)] bottom-4 left-4 h-auto w-[15rem] xl:w-[16rem]"
        >
          <SidebarContent className="p-4">{sidebar}</SidebarContent>
        </Sidebar>
        <SidebarInset className="app-inset min-w-0 overflow-x-clip">
          <div className="mx-auto w-full max-w-[60rem] px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
