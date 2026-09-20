import { useState, type CSSProperties, type ReactNode } from 'react';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';

export function AppShell({
  header,
  sidebar,
  brand,
  children,
}: {
  header: ReactNode;
  sidebar: ReactNode;
  brand?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('nav-workspace-sidebar-open') !== 'false';
    } catch {
      return true;
    }
  });
  function changeOpen(value: boolean) {
    setOpen(value);
    try {
      localStorage.setItem('nav-workspace-sidebar-open', String(value));
    } catch {
      /* optional preference */
    }
  }
  return (
    <SidebarProvider
      open={open}
      onOpenChange={changeOpen}
      style={{ '--sidebar-width': 'clamp(17.5rem, 22vw, 20rem)' } as CSSProperties}
      className="app-root min-h-dvh w-full max-w-full flex-col overflow-x-clip bg-background text-foreground motion-reduce:**:transition-none"
    >
      <div className="flex min-h-dvh flex-1">
        <Sidebar
          collapsible="offcanvas"
          variant="floating"
          className="top-[var(--safe-t)] bottom-[env(safe-area-inset-bottom)] h-auto p-3"
        >
          <WorkspaceSidebarContent brand={brand}>{sidebar}</WorkspaceSidebarContent>
        </Sidebar>
        <SidebarInset className="app-inset min-w-0 overflow-x-clip">
          {header}
          <div className="mx-auto w-full max-w-[90rem] px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function WorkspaceSidebarContent({ children, brand }: { children: ReactNode; brand?: ReactNode }) {
  const { open, isMobile, setOpenMobile } = useSidebar();
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      inert={!isMobile && !open}
      aria-hidden={!isMobile && !open ? true : undefined}
    >
      {brand ? (
        <SidebarHeader className="shrink-0 px-4 py-5" onClick={() => setOpenMobile(false)}>
          {brand}
        </SidebarHeader>
      ) : null}
      <SidebarContent className="p-2">{children}</SidebarContent>
    </div>
  );
}

export function WorkspaceSidebarTrigger() {
  const { open, openMobile, isMobile } = useSidebar();
  const expanded = isMobile ? openMobile : open;
  const label = expanded ? '收起索引' : '展开索引';
  return <SidebarTrigger aria-label={label} title={label} aria-expanded={expanded} />;
}
