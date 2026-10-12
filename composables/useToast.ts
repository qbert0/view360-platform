/**
 * useToast — imperative toast API.
 * https://astryx.atmeta.com/components/Toast
 *
 * Usage:
 *   const toast = useToast();
 *   toast.show({ message: 'Saved!', variant: 'success' });
 */

import { ref, readonly } from 'vue';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning';

export interface ToastItem {
  id:        string;
  message:   string;
  variant:   ToastVariant;
  duration:  number;
  title?:    string;
}

const toasts = ref<ToastItem[]>([]);

function show(opts: {
  message:  string;
  variant?: ToastVariant;
  title?:   string;
  duration?: number;
}) {
  const item: ToastItem = {
    id:       Math.random().toString(36).slice(2, 10),
    message:  opts.message,
    variant:  opts.variant ?? 'default',
    title:    opts.title,
    duration: opts.duration ?? 4000,
  };
  toasts.value.push(item);
  if (item.duration > 0) {
    setTimeout(() => remove(item.id), item.duration);
  }
}

function remove(id: string) {
  const idx = toasts.value.findIndex(t => t.id === id);
  if (idx !== -1) toasts.value.splice(idx, 1);
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    show,
    remove,
    success: (message: string, opts?: Partial<ToastItem>) => show({ ...opts, message, variant: 'success' }),
    error:   (message: string, opts?: Partial<ToastItem>) => show({ ...opts, message, variant: 'error' }),
    warning: (message: string, opts?: Partial<ToastItem>) => show({ ...opts, message, variant: 'warning' }),
  };
}
