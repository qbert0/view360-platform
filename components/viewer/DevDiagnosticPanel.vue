<script setup lang="ts">
/**
 * DevDiagnosticPanel — Bảng chẩn đoán GPU/texture
 *
 * CHỈ hiện trong development (process.dev).
 * Toggle bằng phím ` (backtick) hoặc nút.
 *
 * Không cần import thêm gì ngoài Vue + dữ liệu từ getDiagnostics().
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import type { EngineDiagnostics, QualityMode } from '#view360/composables/viewer/useViewerEngine';
import type { Ktx2BenchmarkResult } from '#view360/core/three/engine/PanoSphere';

const props = defineProps<{
  getDiagnostics: () => EngineDiagnostics | null;
  setQualityMode: (mode: QualityMode) => void;
  currentQuality: QualityMode;
  panoramaUrl: string;
  benchmarkKtx2?: () => Promise<Ktx2BenchmarkResult>;
  embedded?: boolean;
}>();

const emit = defineEmits<{
  qualityChange: [mode: QualityMode];
  compareMode: [mode: 'panorama' | 'flat-100' | 'fit-screen'];
}>();

// ── State ──────────────────────────────────────────────────────
const isOpen   = ref(Boolean(props.embedded));
const diag     = ref<EngineDiagnostics | null>(null);
let   interval: ReturnType<typeof setInterval> | null = null;

const compareMode = ref<'panorama' | 'flat-100' | 'fit-screen'>('panorama');
const ktxBenchmark = ref<Ktx2BenchmarkResult | null>(null);
const ktxBenchmarkError = ref('');
const isBenchmarkingKtx = ref(false);

async function runKtxBenchmark() {
  if (!props.benchmarkKtx2 || isBenchmarkingKtx.value) return;
  isBenchmarkingKtx.value = true;
  ktxBenchmark.value = null;
  ktxBenchmarkError.value = '';
  try {
    ktxBenchmark.value = await props.benchmarkKtx2();
  } catch (error) {
    ktxBenchmarkError.value = error instanceof Error ? error.message : 'Không thể benchmark KTX2.';
  } finally {
    isBenchmarkingKtx.value = false;
  }
}

// ── Auto-refresh diagnostics every 500ms while open ────────────
function refresh() {
  if (!isOpen.value) return;
  diag.value = props.getDiagnostics();
}

function toggle() {
  isOpen.value = !isOpen.value;
  if (isOpen.value) diag.value = props.getDiagnostics();
}

onMounted(() => {
  interval = setInterval(refresh, 500);
  if (!props.embedded) window.addEventListener('keydown', onKey);
  if (props.embedded) diag.value = props.getDiagnostics();
});
onBeforeUnmount(() => {
  if (interval) clearInterval(interval);
  if (!props.embedded) window.removeEventListener('keydown', onKey);
});

function onKey(e: KeyboardEvent) {
  if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
  if (e.key === '`') toggle();
}

// ── Computed warnings ──────────────────────────────────────────
const warnings = computed<string[]>(() => {
  const d = diag.value;
  if (!d) return [];
  const w: string[] = [];
  if (d.isCapped)           w.push(`⚠ GPU thu ảnh ${d.srcWidth}×${d.srcHeight} xuống ${d.gpuWidth}×${d.gpuHeight} (maxTextureSize: ${d.maxTexSize})`);
  if (d.dpr < 1.5)          w.push(`⚠ DPR thấp (${d.dpr}) — màn hình nét hơn nếu tăng quality`);
  if (d.pixelDensity < 0.9) w.push(`⚠ Pixel density ${d.pixelDensity} — renderer đang upscale (ảnh nguồn không đủ nét)`);
  if (d.pixelDensity > 4)   w.push(`ℹ Pixel density ${d.pixelDensity} — ảnh nguồn thừa chi tiết ở zoom này`);
  if (d.srcWidth < 4096)    w.push(`⚠ Ảnh nguồn ${d.srcWidth}px — khuyến nghị tối thiểu 5760px`);
  return w;
});

const densityLabel = computed(() => {
  const d = diag.value?.pixelDensity ?? 0;
  if (d < 0.9) return { text: 'Upscaling ↓ mờ', cls: 'warn-red' };
  if (d < 1.5) return { text: 'Vừa đủ', cls: 'warn-yellow' };
  return { text: 'Thừa chi tiết ✓', cls: 'ok' };
});

// ── Quality mode ───────────────────────────────────────────────
const QUALITY_MODES: { id: QualityMode; label: string; desc: string }[] = [
  { id: 'performance', label: 'Perf',     desc: 'DPR ≤ 1' },
  { id: 'balanced',   label: 'Balanced',  desc: 'DPR ≤ 1.5' },
  { id: 'quality',    label: 'Quality',   desc: 'DPR ≤ 2' },
  { id: 'native',     label: 'Native',    desc: 'DPR gốc' },
];

function setQuality(mode: QualityMode) {
  props.setQualityMode(mode);
  emit('qualityChange', mode);
}

function setCompare(mode: 'panorama' | 'flat-100' | 'fit-screen') {
  compareMode.value = mode;
  emit('compareMode', mode);
}
</script>

<template>
  <!-- Toggle button (always visible in dev) -->
  <button
    v-if="!embedded"
    id="dev-diag-toggle"
    class="diag-toggle"
    :class="{ 'is-open': isOpen }"
    :title="isOpen ? 'Đóng bảng chẩn đoán (`)' : 'Mở bảng chẩn đoán GPU (`)'"
    @click="toggle"
    aria-label="Toggle diagnostic panel"
  >
    <span aria-hidden="true">🔬</span>
  </button>

  <!-- Panel -->
  <Transition name="diag-slide">
    <div
      v-if="isOpen"
      class="diag-panel"
      :class="{ 'is-embedded': embedded }"
      role="region"
      aria-label="Bảng chẩn đoán GPU"
    >
      <div class="diag-header">
        <span class="diag-title">🔬 GPU Diagnostics</span>
        <span class="diag-env">DEV</span>
      </div>

      <!-- Warnings -->
      <div v-if="warnings.length" class="diag-warnings">
        <p v-for="w in warnings" :key="w" class="warn-item">{{ w }}</p>
      </div>
      <div v-else class="diag-ok">✓ Không có cảnh báo</div>

      <!-- Metrics grid -->
      <div v-if="diag" class="diag-grid">
        <!-- Texture source -->
        <div class="diag-section-title">Ảnh nguồn</div>
        <div class="diag-row">
          <span>Kích thước gốc</span>
          <span :class="diag.srcWidth >= 5760 ? 'ok' : 'warn-yellow'">
            {{ diag.srcWidth }}×{{ diag.srcHeight }}
          </span>
        </div>
        <div class="diag-row">
          <span>GPU max texture</span>
          <span :class="diag.maxTexSize >= 8192 ? 'ok' : 'warn-yellow'">
            {{ diag.maxTexSize }}px
          </span>
        </div>
        <div class="diag-row">
          <span>Kích thước trên GPU</span>
          <span :class="diag.isCapped ? 'warn-red' : 'ok'">
            {{ diag.gpuWidth }}×{{ diag.gpuHeight }}
            {{ diag.isCapped ? '(bị cắt!)' : '' }}
          </span>
        </div>
        <div class="diag-row">
          <span>Định dạng</span>
          <span>{{ diag.textureFormat.toUpperCase() }}{{ diag.gpuCompressed ? ' · GPU compressed' : '' }}</span>
        </div>
        <div class="diag-row">
          <span>Load gần nhất</span>
          <span>{{ diag.textureLoadMs.toFixed(0) }} ms</span>
        </div>
        <div class="diag-row">
          <span>Multi-resolution</span>
          <span :class="diag.tilingEnabled ? 'ok' : ''">
            {{ diag.tilingEnabled ? `Level ${diag.tileLevel} · ${diag.loadedTiles} tile (${diag.pendingTiles} đang tải)` : 'Tắt' }}
          </span>
        </div>
        <div v-if="diag.tilingEnabled" class="diag-row">
          <span>Tile queue/decode</span>
          <span>{{ diag.queuedTiles }} / {{ diag.decodedTiles }}</span>
        </div>
        <div v-if="diag.tilingEnabled" class="diag-row">
          <span>Tile cache</span>
          <span>{{ (diag.tileCacheBytes / 1048576).toFixed(1) }} / {{ (diag.tileCacheBudgetBytes / 1048576).toFixed(0) }} MB</span>
        </div>

        <!-- Canvas -->
        <div class="diag-section-title">Canvas / Renderer</div>
        <div class="diag-row">
          <span>Canvas CSS</span>
          <span>{{ diag.canvasCssW }}×{{ diag.canvasCssH }}</span>
        </div>
        <div class="diag-row">
          <span>Framebuffer (GL)</span>
          <span>{{ diag.canvasGlW }}×{{ diag.canvasGlH }}</span>
        </div>
        <div class="diag-row">
          <span>DPR hiện tại</span>
          <span :class="diag.dpr >= 1.5 ? 'ok' : 'warn-yellow'">
            {{ diag.dpr.toFixed(2) }}
          </span>
        </div>
        <div class="diag-row">
          <span>DPR thiết bị</span>
          <span>{{ diag.deviceDpr.toFixed(2) }}</span>
        </div>

        <!-- Quality -->
        <div class="diag-section-title">Chất lượng hình ảnh</div>
        <div class="diag-row">
          <span>FOV</span>
          <span>{{ diag.fov.toFixed(1) }}°</span>
        </div>
        <div class="diag-row">
          <span>Pixel density</span>
          <span :class="densityLabel.cls">
            {{ diag.pixelDensity }} — {{ densityLabel.text }}
          </span>
        </div>

        <!-- GPU info -->
        <div class="diag-section-title">GPU</div>
        <div class="diag-row diag-row--wrap">
          <span>Renderer</span>
          <span class="diag-gpu-name">{{ diag.renderer || '—' }}</span>
        </div>
      </div>

      <div v-else class="diag-empty">Engine chưa sẵn sàng</div>

      <template v-if="benchmarkKtx2">
        <div class="diag-section-title" style="margin-top:10px">KTX2 A/B benchmark</div>
        <button class="quality-btn ktx-benchmark-btn" :disabled="isBenchmarkingKtx" @click="runKtxBenchmark">
          {{ isBenchmarkingKtx ? 'Đang tải và đo…' : 'Đo WebP ↔ KTX2' }}
        </button>
        <div v-if="ktxBenchmark" class="diag-warnings ktx-result">
          <p>WebP: {{ ktxBenchmark.bitmap.durationMs.toFixed(0) }} ms · {{ (ktxBenchmark.bitmap.transferBytes / 1048576).toFixed(2) }} MB</p>
          <p>KTX2: {{ ktxBenchmark.ktx2.durationMs.toFixed(0) }} ms · {{ (ktxBenchmark.ktx2.transferBytes / 1048576).toFixed(2) }} MB</p>
          <p :class="ktxBenchmark.recommended ? 'ok' : 'warn-yellow'">{{ ktxBenchmark.reason }}</p>
        </div>
        <p v-if="ktxBenchmarkError" class="warn-item warn-red">{{ ktxBenchmarkError }}</p>
      </template>

      <!-- Quality mode selector -->
      <div class="diag-section-title" style="margin-top:10px">Quality Mode</div>
      <div class="quality-row">
        <button
          v-for="q in QUALITY_MODES"
          :key="q.id"
          class="quality-btn"
          :class="{ 'is-active': currentQuality === q.id }"
          :title="q.desc"
          @click="setQuality(q.id)"
        >{{ q.label }}</button>
      </div>

      <!-- Image comparison mode -->
      <div class="diag-section-title" style="margin-top:10px">So sánh ảnh</div>
      <div class="quality-row">
        <button
          class="quality-btn" :class="{ 'is-active': compareMode === 'panorama' }"
          @click="setCompare('panorama')"
        >360°</button>
        <button
          class="quality-btn" :class="{ 'is-active': compareMode === 'flat-100' }"
          @click="setCompare('flat-100')"
        >Phẳng 100%</button>
        <button
          class="quality-btn" :class="{ 'is-active': compareMode === 'fit-screen' }"
          @click="setCompare('fit-screen')"
        >Vừa màn hình</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ── Toggle button ─────────────────────────────────────────────────── */
