<script setup lang="ts">
/**
 * pages/experience/[tourId].vue
 * ──────────────────────────────────────────────────────────────────────────────
 * Route: /experience/:tourId
 * Immersive 360° Viewer page — Three.js core engine via useViewerEngine bridge.
 * ──────────────────────────────────────────────────────────────────────────────
 */
import type { TourConfig, TourScene } from '#view360/types/tour';
import { useRuntimeStore } from '#view360/stores/runtime';
import { useViewerEngine } from '#view360/composables/viewer/useViewerEngine';
import DevDiagnosticPanel from '#view360/components/viewer/DevDiagnosticPanel.vue';
import DevImageComparison from '#view360/components/viewer/DevImageComparison.vue';
import ViewerHUD from '#view360/components/viewer/ViewerHUD.vue';
import ViewerCornerControls from '#view360/components/viewer/ViewerCornerControls.vue';
import ViewerTopbar from '#view360/components/viewer/ViewerTopbar.vue';

definePageMeta({ layout: 'experience', ssr: false });

const route  = useRoute();
const tourId = computed(() => route.params.tourId as string);
const isDev = import.meta.dev;

const sidePanelClass = 'viewer-side-panel absolute right-4 top-[76px] z-[25] flex max-h-[calc(100vh-180px)] w-[360px] max-w-[calc(100vw-32px)] translate-x-[calc(100%+24px)] flex-col overflow-hidden rounded-2xl border border-white/20 bg-black/80 opacity-0 shadow-2xl backdrop-blur-[20px] pointer-events-none transition-[transform,opacity] duration-[350ms] ease-[cubic-bezier(0.16,1,0.3,1)] max-sm:inset-x-2 max-sm:bottom-auto max-sm:top-[calc(60px+env(safe-area-inset-top,0px))] max-sm:max-h-[calc(100dvh-76px-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] max-sm:w-auto max-sm:max-w-none max-sm:translate-x-0 max-sm:-translate-y-3 max-sm:rounded-[14px]';
const panelHeadClass = 'flex items-center justify-between gap-3 border-b border-white/[.08] px-[18px] py-4';
const panelBodyClass = 'overflow-y-auto p-[18px] text-[13px] leading-[1.65] text-white/70 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-[3px] [&::-webkit-scrollbar-thumb]:bg-white/15';
const panelCloseClass = 'grid size-[30px] shrink-0 place-items-center rounded-full bg-white/[.06] text-white/70 transition hover:bg-white/[.14] hover:text-white';
const guideItemClass = 'flex items-start gap-3 rounded-[10px] border border-white/[.06] bg-white/[.035] p-3 transition hover:border-white/10 hover:bg-white/[.06]';
const guideIconClass = 'grid size-9 shrink-0 place-items-center rounded-md bg-[#1f6f8b]/15 text-lg';
const guideTitleClass = 'mb-[3px] text-xs font-semibold text-white';
const guideDescClass = 'text-[11.5px] leading-normal text-white/40';

// ── Fetch tour data ───────────────────────────────────────────────────────────
const { data, pending, error } = await useFetch<{ item: TourConfig }>(
  computed(() => `/api/tours/${tourId.value}`),
);

const tour   = computed(() => data.value?.item);
const scenes = computed<TourScene[]>(() => tour.value?.scenes ?? []);

useHead({ title: computed(() => tour.value ? `${tour.value.title} — View360` : 'View360') });

// ── Active scene — local ref ──────────────────────────────────────────────────
const activeSceneId = ref('');
const activeScene   = computed<TourScene | undefined>(
  () => scenes.value.find(s => s.id === activeSceneId.value) ?? scenes.value[0],
);

// Set initial scene after tour loads (or from ?scene= query)
const queryScene = computed(() => route.query.scene as string | undefined);
watch(scenes, (val) => {
  if (!val.length || activeSceneId.value) return;
  const preferred = queryScene.value || tour.value?.initialSceneId;
  const exists    = preferred && val.some(s => s.id === preferred);
  activeSceneId.value = exists ? preferred! : val[0].id;
}, { immediate: true });

