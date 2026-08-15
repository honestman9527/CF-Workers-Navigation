import { toast } from '@/components/ui/toast';

export type ToastKind = 'success' | 'error' | 'info';

/** Compatibility helper used by App and panels. */
export function pushToast(message: string, kind: ToastKind = 'info') {
  toast.add({
    title: message,
    type: kind,
  });
}
