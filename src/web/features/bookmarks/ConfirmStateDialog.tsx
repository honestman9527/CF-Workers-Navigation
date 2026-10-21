import { ConfirmDialog } from '@nav/components/ConfirmDialog';

export type ConfirmRequest = {
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  action: () => Promise<unknown>;
};

/** 确认状态属于后台呈现，动作通过书签写入 module 执行。 */
export function ConfirmStateDialog({
  state,
  onClose,
}: {
  state: ConfirmRequest | null;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      open={state !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      title={state?.title ?? ''}
      description={state?.description}
      confirmLabel={state?.confirmLabel ?? '确认'}
      destructive={state?.destructive ?? true}
      onConfirm={() => {
        const action = state?.action;
        onClose();
        if (action) void action();
      }}
    />
  );
}
