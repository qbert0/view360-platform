<script setup lang="ts">
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { EquirectangularAdapter, Viewer, events } from '@photo-sphere-viewer/core';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { PlaceScene } from '#view360/types/place';

const props = defineProps<{ scene: PlaceScene }>();
const emit = defineEmits<{
  hotspot: [id: string];
  navigate: [sceneId: string];
}>();

const container = ref<HTMLElement | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');
let viewer: Viewer | null = null;

/**
 * Nav hotspot: forward arrow button + hover tooltip showing destination name.
 * `destTitle` is shown in the pill below the button, and in a larger tooltip on hover.
 */
const navMarkerHtml = (destTitle: string) => `
  <button
    class="nav-hotspot-btn"
    aria-label="Đến: ${destTitle}"
    style="position:relative;width:54px;height:54px;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;padding:0;"
  >
    <!-- Circle button -->
    <div style="
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: rgba(31, 111, 139, 0.88);
      border: 2.5px solid rgba(255,255,255,0.8);
      box-shadow: 0 4px 24px rgba(31,111,139,0.6), 0 0 0 6px rgba(31,111,139,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(6px);
    ">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <!-- Up arrow (walk forward) -->
        <path d="M12 4 L12 18" stroke="white" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M6 11 L12 5 L18 11" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        <!-- Foot dots -->
        <circle cx="9" cy="20.5" r="1.6" fill="rgba(255,255,255,0.65)"/>
        <circle cx="15" cy="20.5" r="1.6" fill="rgba(255,255,255,0.65)"/>
      </svg>
    </div>

    <!-- Label pill below -->
    <span style="
      position: absolute;
      top: calc(100% + 5px);
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      font-weight: 700;
      color: #fff;
      background: rgba(15,15,15,0.7);
      padding: 3px 9px;
      border-radius: 20px;
      white-space: nowrap;
      backdrop-filter: blur(6px);
      letter-spacing: 0.04em;
      max-width: 130px;
      overflow: hidden;
      text-overflow: ellipsis;
      border: 1px solid rgba(255,255,255,0.1);
      pointer-events: none;
    ">${destTitle}</span>
  </button>
`;

const markersForScene = (scene: PlaceScene) =>
  scene.hotspots.map((h) => ({
    id: h.id,
    data: { targetSceneId: h.targetSceneId },
    position: { yaw: h.yaw, pitch: h.pitch },
    html: navMarkerHtml(h.label),
    anchor: 'center center',
    tooltip: undefined,
  }));

const initViewer = async () => {
  await nextTick();
  const el = container.value ?? document.getElementById('psv-viewer');
  if (!el) {
    errorMessage.value = 'Viewer container not found.';
    isLoading.value = false;
    return;
  }
  try {
    viewer = new Viewer({
      container: el,
      panorama: props.scene.panorama,
      adapter: [EquirectangularAdapter, { useXmpData: false }],
      caption: props.scene.title,
      defaultYaw: props.scene.initialYaw,
      defaultPitch: props.scene.initialPitch,
      touchmoveTwoFingers: false,
      mousewheelCtrlKey: false,
      navbar: ['zoom', 'move', 'caption', 'fullscreen'],
      plugins: [[MarkersPlugin, { markers: markersForScene(props.scene) }]],
    });
    viewer.addEventListener(events.PanoramaLoadedEvent.type, () => { isLoading.value = false; });
    viewer.addEventListener(events.PanoramaErrorEvent.type, ({ error }) => {
      isLoading.value = false;
      errorMessage.value = error.message || 'Could not load panorama.';
    });
    viewer.getPlugin<MarkersPlugin>(MarkersPlugin)
      .addEventListener('select-marker', ({ marker }) => {
        if (marker.data?.targetSceneId) {
          emit('navigate', marker.data.targetSceneId);
        } else {
          emit('hotspot', marker.id);
        }
      });
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Could not start viewer.';
    isLoading.value = false;
  }
};

const switchScene = async (scene: PlaceScene) => {
  if (!viewer) return;
  isLoading.value = true;
  // transition: false — instant cut, no fade/zoom animation
  const loaded = await viewer.setPanorama(scene.panorama, {
    caption: scene.title,
    position: { yaw: scene.initialYaw, pitch: scene.initialPitch },
    transition: false,
  });
  if (!loaded) return;
  isLoading.value = false;
  const markers = viewer.getPlugin<MarkersPlugin>(MarkersPlugin);
  markers.clearMarkers();
  markers.setMarkers(markersForScene(scene));
};

onMounted(initViewer);
watch(() => props.scene.id, () => switchScene(props.scene));
onBeforeUnmount(() => { viewer?.destroy(); viewer = null; });
</script>

<template>
  <div class="relative h-[calc(62vh-52px)] w-full overflow-hidden bg-ink lg:h-[calc(100vh-52px)]">
    <div id="psv-viewer" ref="container" class="h-full w-full" />
    <div
      v-if="isLoading || errorMessage"
      class="pointer-events-none absolute inset-0 grid place-items-center bg-ink/80 px-6 text-center text-white backdrop-blur-sm"
    >
      <div>
        <div v-if="!errorMessage" class="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-river" />
        <p class="text-sm font-semibold">{{ errorMessage || 'Đang tải panorama...' }}</p>
        <p v-if="errorMessage" class="mt-2 max-w-md text-xs leading-5 text-white/70">{{ errorMessage }}</p>
      </div>
    </div>
  </div>
</template>
