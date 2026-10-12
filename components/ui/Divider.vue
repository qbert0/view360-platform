<script setup lang="ts">
/**
 * UiDivider — Astryx-style divider line.
 * https://astryx.atmeta.com/components/Divider
 *
 * Variants: default | subtle | strong
 * Orientation: horizontal | vertical
 */

interface Props {
  variant?: 'default' | 'subtle' | 'strong';
  orientation?: 'horizontal' | 'vertical';
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  orientation: 'horizontal',
});

const colorMap: Record<string, string> = {
  default: 'border-[--ui-color-border]',
  subtle:  'border-[--ui-color-border-subtle]',
  strong:  'border-[--ui-color-border-strong]',
};
</script>

<template>
  <div
    role="separator"
    :aria-orientation="orientation"
    :class="[
      orientation === 'horizontal'
        ? ['w-full flex items-center gap-3', props.label ? 'my-4' : '']
        : ['inline-block self-stretch border-l h-full mx-2', colorMap[variant]],
    ]"
  >
    <div
      v-if="orientation === 'horizontal'"
      :class="['flex-1 border-t', colorMap[variant]]"
    />
    <span
      v-if="label"
      class="shrink-0 text-xs text-[--ui-color-text-muted] font-medium whitespace-nowrap"
    >{{ label }}</span>
    <div
      v-if="orientation === 'horizontal'"
      :class="['flex-1 border-t', colorMap[variant]]"
    />
  </div>
</template>
