<script setup lang="ts">
/**
 * UiBanner — Astryx-style contextual alert banner.
 * https://astryx.atmeta.com/components/Banner
 *
 * Variants: info | success | warning | error
 */

import { ref } from 'vue';

interface Props {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  dismissable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'info',
  dismissable: false,
});

const emit = defineEmits<{ dismiss: [] }>();
const dismissed = ref(false);

function dismiss() {
  dismissed.value = true;
  emit('dismiss');
}

const iconMap: Record<string, string> = {
  info:    'ℹ️',
  success: '✅',
  warning: '⚠️',
  error:   '❌',
};

const variantClasses: Record<string, string> = {
  info:    'bg-[--ui-color-brand-muted]   ring-[--ui-color-brand]/20   text-[--ui-color-brand]',
  success: 'bg-[--ui-color-success-muted] ring-[--ui-color-success]/20 text-[--ui-color-success]',
  warning: 'bg-[--ui-color-warning-muted] ring-[--ui-color-warning]/20 text-[--ui-color-warning]',
  error:   'bg-[--ui-color-error-muted]   ring-[--ui-color-error]/20   text-[--ui-color-error]',
};
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 -translate-y-1"
    leave-active-class="transition-all duration-150 ease-in"
    leave-to-class="opacity-0 -translate-y-1"
  >
    <div
      v-if="!dismissed"
      role="alert"
      :class="[
        'flex items-start gap-3 rounded-[--ui-radius-md] px-4 py-3 ring-1 text-sm',
        variantClasses[variant],
      ]"
    >
      <span class="mt-px shrink-0 text-base leading-none" aria-hidden="true">{{ iconMap[variant] }}</span>
      <div class="flex-1 min-w-0">
        <p v-if="title" class="font-semibold leading-snug mb-0.5">{{ title }}</p>
        <div class="opacity-85 leading-relaxed"><slot /></div>
        <div v-if="$slots.actions" class="mt-3 flex gap-2">
          <slot name="actions" />
        </div>
      </div>
      <button
        v-if="dismissable"
        type="button"
        class="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Đóng thông báo"
        @click="dismiss"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
  </Transition>
</template>
