<script setup lang="ts">
/**
 * UiToast — single toast item component (used internally by ToastProvider).
 * https://astryx.atmeta.com/components/Toast
 */

import { useToast, type ToastItem } from '#view360/composables/useToast';

const props = defineProps<{ toast: ToastItem }>();
const { remove } = useToast();

const variantClasses: Record<string, string> = {
  default: 'bg-[#1c1c1c] dark:bg-[#2d2d2d] text-white ring-white/10',
  success: 'bg-[--ui-color-success] text-white ring-white/10',
  error:   'bg-[--ui-color-error]   text-white ring-white/10',
  warning: 'bg-[--ui-color-warning] text-white ring-white/10',
};

const iconMap: Record<string, string> = {
  default: '💬', success: '✓', error: '✕', warning: '⚠',
};
</script>

<template>
  <div
    :class="[
      'flex items-start gap-3 min-w-[280px] max-w-sm',
      'rounded-[--ui-radius-md] px-4 py-3 ring-1 shadow-[--ui-shadow-high]',
      'pointer-events-auto',
      variantClasses[toast.variant],
    ]"
    style="animation: ui-toast-in 0.2s ease both;"
    role="status"
    aria-live="polite"
  >
    <span class="mt-px shrink-0 text-sm font-bold" aria-hidden="true">{{ iconMap[toast.variant] }}</span>
    <div class="flex-1 min-w-0">
      <p v-if="toast.title" class="text-sm font-semibold leading-snug">{{ toast.title }}</p>
      <p class="text-sm leading-relaxed" :class="toast.title ? 'opacity-80 mt-0.5' : ''">{{ toast.message }}</p>
    </div>
    <button
      type="button"
      class="shrink-0 opacity-60 hover:opacity-100 transition-opacity p-0.5"
      aria-label="Đóng thông báo"
      @click="remove(toast.id)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
    </button>
  </div>
</template>
