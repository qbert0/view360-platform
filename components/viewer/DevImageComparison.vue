<script setup lang="ts">
/**
 * DevImageComparison — Xem ảnh panorama ở chế độ phẳng
 *
 * Hai chế độ:
 *   flat-100   → ảnh ở 100% kích thước, scroll để xem chi tiết
 *   fit-screen → ảnh thu vừa màn hình (object-fit: contain)
 *
 * Mục đích: đối chiếu độ nét ảnh nguồn vs panorama renderer.
 *   - Nếu ảnh phẳng cũng mờ → file nguồn kém
 *   - Nếu ảnh phẳng nét mà panorama mờ → lỗi renderer / texture sampling
 */
defineProps<{
  url: string;
  mode: 'flat-100' | 'fit-screen';
}>();

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Transition name="compare-fade">
    <div
      v-if="url"
      class="compare-overlay"
      role="dialog"
      aria-label="So sánh ảnh gốc"
    >
      <!-- Header bar -->
      <div class="compare-bar">
        <span class="compare-label">
          {{ mode === 'flat-100' ? '🔍 Ảnh phẳng 100% — cuộn để xem chi tiết' : '🖼 Ảnh vừa màn hình' }}
        </span>
        <div class="compare-hint">
          Nét ở đây nhưng mờ trong 360° → lỗi renderer | Mờ ở cả hai → file nguồn kém
        </div>
        <button
          class="compare-close"
          aria-label="Trở lại panorama 360°"
          @click="emit('close')"
        >← Panorama 360°</button>
      </div>

      <!-- Image viewer -->
      <div
        class="compare-viewport"
        :class="mode === 'flat-100' ? 'mode-scroll' : 'mode-fit'"
      >
        <img
          :src="url"
          :alt="'Ảnh gốc: ' + url"
          class="compare-img"
          :class="mode === 'flat-100' ? 'img-100' : 'img-fit'"
          draggable="false"
        />
      </div>

      <!-- Resolution badge -->
      <div class="compare-badge">
        <span>{{ url.split('/').pop() }}</span>
        <span class="badge-sep">·</span>
        <span>{{ mode === 'flat-100' ? '100% kích thước' : 'Vừa màn hình' }}</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.compare-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  background: #080810;
  display: flex;
  flex-direction: column;
}

/* ── Header bar ─────────────────────────────────────────────── */
.compare-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(6,6,14,0.95);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-wrap: wrap;
}

.compare-label {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  font-family: 'Be Vietnam Pro', sans-serif;
}

.compare-hint {
  font-size: 10px;
  color: rgba(255,255,255,0.4);
  flex: 1;
  min-width: 200px;
  font-family: 'Be Vietnam Pro', sans-serif;
}

.compare-close {
  padding: 6px 14px;
  border-radius: 7px;
  border: 1px solid rgba(79,168,213,0.35);
  background: rgba(79,168,213,0.12);
  color: #4fa8d5;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
  font-family: 'Be Vietnam Pro', sans-serif;
}
.compare-close:hover { background: rgba(79,168,213,0.22); }

/* ── Viewport ───────────────────────────────────────────────── */
.compare-viewport {
  flex: 1;
  min-height: 0;
}

.mode-scroll {
  overflow: auto;
  cursor: grab;
  display: block;
}
.mode-scroll:active { cursor: grabbing; }

.mode-fit {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 16px;
}

/* ── Image ──────────────────────────────────────────────────── */
.img-100 {
  display: block;
  /* Show at actual source resolution — no scaling */
  width: auto;
  height: auto;
  max-width: none;
  max-height: none;
  image-rendering: auto;
}

.img-fit {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  image-rendering: auto;
}

/* ── Badge ──────────────────────────────────────────────────── */
.compare-badge {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  background: rgba(6,6,14,0.95);
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 10px;
  color: rgba(255,255,255,0.35);
  font-family: 'Outfit', monospace;
}
.badge-sep { color: rgba(255,255,255,0.15); }

/* ── Transition ─────────────────────────────────────────────── */
.compare-fade-enter-active { transition: opacity 0.2s ease; }
.compare-fade-leave-active { transition: opacity 0.18s ease; }
.compare-fade-enter-from, .compare-fade-leave-to { opacity: 0; }
</style>
