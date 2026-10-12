<script setup lang="ts">
/**
 * DesignerCanvas — Canvas wrapper cho trang Designer
 *
 * Thêm crosshair overlay khi đang trong placement mode.
 */
import type { PlacementMode } from '#view360/composables/designer/useDesignerEngine';

const props = defineProps<{
  isLoading?: boolean;
  placementMode: PlacementMode;
  cameraYaw: number;
  cameraPitch: number;
}>();

const PLACEMENT_LABELS: Record<string, string> = {
  navigation: 'Nhấp để đặt hotspot Điều hướng',
  info:        'Nhấp để đặt hotspot Thông tin',
  audio:       'Nhấp để đặt hotspot Âm thanh',
  'ai-chat':   'Nhấp để đặt hotspot AI Chat',
};

const yawDeg = computed(() => ((props.cameraYaw * 180) / Math.PI).toFixed(1));
const pitchDeg = computed(() => ((props.cameraPitch * 180) / Math.PI).toFixed(1));
</script>

<script lang="ts">
import { computed } from 'vue';
</script>

<template>
  <div
    class="designer-canvas-root"
    :class="{
      'is-loading': isLoading,
      'is-placing': placementMode !== 'none',
    }"
  >
    <slot />

    <!-- Crosshair during placement mode -->
    <Transition name="crosshair-fade">
      <div
        v-if="placementMode !== 'none'"
        class="placement-overlay"
        aria-hidden="true"
      >
        <div class="crosshair">
          <span class="crosshair-h" />
          <span class="crosshair-v" />
          <span class="crosshair-center" />
        </div>
        <div class="placement-hint">
          {{ PLACEMENT_LABELS[placementMode] || 'Nhấp để đặt hotspot' }}
        </div>
      </div>
    </Transition>

    <!-- Camera coords HUD (bottom-left) -->
    <div class="camera-coords" aria-label="Tọa độ camera">
      <span>Yaw {{ yawDeg }}°</span>
      <span class="coords-sep">·</span>
      <span>Pitch {{ pitchDeg }}°</span>
    </div>
  </div>
</template>

<style scoped>
.designer-canvas-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #08080c;
}

.designer-canvas-root :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
  cursor: grab;
}
.designer-canvas-root :deep(canvas):active { cursor: grabbing; }
.designer-canvas-root.is-placing :deep(canvas) { cursor: crosshair; }
.designer-canvas-root.is-loading :deep(canvas) { cursor: wait; }

/* ── Placement overlay ─────────────────────────────────────── */
.placement-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.crosshair {
  position: relative;
  width: 48px;
  height: 48px;
}

.crosshair-h,
.crosshair-v {
  position: absolute;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 1px;
}

.crosshair-h {
  top: 50%;
  left: 0;
  right: 0;
  height: 1.5px;
  transform: translateY(-50%);
}

.crosshair-v {
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1.5px;
  transform: translateX(-50%);
}

.crosshair-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4fa8d5;
  box-shadow: 0 0 10px rgba(79, 168, 213, 0.9);
}

.placement-hint {
  margin-top: 14px;
  padding: 6px 14px;
  background: rgba(8, 8, 12, 0.85);
  border: 1px solid rgba(79, 168, 213, 0.4);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: #4fa8d5;
  backdrop-filter: blur(8px);
  font-family: 'Be Vietnam Pro', sans-serif;
}

/* ── Camera coords ─────────────────────────────────────────── */
.camera-coords {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: rgba(8, 8, 12, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  font-family: 'Outfit', monospace;
  pointer-events: none;
  letter-spacing: 0.03em;
}

.coords-sep { color: rgba(255, 255, 255, 0.2); }

/* ── Transition ────────────────────────────────────────────── */
.crosshair-fade-enter-active,
.crosshair-fade-leave-active {
  transition: opacity 0.2s ease;
}
.crosshair-fade-enter-from,
.crosshair-fade-leave-to {
  opacity: 0;
}
</style>
