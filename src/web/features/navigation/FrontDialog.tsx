import type { ReactNode } from 'react';

import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';

import { FrontButton } from './controls';

export function FrontDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm" />
        <Dialog.Popup className="front-surface fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-[1.125rem] border border-border bg-card p-6 text-foreground sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <Dialog.Title className="text-2xl font-semibold tracking-tight">{title}</Dialog.Title>
            <Dialog.Close render={<FrontButton className="size-11 p-0" aria-label="关闭" />}>
              <X className="size-5" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