.diag-toggle {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 999;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(8,8,16,0.7);
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  transition: background 0.15s, border-color 0.15s;
}
.diag-toggle:hover, .diag-toggle.is-open {
  background: rgba(30,30,50,0.9);
  border-color: rgba(100,180,255,0.35);
}

/* ── Panel ─────────────────────────────────────────────────────────── */
.diag-panel {
  position: absolute;
  top: 54px;
  right: 14px;
  z-index: 998;
  width: 300px;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  background: rgba(6,6,12,0.95);
  border: 1px solid rgba(100,180,255,0.18);
  border-radius: 12px;
  padding: 12px;
  font-size: 11px;
  font-family: 'Outfit', monospace;
  color: rgba(255,255,255,0.75);
  backdrop-filter: blur(16px);
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
}

.diag-panel.is-embedded {
  position: relative;
  inset: auto;
  z-index: auto;
  width: 100%;
  max-height: none;
  overflow: visible;
  border-color: rgba(100,180,255,0.14);
  background: rgba(255,255,255,0.025);
  box-shadow: none;
  backdrop-filter: none;
}

.diag-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.diag-title { font-weight: 700; font-size: 12px; color: #fff; }
.diag-env {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: #4fa8d5;
  background: rgba(79,168,213,0.15);
  border: 1px solid rgba(79,168,213,0.3);
  padding: 2px 6px;
  border-radius: 4px;
}

/* ── Warnings ──────────────────────────────────────────────────────── */
.diag-warnings {
  background: rgba(200,80,60,0.1);
  border: 1px solid rgba(200,80,60,0.3);
  border-radius: 6px;
  padding: 6px 8px;
  margin-bottom: 8px;
}
.warn-item { margin: 2px 0; line-height: 1.5; }
.diag-ok {
  font-size: 11px;
  color: #6dba8a;
  margin-bottom: 8px;
  font-weight: 600;
}

/* ── Grid ──────────────────────────────────────────────────────────── */
.diag-grid { display: flex; flex-direction: column; gap: 2px; }

.diag-section-title {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.3);
  text-transform: uppercase;
  margin: 8px 0 4px;
}

.diag-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.diag-row--wrap { align-items: flex-start; }
.diag-gpu-name {
  font-size: 9.5px;
  text-align: right;
  color: rgba(255,255,255,0.5);
  max-width: 160px;
  word-break: break-word;
}

/* ── Status colours ────────────────────────────────────────────────── */
.ok        { color: #6dba8a; font-weight: 600; }
.warn-yellow { color: #e0c060; font-weight: 600; }
.warn-red  { color: #e06060; font-weight: 600; }

.diag-empty { color: rgba(255,255,255,0.3); font-size: 11px; margin: 8px 0; }

/* ── Quality buttons ───────────────────────────────────────────────── */
.quality-row {
  display: flex;
  gap: 4px;
}
.quality-btn {
  flex: 1;
  padding: 5px 4px;
  border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.55);
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  font-family: 'Outfit', monospace;
}
.quality-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
.quality-btn.is-active {
  background: rgba(79,168,213,0.2);
  border-color: rgba(79,168,213,0.5);
  color: #4fa8d5;
}

/* ── Slide transition ──────────────────────────────────────────────── */
.diag-slide-enter-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.diag-slide-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.diag-slide-enter-from, .diag-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}
</style>
