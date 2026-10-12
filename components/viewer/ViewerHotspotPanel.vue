<script setup lang="ts">
/**
 * Panel hiện khi người xem nhấn vào điểm thông tin, video, ảnh 3D hoặc âm thanh.
 *
 * Thuần presentational: nhận marker data, emit close.
 */
import type { TourMarker, InfoMarker, AudioMarker, AIChatMarker, VideoMarker, Model3DMarker } from '#view360/types/tour';

const props = defineProps<{
  marker: TourMarker | null;
}>();

const emit = defineEmits<{
  close: [];
  audioPlay: [src: string];
}>();

const isInfo = (m: TourMarker): m is InfoMarker => m.plugin === 'info';
const isAudio = (m: TourMarker): m is AudioMarker => m.plugin === 'audio';
const isAiChat = (m: TourMarker): m is AIChatMarker => m.plugin === 'ai-chat';
const isVideo = (m: TourMarker): m is VideoMarker => m.plugin === 'video';
const isModel3D = (m: TourMarker): m is Model3DMarker => m.plugin === 'model3d';
const isDirectVideo = (src: string) => /\.(mp4|webm|ogg)(\?.*)?$/i.test(src);
function videoEmbedUrl(src: string) {
  const youtube = src.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^?&/]+)/);
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`;
  const vimeo = src.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return src;
}
</script>

<template>
  <Transition name="panel-slide">
    <div
      v-if="marker"
      class="hotspot-panel"
      role="dialog"
      :aria-label="marker.label"
    >
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-icon" :class="`icon-${marker.plugin}`" aria-hidden="true">
          <span v-if="isInfo(marker)">i</span>
          <span v-else-if="isAudio(marker)">♪</span>
          <span v-else-if="isAiChat(marker)">✦</span>
          <span v-else-if="isVideo(marker)">▶</span>
          <span v-else-if="isModel3D(marker)">◇</span>
        </div>
        <div class="panel-title-group">
          <h3 class="panel-title">{{ marker.label }}</h3>
          <span class="panel-type">
            {{ marker.plugin === 'info' ? 'Thông tin'
               : marker.plugin === 'audio' ? 'Âm thanh'
               : marker.plugin === 'video' ? 'Video'
               : marker.plugin === 'model3d' ? 'Ảnh 3D vật thể'
               : 'AI Chat' }}
          </span>
        </div>
        <button
          class="panel-close"
          aria-label="Đóng panel"
          @click="emit('close')"
        >✕</button>
      </div>

      <!-- Body -->
      <div class="panel-body">
        <!-- Info content -->
        <p v-if="isInfo(marker)" class="panel-content">
          {{ marker.content }}
        </p>

        <div v-else-if="isVideo(marker)" class="panel-media">
          <video v-if="isDirectVideo(marker.src)" :src="marker.src" controls playsinline />
          <iframe v-else-if="marker.src" :src="videoEmbedUrl(marker.src)" title="Video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen />
          <p v-else class="panel-empty">Video chưa được cấu hình.</p>
        </div>

        <div v-else-if="isModel3D(marker)" class="panel-model">
          <img v-if="marker.image" :src="marker.image" :alt="marker.label">
          <p v-else class="panel-empty">Ảnh vật thể chưa được thêm.</p>
          <p v-if="marker.content" class="panel-content">{{ marker.content }}</p>
        </div>

        <!-- Audio player -->
        <div v-else-if="isAudio(marker)" class="panel-audio">
          <button
            class="audio-play-btn"
            aria-label="Phát âm thanh"
            @click="emit('audioPlay', marker.src)"
          >
            ▶ Phát âm thanh
          </button>
        </div>

        <!-- AI Chat placeholder -->
        <div v-else-if="isAiChat(marker)" class="panel-ai">
          <p class="panel-ai-hint">AI Chat đang được phát triển.</p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.hotspot-panel {
  position: absolute;
  bottom: 24px;
  right: 24px;
  z-index: 30;
  width: 300px;
  max-width: calc(100vw - 48px);
  background: rgba(10, 10, 16, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  backdrop-filter: blur(16px);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

/* ── Header ────────────────────────────────────────────────── */
.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.panel-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 16px;
  color: #fff;
  flex-shrink: 0;
}

.icon-info    { background: rgba(184, 92, 46, 0.85); }
.icon-audio   { background: rgba(46, 125, 82, 0.85); }
.icon-ai-chat, .icon-model3d { background: rgba(107, 63, 160, 0.85); }
.icon-video { background: rgba(220, 38, 38, 0.88); }

.panel-title-group {
  flex: 1;
  min-width: 0;
}

.panel-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'Be Vietnam Pro', sans-serif;
}

.panel-type {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 500;
}

.panel-close {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  transition: color 0.15s;
}

.panel-close:hover { color: #fff; }

/* ── Body ──────────────────────────────────────────────────── */
.panel-body {
  padding: 14px 16px;
}

.panel-content {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.65;
  margin: 0;
  font-family: 'Be Vietnam Pro', sans-serif;
}
.panel-media { aspect-ratio:16/9; background:#000; border-radius:8px; overflow:hidden; }
.panel-media video, .panel-media iframe { width:100%; height:100%; border:0; display:block; }
.panel-model { display:flex; flex-direction:column; gap:12px; }
.panel-model img { width:100%; max-height:55vh; object-fit:contain; border-radius:8px; background:#050505; }
.panel-empty { margin:0; color:rgba(255,255,255,.48); font-size:12px; }

.audio-play-btn {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(46, 125, 82, 0.4);
  background: rgba(46, 125, 82, 0.15);
  color: #7fd6a8;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s;
}

.audio-play-btn:hover {
  background: rgba(46, 125, 82, 0.28);
}

.panel-ai-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  margin: 8px 0;
}

/* ── Transition ────────────────────────────────────────────── */
.panel-slide-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.panel-slide-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.97);
}
</style>
