<script setup lang="ts">
/**
 * UiKbd — Astryx-style keyboard shortcut badge.
 * https://astryx.atmeta.com/components/Kbd
 */
</script>

<template>
  <kbd
    class="
      inline-flex items-center justify-center
      min-w-[1.5rem] h-6 px-1.5
      rounded-[--ui-radius-xs]
      bg-[--ui-color-bg-subtle]
      ring-1 ring-[--ui-color-border] ring-inset
      shadow-[0_1px_0_0_var(--ui-color-border-strong)]
      text-[11px] font-medium font-[--ui-font-mono] text-[--ui-color-text-secondary]
      leading-none select-none
    "
  >
    <slot />
  </kbd>
</template>