// ── Pinia store — for navigation history & back button only ──────────────────
const store = useRuntimeStore();
watch(activeSceneId, (sceneId) => {
  if (sceneId && tour.value) {
    store.navigateTo(sceneId, tour.value.slug);
  }
});
watch(tour, (t) => {
  if (t && !store.tour) store.tour = t;
}, { immediate: true });

onBeforeUnmount(() => store.reset());

// ── Three.js Engine Bridge ────────────────────────────────────────────────────
const canvasContainerRef = ref<HTMLElement | null>(null);
const { isTransitioning, errorMessage: engineError,
        currentScene: engineScene, mapAvailable, isMapVisible,
        initEngine, navigateTo, toggleMap,
        getDiagnostics, benchmarkCurrentKtx2, setQualityMode } = useViewerEngine({
  onNavigate: (sceneId, yaw, pitch) => handleNavigate(sceneId, yaw, pitch),
  autorotate: computed(() => tour.value?.autoRotate ?? false).value,
  transition: 'forward',
});

// Mount engine once canvas container is available
watch(canvasContainerRef, async (el) => {
  if (!el || !activeScene.value) return;
  await initEngine(el, activeScene.value, tour.value ?? undefined);
}, { once: true });

// Navigate engine when activeSceneId changes (from UI)
const pendingFlyDirection = ref<{ yaw?: number; pitch?: number } | null>(null);
watch(activeSceneId, async (id) => {
  const scene = scenes.value.find(s => s.id === id);
  if (!scene || !engineScene.value || engineScene.value.id === id) return;
  const direction = pendingFlyDirection.value;
  pendingFlyDirection.value = null;
  await navigateTo(scene, scenes.value, direction?.yaw, direction?.pitch);
});

// ── Dev tools state (chỉ dùng trong development) ───────────────────────────
const devQualityMode = ref<import('#view360/composables/viewer/useViewerEngine').QualityMode>('quality');
const devCompareMode = ref<'panorama' | 'flat-100' | 'fit-screen'>('panorama');
const devPanoUrl    = computed(() => engineScene.value?.panorama ?? '');

function handleDevQualityChange(mode: typeof devQualityMode.value) {
  devQualityMode.value = mode;
  setQualityMode(mode);
}
function handleDevCompareMode(mode: typeof devCompareMode.value) {
  devCompareMode.value = mode;
}

// ── UI State ──────────────────────────────────────────────────────────────────
const isImmersive = ref(false);
const showHelpPanel = ref(false);
const showInfoPanel = ref(false);
const infoPanelTitle = ref('');
const infoPanelContent = ref('');

type InputProfile = 'desktop' | 'touch' | 'hybrid';
interface GuideItem {
  icon: string;
  title: string;
  description: string;
}

const inputProfile = ref<InputProfile>('desktop');
let inputMediaQueries: MediaQueryList[] = [];
const inputProfileLabel = computed(() => ({
  desktop: 'Chuột và bàn phím',
  touch: 'Màn hình cảm ứng',
  hybrid: 'Cảm ứng và chuột',
})[inputProfile.value]);

