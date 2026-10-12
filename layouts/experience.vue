<script setup lang="ts">
/**
 * layouts/experience.vue
 * ────────────────────────────────────────────────────────────────────
 * Viewer layout — toàn màn hình nền tối, không có chrome.
 * Docs: "vùng viewer có nền tối; experience.vue — Trải nghiệm toàn màn hình"
 * ────────────────────────────────────────────────────────────────────
 */
</script>

<template>
  <!-- Fullscreen dark wrapper — no header, no footer -->
  <div class="h-[100dvh] w-screen overflow-hidden bg-ink">
    <slot />
  </div>
</template>
