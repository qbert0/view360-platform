<script setup lang="ts">
/**
 * UiAvatar — Astryx-style avatar with image + initials fallback.
 * https://astryx.atmeta.com/components/Avatar
 *
 * Sizes: xs | sm | md | lg | xl
 * Shape: circle | square
 */

import { computed } from 'vue';

interface Props {
  src?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'square';
  alt?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  shape: 'circle',
});

const sizeClasses: Record<string, string> = {
  xs: 'h-6  w-6  text-[9px]',
  sm: 'h-8  w-8  text-[11px]',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

const shapeClasses: Record<string, string> = {
  circle: 'rounded-full',
  square: 'rounded-[--ui-radius-sm]',
};

const initials = computed(() => {
  if (!props.name) return '?';
  const parts = props.name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
});

// Deterministic background color from name
const bgColors = [
  '#1f6f8b', '#3d5f43', '#a8583f', '#7c3aed', '#0891b2',
  '#065f46', '#9d174d', '#92400e', '#1e40af', '#5b21b6',
];
const bgColor = computed(() => {
  if (!props.name) return bgColors[0];
  const idx = props.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % bgColors.length;
  return bgColors[idx];
});

const hasImage = computed(() => !!props.src);
</script>

<template>
  <div
    :class="[
      'relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold',
      sizeClasses[size],
      shapeClasses[shape],
    ]"
    :style="!hasImage ? { backgroundColor: bgColor, color: '#fff' } : undefined"
    :aria-label="name || alt"
    role="img"
  >
    <img
      v-if="hasImage"
      :src="src"
      :alt="name || alt || ''"
      class="h-full w-full object-cover"
      @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
    />
    <span v-if="!hasImage" aria-hidden="true">{{ initials }}</span>
    <!-- Status dot slot -->
    <slot name="status" />
  </div>
</template>