const guideItems = computed<GuideItem[]>(() => {
  const touch = inputProfile.value !== 'desktop';
  const hybrid = inputProfile.value === 'hybrid';
  const interactionItems: GuideItem[] = touch
    ? [
        {
          icon: '↔',
          title: 'Thay đổi góc nhìn',
          description: hybrid
            ? 'Vuốt trực tiếp trên ảnh hoặc kéo bằng chuột để quan sát toàn bộ không gian.'
            : 'Vuốt một ngón tay trên ảnh để quan sát toàn bộ không gian 360°.',
        },
        {
          icon: '⌁',
          title: 'Điều chỉnh tầm nhìn',
          description: 'Chụm hoặc mở hai ngón tay để thu nhỏ và phóng to góc nhìn.',
        },
      ]
    : [
        {
          icon: '↔',
          title: 'Thay đổi góc nhìn',
          description: 'Nhấn giữ chuột trái và kéo trên ảnh để quan sát toàn bộ không gian 360°.',
        },
        {
          icon: '⌁',
          title: 'Điều chỉnh tầm nhìn',
          description: 'Sử dụng con lăn chuột để thu nhỏ hoặc phóng to góc nhìn.',
        },
      ];

  return [
    ...interactionItems,
    {
      icon: '↑',
      title: 'Di chuyển giữa các cảnh',
      description: 'Chọn marker mũi tên màu trắng để tiếp tục đến không gian được ghi trên nhãn.',
    },
    {
      icon: 'i',
      title: 'Khám phá nội dung',
      description: 'Chọn marker thông tin để mở thuyết minh, âm thanh hoặc nội dung đa phương tiện tại vị trí đó.',
    },
    ...(touch ? [] : [{
      icon: '⌨',
      title: 'Điều khiển nhanh',
      description: 'F: toàn màn hình · H: ẩn giao diện · ← →: chuyển cảnh · Esc: đóng bảng đang mở.',
    }]),
  ];
});

function updateInputProfile(): void {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasTouch = navigator.maxTouchPoints > 0;
  inputProfile.value = hasTouch && fine ? 'hybrid' : coarse || hasTouch ? 'touch' : 'desktop';
}

const sceneIndex = computed(() =>
  scenes.value.findIndex(s => s.id === activeSceneId.value) + 1,
);

// ── Navigation handlers ───────────────────────────────────────────────────────
function handleNavigate(sceneId: string, yaw?: number, pitch?: number) {
  if (sceneId === activeSceneId.value) return;
  pendingFlyDirection.value = { yaw, pitch };
  activeSceneId.value = sceneId;
}

function goToPrevScene() {
  if (!scenes.value.length) return;
  const currIdx = scenes.value.findIndex(s => s.id === activeSceneId.value);
  const prevIdx = (currIdx - 1 + scenes.value.length) % scenes.value.length;
  handleNavigate(scenes.value[prevIdx].id);
}

function goToNextScene() {
  if (!scenes.value.length) return;
  const currIdx = scenes.value.findIndex(s => s.id === activeSceneId.value);
  const nextIdx = (currIdx + 1) % scenes.value.length;
  handleNavigate(scenes.value[nextIdx].id);
}

// ── Panel Toggles ─────────────────────────────────────────────────────────────
function toggleHelpPanel() {
  showInfoPanel.value = false;
  showHelpPanel.value = !showHelpPanel.value;
}

function toggleInfoPanel() {
  showHelpPanel.value = false;
  showInfoPanel.value = !showInfoPanel.value;
}

function handleInfoOpen(content: string, label: string) {
  infoPanelTitle.value = label;
  infoPanelContent.value = content;
  showHelpPanel.value = false;
  showInfoPanel.value = true;
}

async function shareTour() {
  const url = window.location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title: tour.value?.title ?? 'Tour 360°', url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  } catch {
    // Người dùng có thể chủ động đóng hộp thoại chia sẻ; không cần thông báo nổi.
  }
}

