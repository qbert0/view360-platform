<script setup lang="ts">
/**
 * ViewerHUD — Heads-up display overlay cho viewer
 *
 * Hiển thị lỗi và hiệu ứng chuyển cảnh.
 * KHÔNG chứa engine logic — nhận data qua props.
 */
defineProps<{
  isTransitioning: boolean;
  errorMessage: string;
}>();
</script>

<template>
  <!-- Error Overlay -->
  <Transition name="hud-fade">
    <div
      v-if="errorMessage"
      class="hud-overlay hud-error"
      role="alert"
    >
      <div class="hud-error-inner">
        <span class="hud-error-icon" aria-hidden="true">⚠</span>
        <p class="hud-error-title">Không thể tải panorama</p>
        <p class="hud-error-msg">{{ errorMessage }}</p>
      </div>
    </div>
  </Transition>

  <!-- Transition flash (subtle vignette while switching scenes) -->
  <Transition name="hud-fade">
    <div v-if="isTransitioning" class="hud-transition-vignette" aria-hidden="true" />
  </Transition>
</template>

<style scoped>
/* ── Base overlays ─────────────────────────────────────────── */
.hud-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  pointer-events: none;
}

/* ── Error ─────────────────────────────────────────────────── */
.hud-error {
  background: rgba(8, 8, 12, 0.9);
  backdrop-filter: blur(8px);
}

.hud-error-inner {
  text-align: center;
  max-width: 340px;
  padding: 0 24px;
}

.hud-error-icon {
  font-size: 28px;
  color: #e05252;
  display: block;
  margin-bottom: 10px;
}

.hud-error-title {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 6px;
}

.hud-error-msg {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.6;
  margin: 0;
}

/* ── Vignette during transition ────────────────────────────── */
.hud-transition-vignette {
  position: absolute;
  inset: 0;
  z-index: 15;
  background: radial-gradient(
    ellipse at center,
    transparent 40%,
    rgba(0, 0, 0, 0.35) 100%
  );
  pointer-events: none;
}

/* ── Transitions ───────────────────────────────────────────── */
.hud-fade-enter-active,
.hud-fade-leave-active {
  transition: opacity 0.3s ease;
}
.hud-fade-enter-from,
.hud-fade-leave-to {
  opacity: 0;
}

</style>
