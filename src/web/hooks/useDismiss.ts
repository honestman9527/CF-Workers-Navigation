import { useEffect, type RefObject } from 'react';

/**
 * 面板类浮层的关闭逻辑：open 期间点击面板外部或按 Escape 触发 onDismiss。
 * 用于内联展开的分类树等自绘浮层，避免引入额外的 popover 基元。
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node | null;
      if (ref.current && target && !ref.current.contains(target)) onDismiss();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onDismiss();
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onDismiss, ref]);
}