function toggleImmersive() {
  isImmersive.value = !isImmersive.value;
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────────
function handleKeyDown(e: KeyboardEvent) {
  if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

  switch (e.key) {
    case 'Escape':
      if (isImmersive.value) {
        isImmersive.value = false;
      } else {
        showHelpPanel.value = false;
        showInfoPanel.value = false;
      }
      break;
    case 'ArrowRight':
      e.preventDefault();
      goToNextScene();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      goToPrevScene();
      break;
    case 'f':
    case 'F':
      toggleImmersive();
      break;
    case 'h':
    case 'H':
      isImmersive.value = !isImmersive.value;
      break;
    case '?':
      toggleHelpPanel();
      break;
  }
}

onMounted(() => {
  updateInputProfile();
  inputMediaQueries = [
    window.matchMedia('(pointer: coarse)'),
    window.matchMedia('(hover: hover) and (pointer: fine)'),
  ];
  inputMediaQueries.forEach(query => query.addEventListener('change', updateInputProfile));
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('resize', updateInputProfile, { passive: true });
});

onBeforeUnmount(() => {
  inputMediaQueries.forEach(query => query.removeEventListener('change', updateInputProfile));
  inputMediaQueries = [];
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('resize', updateInputProfile);
});
</script>

<template>
  <div class="fixed inset-0 flex h-dvh w-screen flex-col overflow-hidden bg-ink">
    <!-- Loading -->
    <div v-if="pending" class="grid h-screen w-full place-items-center bg-ink">
      <div class="flex flex-col items-center gap-5">
        <div class="relative">
          <UiSpinner size="lg" color="primary" />
          <div class="absolute inset-0 animate-ping rounded-full bg-river/15" />
        </div>
        <div class="text-center">
          <p class="text-sm font-semibold text-white">Đang tải trải nghiệm 360°</p>
          <p class="mt-1 text-xs text-white/40">{{ tourId }}</p>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error || !tour || !activeScene"
      class="grid h-screen w-full place-items-center bg-ink px-6">
      <UiEmptyState icon="🌐" title="Không thể tải tour"
        :description="`Tour '${tourId}' không tồn tại hoặc lỗi kết nối.`">
        <template #actions>
          <NuxtLink to="/"><UiButton variant="primary">Về trang chủ</UiButton></NuxtLink>
        </template>
      </UiEmptyState>
    </div>

    <!-- Main 360 Full-Bleed Viewer -->
    <template v-else>
      <!-- ═══ 360 PANORAMA — Three.js Engine ═══ -->
      <!-- Image comparison overlay (dev) -->
      <DevImageComparison
        v-if="isDev && devCompareMode !== 'panorama'"
        :url="devPanoUrl"
        :mode="devCompareMode as 'flat-100' | 'fit-screen'"
        @close="devCompareMode = 'panorama'"
      />

      <!-- Canvas (always rendered, hidden when compare overlay is active) -->
      <div
        ref="canvasContainerRef"
        class="absolute inset-0 h-full w-full"
        :class="{ invisible: devCompareMode !== 'panorama' }"
        aria-label="Panorama 360°"
      />

      <!-- Engine HUD (loading / error / scene badge) -->
      <ViewerHUD
        :is-transitioning="isTransitioning"
        :error-message="engineError"
      />

      <ViewerTopbar
        :scene-index="sceneIndex"
        :scene-count="scenes.length"
        :title="activeScene.title"
        :subtitle="activeScene.subtitle"
        :hidden="isImmersive"
        @help="toggleHelpPanel"
        @immersive="toggleImmersive"
      />

      <!-- ═══ SIDE PANEL: HELP ═══ -->
      <aside
        :class="[
          sidePanelClass,
          showHelpPanel && !isImmersive && '!pointer-events-auto !translate-x-0 !translate-y-0 !opacity-100',
          isImmersive && '!-translate-y-3',
        ]"
        :aria-hidden="!showHelpPanel"
      >
        <div :class="panelHeadClass">
          <div class="flex min-w-0 items-center gap-2.5">
            <div class="grid size-8 shrink-0 place-items-center rounded-full bg-[#1f6f8b]/25 text-[#7ec8e3]">
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div>
              <div class="text-sm font-semibold text-white">Hướng dẫn sử dụng</div>
              <div class="mt-0.5 text-[11px] uppercase tracking-[.1em] text-white/40">{{ inputProfileLabel }}</div>
            </div>
          </div>
          <button type="button" :class="panelCloseClass" aria-label="Đóng" @click="showHelpPanel = false">
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M18 6 6 18"/>
              <path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
        <div :class="panelBodyClass">
          <ul class="grid list-none gap-3">
            <li v-for="item in guideItems" :key="item.title" :class="guideItemClass">
              <div :class="[guideIconClass, 'font-semibold text-[#7ec8e3]']">{{ item.icon }}</div>
              <div>
                <div :class="guideTitleClass">{{ item.title }}</div>
                <div :class="guideDescClass">{{ item.description }}</div>
              </div>
            </li>
          </ul>

          <details v-if="isDev" class="mt-4 rounded-[10px] border border-white/[.06] bg-white/[.025]">
            <summary class="cursor-pointer select-none px-3 py-2.5 text-xs font-semibold text-white/55 transition hover:text-white/80">
              Thông tin kỹ thuật
            </summary>
            <div class="border-t border-white/[.06] p-2">
              <DevDiagnosticPanel
                embedded
                :get-diagnostics="getDiagnostics"
                :set-quality-mode="setQualityMode"
                :current-quality="devQualityMode"
                :panorama-url="devPanoUrl"
                :benchmark-ktx2="benchmarkCurrentKtx2"
                @quality-change="handleDevQualityChange"
                @compare-mode="handleDevCompareMode"
              />
            </div>
          </details>
        </div>
      </aside>

      <!-- ═══ SIDE PANEL: INFO ═══ -->
      <aside
        :class="[
          sidePanelClass,
          showInfoPanel && !isImmersive && '!pointer-events-auto !translate-x-0 !translate-y-0 !opacity-100',
          isImmersive && '!-translate-y-3',
        ]"
        :aria-hidden="!showInfoPanel"
      >
        <div :class="panelHeadClass">
          <div class="flex min-w-0 items-center gap-2.5">
            <div class="grid size-8 shrink-0 place-items-center rounded-full bg-[#a8583f]/25 text-[#e0a58b]">
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                <circle cx="12" cy="7" r="1.8" fill="currentColor" stroke="none"/>
                <path d="M12 11 L12 18"/>
              </svg>
            </div>
            <div>
              <div class="text-sm font-semibold text-white">{{ infoPanelTitle || 'Thông tin địa điểm' }}</div>
              <div class="mt-0.5 text-[11px] uppercase tracking-[.1em] text-white/40">Chi tiết cảnh quan</div>
            </div>
          </div>
          <button type="button" :class="panelCloseClass" aria-label="Đóng" @click="showInfoPanel = false">
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M18 6 6 18"/>
              <path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
        <div :class="panelBodyClass">
          <div v-if="infoPanelContent" class="space-y-3" v-html="infoPanelContent"></div>
          <div v-else class="space-y-3">
            <p><strong>{{ activeScene.title }}</strong></p>
            <p v-if="activeScene.subtitle">{{ activeScene.subtitle }}</p>
            <p v-if="tour.summary">{{ tour.summary }}</p>
          </div>
        </div>
      </aside>

      <ViewerCornerControls
        :map-available="mapAvailable"
        :map-visible="isMapVisible"
        logo-size="small"
        :hidden="isImmersive"
        @toggle-map="toggleMap"
        @toggle-info="toggleInfoPanel"
        @share="shareTour"
      />

      <!-- ═══ IMMERSIVE EXIT ═══ -->
      <button
        v-if="isImmersive"
        type="button"
        class="fixed right-4 top-4 z-30 grid size-10 place-items-center rounded-[10px] border border-white/15 bg-black/55 text-white backdrop-blur-xl transition hover:border-white/25 hover:bg-black/80"
        title="Thoát chế độ toàn cảnh (Esc)"
        @click="isImmersive = false"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
        </svg>
      </button>

    </template>
  </div>
</template>

<style scoped>
@media (max-width: 900px) and (orientation: landscape) {
  .viewer-side-panel {
    max-height: calc(100dvh - 80px - env(safe-area-inset-top, 0px)) !important;
  }
}
</style>
