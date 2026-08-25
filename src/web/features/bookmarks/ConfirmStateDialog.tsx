import type { ConfirmRequest } from './useBookmarkMutations';

import { ConfirmDialog } from '@nav/components/ConfirmDialog';

/** 统一渲染 useBookmarkMutations 的二次确认状态：工作区与后台「网站管理」共用。 */
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
