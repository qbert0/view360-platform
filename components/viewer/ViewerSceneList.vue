<script setup lang="ts">
/**
 * ViewerSceneList — Danh sách cảnh trong sidebar viewer
 *
 * Thuần presentational: nhận scenes + currentScene, emit navigate.
 */
import type { TourScene } from '#view360/types/tour';

const props = defineProps<{
  scenes: TourScene[];
  currentScene: TourScene | null;
  isTransitioning: boolean;
}>();

const emit = defineEmits<{
  navigate: [scene: TourScene];
}>();
</script>

<template>
  <div class="scene-list" role="list" aria-label="Danh sách cảnh">
    <button
      v-for="scene in scenes"
      :key="scene.id"
      class="scene-item"
      :class="{
        'is-active': currentScene?.id === scene.id,
        'is-disabled': isTransitioning,
      }"
      :aria-current="currentScene?.id === scene.id ? 'true' : undefined"
      :disabled="isTransitioning"
      role="listitem"
      @click="emit('navigate', scene)"
    >
      <div class="scene-thumb-wrap">
        <img
          v-if="scene.thumbnail"
          :src="scene.thumbnail"
          :alt="scene.title"
          class="scene-thumb"
          loading="lazy"
        />
        <div v-else class="scene-thumb-placeholder" aria-hidden="true">
          <span>360°</span>
        </div>
        <div class="scene-thumb-overlay" aria-hidden="true" />
      </div>

      <div class="scene-info">
        <span class="scene-title">{{ scene.title }}</span>
        <span v-if="scene.subtitle" class="scene-sub">{{ scene.subtitle }}</span>
      </div>

      <!-- Active indicator -->
      <span
        v-if="currentScene?.id === scene.id"
        class="scene-active-dot"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<style scoped>
.scene-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
}

.scene-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: rgba(255, 255, 255, 0.7);
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  position: relative;
  width: 100%;
}

.scene-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.scene-item.is-active {
  background: rgba(79, 168, 213, 0.12);
  border-color: rgba(79, 168, 213, 0.3);
  color: #fff;
}

.scene-item.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Thumbnail ─────────────────────────────────────────────── */
.scene-thumb-wrap {
  position: relative;
  width: 52px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
}

.scene-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.scene-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.3);
  letter-spacing: 0.05em;
}

.scene-thumb-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.15);
}

/* ── Text ──────────────────────────────────────────────────── */
.scene-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.scene-title {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'Be Vietnam Pro', sans-serif;
}

.scene-sub {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Active dot ────────────────────────────────────────────── */
.scene-active-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4fa8d5;
  flex-shrink: 0;
  box-shadow: 0 0 8px rgba(79, 168, 213, 0.8);
}
</style>
