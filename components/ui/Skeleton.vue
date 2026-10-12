<script setup lang="ts">
/**
 * UiSkeleton — Astryx-style shimmer loading placeholder.
 * https://astryx.atmeta.com/components/Skeleton
 */

interface Props {
  width?: string | number;
  height?: string | number;
  rounded?: 'none' | 'sm' | 'md' | 'full';
  lines?: number;   // if > 1, renders stacked lines
}

const props = withDefaults(defineProps<Props>(), {
  rounded: 'sm',
  lines: 1,
});

const roundedClasses: Record<string, string> = {
  none: 'rounded-none',
  sm:   'rounded-[--ui-radius-sm]',
  md:   'rounded-[--ui-radius-md]',
  full: 'rounded-full',
};

const style = (idx = 0) => ({
  width:  idx === props.lines - 1 && props.lines > 1 ? '75%' : (typeof props.width === 'number' ? `${props.width}px` : props.width),
  height: typeof props.height === 'number' ? `${props.height}px` : (props.height ?? '16px'),
});
</script>

<template>
  <div :class="lines > 1 ? 'flex flex-col gap-2' : undefined">
    <div
      v-for="i in lines"
      :key="i"
      :style="style(i - 1)"
      :class="[
        roundedClasses[rounded],
        'relative overflow-hidden bg-[--ui-color-bg-muted]',
      ]"
    >
      <!-- Shimmer overlay -->
      <div
        class="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease_infinite]"
        style="background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%); animation-name: ui-shimmer; animation-duration: 1.4s; animation-timing-function: ease; animation-iteration-count: infinite;"
      />
    </div>
  </div>
</template>
