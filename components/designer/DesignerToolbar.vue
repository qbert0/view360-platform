<script setup lang="ts">
/**
 * DesignerToolbar — Thanh công cụ chính của trang Designer
 *
 * Hiển thị: nút đặt hotspot theo loại, nút snapshot, trạng thái.
 */
import type { PlacementMode } from '#view360/composables/designer/useDesignerEngine';

const props = defineProps<{
  placementMode: PlacementMode;
  isLoading: boolean;
}>();

const emit = defineEmits<{
  startPlacement: [mode: PlacementMode];
  cancelPlacement: [];
  snapshot: [];
}>();

const TOOLS: { mode: PlacementMode; label: string; icon: string; color: string }[] = [
  { mode: 'navigation', label: 'Điều hướng', icon: '↑', color: '#1d6fa8' },
  { mode: 'info',       label: 'Thông tin',  icon: 'i', color: '#b85c2e' },
  { mode: 'audio',      label: 'Âm thanh',   icon: '♪', color: '#2e7d52' },
  { mode: 'ai-chat',    label: 'AI Chat',     icon: '✦', color: '#6b3fa0' },
];
</script>

<template>
  <div class="designer-toolbar" role="toolbar" aria-label="Công cụ thiết kế">
    <!-- Placement tools -->
    <div class="toolbar-section">
      <span class="toolbar-label">Thêm hotspot</span>
      <div class="toolbar-tools">
        <button
          v-for="tool in TOOLS"
          :key="tool.mode"
          class="tool-btn"
          :class="{ 'is-active': placementMode === tool.mode }"
          :style="{ '--tool-color': tool.color }"
          :aria-pressed="placementMode === tool.mode"
          :disabled="isLoading"
          :title="tool.label"
          @click="
            placementMode === tool.mode
              ? emit('cancelPlacement')
              : emit('startPlacement', tool.mode)
          "
        >
          <span class="tool-icon" aria-hidden="true">{{ tool.icon }}</span>
          <span class="tool-label">{{ tool.label }}</span>
        </button>
      </div>
    </div>

    <div class="toolbar-divider" aria-hidden="true" />

    <!-- Utilities -->
    <div class="toolbar-section">
      <span class="toolbar-label">Tiện ích</span>
      <div class="toolbar-tools">
        <button
          class="tool-btn util-btn"
          :disabled="isLoading"
          title="Chụp ảnh màn hình"
          @click="emit('snapshot')"
        >
          <span class="tool-icon" aria-hidden="true">📷</span>
          <span class="tool-label">Chụp</span>
        </button>
      </div>
    </div>

    <!-- Placement cancel hint -->
    <Transition name="hint-fade">
      <div
        v-if="placementMode !== 'none'"
        class="placement-cancel-hint"
      >
        <span>Nhấn vào canvas để đặt</span>
        <button
          class="cancel-btn"
          @click="emit('cancelPlacement')"
        >Huỷ</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.designer-toolbar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 12px;
  background: rgba(8, 8, 12, 0.9);
  border-right: 1px solid rgba(255, 255, 255, 0.07);
  height: 100%;
  width: 120px;
  flex-shrink: 0;
}

.toolbar-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.toolbar-label {
  font-size: 9px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0 4px;
}

.toolbar-tools {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ── Tool button ───────────────────────────────────────────── */
.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.18s ease;
  width: 100%;
}

.tool-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.tool-btn.is-active {
  background: color-mix(in srgb, var(--tool-color) 18%, transparent);
  border-color: color-mix(in srgb, var(--tool-color) 50%, transparent);
  color: #fff;
  box-shadow: 0 0 12px color-mix(in srgb, var(--tool-color) 30%, transparent);
}

.tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.tool-icon {
  font-size: 18px;
  line-height: 1;
  font-style: normal;
}

.tool-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-family: 'Be Vietnam Pro', sans-serif;
}

/* ── Divider ───────────────────────────────────────────────── */
.toolbar-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.07);
  margin: 0 4px;
}

/* ── Cancel hint ───────────────────────────────────────────── */
.placement-cancel-hint {
  margin-top: auto;
  padding: 10px 8px;
  background: rgba(79, 168, 213, 0.1);
  border: 1px solid rgba(79, 168, 213, 0.25);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
  font-family: 'Be Vietnam Pro', sans-serif;
}

.cancel-btn {
  padding: 5px 12px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.cancel-btn:hover { background: rgba(255, 255, 255, 0.14); }

.hint-fade-enter-active,
.hint-fade-leave-active { transition: opacity 0.2s ease; }
.hint-fade-enter-from,
.hint-fade-leave-to { opacity: 0; }
</style>
