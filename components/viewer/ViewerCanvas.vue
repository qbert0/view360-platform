<script setup lang="ts">
/**
 * ViewerCanvas — <canvas> wrapper thuần tuý cho viewer
 *
 * Component này CHỈ mount container element và expose ref ra ngoài.
 * KHÔNG chứa bất kỳ business logic nào — mọi thứ nằm trong useViewerEngine.
 */
defineProps<{
  /** Khi đang loading, cursor bị ẩn để tránh nhấp nháy */
  isLoading?: boolean;
}>();
</script>

<template>
  <div
    class="viewer-canvas-root"
    :class="{ 'is-loading': isLoading }"
  >
    <slot />
  </div>
</template>

<style scoped>
.viewer-canvas-root {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0a0a0a;
}

/* Engine appends its own <canvas> — make it fill */
.viewer-canvas-root :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
  cursor: grab;
}

.viewer-canvas-root :deep(canvas):active {
  cursor: grabbing;
}

.viewer-canvas-root.is-loading :deep(canvas) {
  cursor: wait;
}
</style>
