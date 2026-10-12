<script setup lang="ts">
/**
 * UiEmptyState — Astryx-style empty state placeholder.
 * https://astryx.atmeta.com/components/EmptyState
 */

interface Props {
  icon?: string;
  title: string;
  description?: string;
}

defineProps<Props>();
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
    <!-- Icon -->
    <div
      v-if="icon || $slots.icon"
      class="grid h-14 w-14 place-items-center rounded-[--ui-radius-xl] bg-[--ui-color-bg-subtle] ring-1 ring-[--ui-color-border] text-2xl"
    >
      <slot name="icon">{{ icon }}</slot>
    </div>

    <!-- Text -->
    <div class="max-w-xs space-y-1.5">
      <h3 class="text-base font-semibold text-[--ui-color-text-primary]">{{ title }}</h3>
      <p v-if="description" class="text-sm leading-relaxed text-[--ui-color-text-muted]">{{ description }}</p>
    </div>

    <!-- Actions -->
    <div v-if="$slots.actions" class="mt-1 flex flex-wrap items-center justify-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
