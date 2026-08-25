import type { ComponentProps, CSSProperties } from 'react';

import { PanelLeft } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SIDEBAR_WIDTH = '16rem';
const SIDEBAR_WIDTH_MOBILE = '18rem';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

type SidebarContextProps = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (open: boolean | ((value: boolean) => boolean)) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.');
  }
  return context;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return !window.matchMedia('(min-width: 64rem)').matches;
  });

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 64rem)');
    const onChange = (event: MediaQueryListEvent) => setIsMobile(!event.matches);
    mql.addEventListener('change', onChange);
    setIsMobile(!mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: ComponentProps<'div'> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = useState(false);
  const [_open, _setOpen] = useState(defaultOpen);
  const open = openProp ?? _open;

  const setOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const openState = typeof value === 'function' ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }
    },
    [open, setOpenProp],
  );

  const toggleSidebar = useCallback(() => {
    return isMobile ? setOpenMobile((value) => !value) : setOpen((value) => !value);
  }, [isMobile, setOpen, setOpenMobile]);

  // Keyboard shortcut to toggle the sidebar (Cmd/Ctrl + B).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  // Escape closes the mobile sidebar.
  useEffect(() => {
    if (!openMobile) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMobile(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openMobile, setOpenMobile]);

  // Close the mobile sidebar when the viewport grows to desktop size.
  useEffect(() => {
    if (!isMobile && openMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, openMobile]);

  // Lock body scroll while the mobile sidebar is open.
  useEffect(() => {
    if (!openMobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [openMobile]);

  const state = open ? 'expanded' : 'collapsed';

  const contextValue = useMemo<SidebarContextProps>(
    () => ({ state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar }),
    [state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            '--sidebar-width': SIDEBAR_WIDTH,
            '--sidebar-width-mobile': SIDEBAR_WIDTH_MOBILE,
            ...style,
          } as CSSProperties
        }
        className={cn('flex min-h-svh w-full', className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function Sidebar({
  side = 'left',
  variant = 'sidebar',
  collapsible = 'offcanvas',
  className,
  children,
  ...props
}: ComponentProps<'div'> & {
  side?: 'left' | 'right';
  variant?: 'sidebar' | 'floating' | 'inset';
  collapsible?: 'offcanvas' | 'none';
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  // Mobile: fixed overlay with backdrop, slides in from the side.
  if (isMobile) {
    return (
      <>
        <div
          data-slot="sidebar-backdrop"
          aria-hidden="true"
          onClick={() => setOpenMobile(false)}
          className={cn(
            'fixed inset-0 z-50 bg-black/50 transition-opacity duration-200',
            openMobile ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        />
        <aside
          data-sidebar="sidebar"
          data-slot="sidebar-mobile"
          role="dialog"
          aria-modal="true"
          aria-label="Sidebar"
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex h-full w-(--sidebar-width-mobile) max-w-[calc(100vw-2rem)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl transition-transform duration-200 ease-in-out',
            side === 'right' && 'right-0 left-auto border-r-0 border-l',
            openMobile
              ? 'translate-x-0'
              : side === 'right'
                ? 'translate-x-full'
                : '-translate-x-full',
            className,
          )}
          {...props}
        >
          <div className="flex h-full w-full flex-col">{children}</div>
        </aside>
      </>
    );
  }

  // Desktop: sticky, in-flow, visible from lg up.
  return (
    <aside
      data-state={state}
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
      className={cn(
        'sticky top-0 hidden h-dvh w-(--sidebar-width) shrink-0 flex-col text-sidebar-foreground lg:flex',
        variant === 'sidebar' &&
          (side === 'left'
            ? 'border-r border-sidebar-border bg-sidebar'
            : 'border-l border-sidebar-border bg-sidebar'),
        variant === 'floating' || variant === 'inset' ? 'p-2' : '',
        collapsible === 'offcanvas' && state === 'collapsed' && 'hidden lg:hidden',
        className,
      )}
      {...props}
    >
      <div
        data-sidebar="sidebar"
        data-slot="sidebar-inner"
        className={cn(
          'flex size-full flex-col bg-sidebar',
          (variant === 'floating' || variant === 'inset') &&
            'rounded-lg shadow-sm ring-1 ring-sidebar-border',
        )}
      >
        {children}
      </div>
    </aside>
  );
}

function SidebarInset({ className, ...props }: ComponentProps<'main'>) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn('relative flex w-full min-w-0 flex-1 flex-col bg-background', className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn('no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto', className)}
      {...props}
    />
  );
}

/** 侧边栏开关：移动端唤起抽屉，桌面端折叠/展开。放在 SidebarProvider 内使用。 */
function SidebarTrigger({ className, onClick }: ComponentProps<'button'>) {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn('size-9', className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      aria-label="切换侧边栏"
    >
      <PanelLeft className="size-4" />
    </Button>
  );
}

export { Sidebar, SidebarContent, SidebarInset, SidebarProvider, SidebarTrigger, useSidebar };
