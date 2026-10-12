<script setup lang="ts">
/**
 * UiStatusDot — Astryx-style status indicator dot.
 * https://astryx.atmeta.com/components/StatusDot
 *
 * Variants: online | offline | busy | away
 * Sizes: sm | md | lg
 */

interface Props {
  variant?: 'online' | 'offline' | 'busy' | 'away';
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'online',
  size: 'md',
  pulse: false,
});

const variantClasses: Record<string, string> = {
  online:  'bg-[--ui-color-success]',
  offline: 'bg-[--ui-color-text-muted]',
  busy:    'bg-[--ui-color-error]',
  away:    'bg-[--ui-color-warning]',
};

const sizeClasses: Record<string, string> = {
  sm: 'h-2   w-2   ring-[1.5px]',
  md: 'h-2.5 w-2.5 ring-2',
  lg: 'h-3   w-3   ring-2',
};

const labels: Record<string, string> = {
  online: 'Trực tuyến', offline: 'Ngoại tuyến', busy: 'Bận', away: 'Vắng mặt',
};
</script>

<template>
  <span
    :aria-label="labels[variant]"
    role="img"
    :class="[
      'inline-block rounded-full ring-white dark:ring-[--ui-color-surface]',
      variantClasses[variant],
      sizeClasses[size],
      pulse && variant === 'online' ? 'animate-pulse' : '',
    ]"
  />
</template>
