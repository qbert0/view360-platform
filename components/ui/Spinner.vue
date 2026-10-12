<script setup lang="ts">
/**
 * UiSpinner — Astryx-style loading spinner.
 * https://astryx.atmeta.com/components/Spinner
 *
 * Sizes: sm | md | lg
 * Colors: inherit | primary | white
 */

interface Props {
  size?: 'sm' | 'md' | 'lg';
  color?: 'inherit' | 'primary' | 'white';
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  color: 'primary',
  label: 'Đang tải…',
});

const sizeClasses: Record<string, string> = {
  sm: 'h-4 w-4 border-[1.5px]',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[2.5px]',
};

const colorClasses: Record<string, string> = {
  primary: 'border-[--ui-color-brand-subtle] border-t-[--ui-color-brand]',
  white:   'border-white/25 border-t-white',
  inherit: 'border-current/20 border-t-current',
};
</script>

<template>
  <span
    role="status"
    :aria-label="label"
    :class="[
      'inline-block animate-spin rounded-full',
      sizeClasses[size],
      colorClasses[color],
    ]"
  />
</template>
