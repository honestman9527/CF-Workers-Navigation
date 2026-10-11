import type { ReactNode } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * 通用对话框外壳：受控 open/onClose，直接组合 shadcn dialog。
 * 仅管理界面使用；前台直接组合 Base UI。
 */
export function DialogPanel({
  open,
  onClose,
  children,
  size = 'md',
  dismissible = true,
  labelledBy,
  title,
  description,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  dismissible?: boolean;
  labelledBy?: string;
  title?: string;
  description?: string;
}) {
  const sizeClass = size === 'lg' ? 'sm:max-w-xl' : size === 'xl' ? 'sm:max-w-2xl' : 'sm:max-w-lg';

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (!nextOpen && !dismissible) {
          eventDetails.cancel();
          return;
        }
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={dismissible}
        className={cn(
          'admin-surface max-h-[min(92dvh,100%)] gap-0 overflow-y-auto overscroll-contain rounded-2xl border-border/60 p-5 shadow-xl sm:p-8',
          sizeClass,
        )}
        aria-labelledby={labelledBy}
      >
        {title ? <DialogTitle className="sr-only">{title}</DialogTitle> : null}
        {description ? (
          <DialogDescription className="sr-only">{description}</DialogDescription>
        ) : null}
        {!title && !labelledBy ? <DialogTitle className="sr-only">对话框</DialogTitle> : null}
        {children}
      </DialogContent>
    </Dialog>
  );
}
