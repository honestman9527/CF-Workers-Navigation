import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import { CheckCircle2Icon, InfoIcon, Loader2Icon, TriangleAlertIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const toast = ToastPrimitive.createToastManager();

function ToastProvider({ ...props }: React.ComponentProps<typeof ToastPrimitive.Provider>) {
  return <ToastPrimitive.Provider {...props} />;
}

function ToastPortal({ ...props }: React.ComponentProps<typeof ToastPrimitive.Portal>) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

function ToastViewport({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        'pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto w-auto max-w-sm outline-none sm:right-4 sm:left-auto sm:mx-0 sm:w-full',
        className,
      )}
      {...props}
    />
  );
}

function Toast({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Root>) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        'pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full rounded-md border bg-popover text-popover-foreground shadow-lg transition-[transform,opacity] duration-300 outline-none data-ending-style:translate-y-full data-ending-style:opacity-0 data-starting-style:translate-y-full data-starting-style:opacity-0',
        className,
      )}
      {...props}
    />
  );
}

function ToastContent({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Content>) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn('flex min-h-14 items-center gap-3 overflow-hidden p-4', className)}
      {...props}
    />
  );
}

function ToastTitle({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Title>) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn('text-sm font-medium', className)}
      {...props}
    />
  );
}

function ToastDescription({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function ToastAction({
  className,
  render = <Button variant="outline" size="sm" />,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Action>) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      className={cn('shrink-0', className)}
      {...props}
    />
  );
}

function ToastClose({
  className,
  children,
  render = <Button variant="ghost" size="icon-sm" />,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Close>) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label="关闭通知"
      render={render}
      className={cn('relative shrink-0 text-muted-foreground hover:text-foreground', className)}
      {...props}
    >
      {children ?? <XIcon aria-hidden="true" />}
    </ToastPrimitive.Close>
  );
}

function ToastIcon({ type }: { type: string | undefined }) {
  if (type === 'success') return <CheckCircle2Icon className="size-4 shrink-0 text-primary" />;
  if (type === 'error') return <TriangleAlertIcon className="size-4 shrink-0 text-destructive" />;
  if (type === 'loading') return <Loader2Icon className="size-4 shrink-0 animate-spin" />;
  return <InfoIcon className="size-4 shrink-0 text-primary" />;
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem}>
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  ));
}

function Toaster({
  children,
  toastManager = toast,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Provider>) {
  return (
    <ToastProvider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}

export {
  Toaster,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  toast,
};
