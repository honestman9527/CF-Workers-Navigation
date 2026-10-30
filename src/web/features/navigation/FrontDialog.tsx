import type { ReactNode } from 'react';

import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';

import { FrontButton } from './controls';

export function FrontDialog({
  open,
  onClose,
  title,
  dismissible = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  dismissible?: boolean;
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
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="front-surface fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl border border-border/60 bg-card p-6 text-foreground sm:p-7">
          <div className="mb-6 flex items-center justify-between gap-4">
            <Dialog.Title className="text-xl font-semibold tracking-tight sm:text-2xl">
              {title}
            </Dialog.Title>
            <Dialog.Close
              disabled={!dismissible}
              render={<FrontButton className="size-11 p-0" aria-label="关闭" />}
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
