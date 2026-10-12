<script setup lang="ts">
/**
 * UiButton — Astryx-style button component for Vue 3.
 * https://astryx.atmeta.com/components/Button
 *
 * Variants: primary | secondary | ghost | muted | danger
 * Sizes:    sm | md | lg
 */

interface Props {
  variant?: 'primary' | 'secondary' | 'ghost' | 'muted' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  href?: string;
  as?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  type: 'button',
});

const tag = computed(() => props.href ? 'a' : props.as ?? 'button');

const variantClasses: Record<string, string> = {
  primary:   'bg-[--ui-color-brand] text-white hover:bg-[--ui-color-brand-hover] active:bg-[--ui-color-brand-active] focus-visible:ring-[--ui-color-brand]',
  secondary: 'bg-transparent text-[--ui-color-brand] ring-1 ring-[--ui-color-brand] hover:bg-[--ui-color-brand-muted] active:bg-[--ui-color-brand-subtle]  focus-visible:ring-[--ui-color-brand]',
  ghost:     'bg-transparent text-[--ui-color-text-primary] hover:bg-[--ui-color-bg-muted] active:bg-[--ui-color-bg-subtle] focus-visible:ring-[--ui-color-border-strong]',
  muted:     'bg-[--ui-color-bg-muted] text-[--ui-color-text-secondary] hover:bg-[--ui-color-bg-subtle] active:opacity-80 focus-visible:ring-[--ui-color-border-strong]',
  danger:    'bg-[--ui-color-error] text-white hover:bg-[--ui-color-error-hover] active:opacity-90 focus-visible:ring-[--ui-color-error]',
};

const sizeClasses: Record<string, string> = {
  sm: 'h-8  px-3   text-xs   gap-1.5 rounded-[--ui-radius-sm]',
  md: 'h-10 px-4   text-sm   gap-2   rounded-[--ui-radius-sm]',
  lg: 'h-12 px-5   text-base gap-2.5 rounded-[--ui-radius-md]',
};

import { computed } from 'vue';
</script>

<template>
  <component
    :is="tag"
    :type="tag === 'button' ? type : undefined"
    :href="href"
    :disabled="disabled || loading || undefined"
    :aria-busy="loading || undefined"
    :class="[
      'inline-flex items-center justify-center font-medium leading-none',
      'select-none whitespace-nowrap outline-none',
      'transition-all duration-[--ui-transition-fast]',
      'focus-visible:ring-2 focus-visible:ring-offset-1',
      variantClasses[variant],
      sizeClasses[size],
      (disabled || loading) ? 'opacity-50 pointer-events-none' : '',
    ]"
  >
    <!-- Loading spinner -->
    <span v-if="loading" class="mr-1 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
    <!-- Leading icon slot -->
    <slot name="icon-leading" />
    <!-- Label -->
    <slot />
    <!-- Trailing icon slot -->
    <slot name="icon-trailing" />
  </component>
</template>
