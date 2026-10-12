<script setup lang="ts">
/**
 * UiBadge — Astryx-style badge / label component.
 * https://astryx.atmeta.com/components/Badge
 *
 * Variants: default | primary | success | error | warning | muted
 * Sizes:    sm | md
 */

interface Props {
  variant?: 'default' | 'primary' | 'success' | 'error' | 'warning' | 'muted';
  size?: 'sm' | 'md';
  pill?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'md',
  pill: false,
});

const variantClasses: Record<string, string> = {
  default: 'bg-[--ui-color-bg-muted]  text-[--ui-color-text-secondary] ring-1 ring-[--ui-color-border]',
  primary: 'bg-[--ui-color-brand-muted] text-[--ui-color-brand] ring-1 ring-[--ui-color-brand]/20',
  success: 'bg-[--ui-color-success-muted] text-[--ui-color-success] ring-1 ring-[--ui-color-success]/20',
  error:   'bg-[--ui-color-error-muted] text-[--ui-color-error]   ring-1 ring-[--ui-color-error]/20',
  warning: 'bg-[--ui-color-warning-muted] text-[--ui-color-warning] ring-1 ring-[--ui-color-warning]/20',
  muted:   'bg-[--ui-color-bg-subtle]  text-[--ui-color-text-muted]  ring-1 ring-[--ui-color-border-subtle]',
};

const sizeClasses: Record<string, string> = {
  sm: 'text-[10px] font-semibold px-1.5 py-0.5 leading-none tracking-wide uppercase',
  md: 'text-xs     font-medium  px-2   py-1   leading-none',
};
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1 whitespace-nowrap',
      variantClasses[variant],
      sizeClasses[size],
      pill ? 'rounded-full' : 'rounded-[--ui-radius-xs]',
    ]"
  >
    <slot name="icon" />
    <slot />
  </span>
</template>
