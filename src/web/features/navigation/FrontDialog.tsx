import type { ReactNode } from 'react';

import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

import { FrontButton } from './controls';

export function FrontDialog({
  open,
  onClose,
  title,
  description,
  dismissible = true,
  maxWidthClass = 'max-w-xl',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  dismissible?: boolean;
  maxWidthClass?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next, details) => {
        if (!next && !dismissible) {
          details.cancel();
          return;
        }
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-xs transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          className={cn(
            'front-surface glass-surface overlay-popup fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none',
            maxWidthClass,
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/60 px-6 pt-5 pb-4 sm:px-7 sm:pt-6">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold tracking-tight sm:text-xl">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              disabled={!dismissible}
              render={<FrontButton className="-mt-1 -mr-1 size-10 p-0" aria-label="关闭" />}
            >
              <X aria-hidden="true" className="size-4" />
            </Dialog.Close>
          </div>
          <div className="scrollbar-safe scroll-shadow-y min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="px-6 py-5 sm:px-7 sm:py-6">{children}</div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
