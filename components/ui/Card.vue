<script setup lang="ts">
/**
 * UiCard — Astryx-style card container.
 * https://astryx.atmeta.com/components/Card
 *
 * Variants: surface | elevated | outlined
 * Props: padding, hoverable, clickable
 */

interface Props {
  variant?: 'surface' | 'elevated' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
  clickable?: boolean;
  as?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'surface',
  padding: 'md',
  hoverable: false,
  clickable: false,
  as: 'div',
});

const variantClasses: Record<string, string> = {
  surface:  'bg-[--ui-color-surface] ring-1 ring-[--ui-color-border]',
  elevated: 'bg-[--ui-color-surface-raised] shadow-[--ui-shadow-low]',
  outlined: 'bg-transparent ring-1 ring-[--ui-color-border-strong]',
};

const paddingClasses: Record<string, string> = {
  none: '',
  sm:   'p-3',
  md:   'p-5',
  lg:   'p-7',
};
</script>

<template>
  <component
    :is="clickable ? 'button' : as"
    :type="clickable ? 'button' : undefined"
    :class="[
      'block w-full rounded-[--ui-radius-md] transition-all duration-[--ui-transition-base]',
      variantClasses[variant],
      paddingClasses[padding],
      (hoverable || clickable) ? 'hover:shadow-[--ui-shadow-medium] hover:-translate-y-px' : '',
      clickable ? 'cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-[--ui-color-brand]' : '',
    ]"
  >
    <!-- Optional header slot -->
    <div v-if="$slots.header" class="mb-4 border-b border-[--ui-color-border-subtle] pb-4">
      <slot name="header" />
    </div>
    <!-- Main content -->
    <slot />
    <!-- Optional footer slot -->
    <div v-if="$slots.footer" class="mt-4 border-t border-[--ui-color-border-subtle] pt-4">
      <slot name="footer" />
    </div>
  </component>
</template>
