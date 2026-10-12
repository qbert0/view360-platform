<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useDesignerEngine } from '#view360/composables/designer/useDesignerEngine';
import { resolveMarkerView } from '#view360/types/tour';
import type { AreaHighlight, TourConfig, TourScene, TourMarker, MarkerMobileView, NavigationMarker, InfoMarker, VideoMarker, Model3DMarker, PanelMarkerData, PanelBlock } from '#view360/types/tour';

definePageMeta({ layout: false, ssr: false });

const route = useRoute();
const router = useRouter();
const studioName = useRuntimeConfig().public.siteId === 'duc-thuy' ? 'Dục Thúy Studio' : 'Sông Vân Studio';
const slug = route.params.slug as string;
const initialSceneIdParam = route.params.sceneId as string;

const { show: showToast } = useToast();

// ── Fetch tour data ───────────────────────────────────────────────────────────
const { data } = await useFetch<{ item: TourConfig }>(`/api/tours/${slug}`);

// Deep copy tour into reactive local state
const tour = ref<TourConfig | null>(null);

// Undo/Redo history stack
const historyStack = ref<TourConfig[]>([]);
const historyIndex = ref<number>(-1);
let isHistoryAction = false;

function pushHistorySnapshot() {
  if (isHistoryAction || !tour.value) return;
  const currentSnap = JSON.stringify(tour.value);
  const lastSnap = historyIndex.value >= 0 ? JSON.stringify(historyStack.value[historyIndex.value]) : '';
  if (currentSnap === lastSnap) return;

  historyStack.value = historyStack.value.slice(0, historyIndex.value + 1);
  historyStack.value.push(JSON.parse(currentSnap));
  historyIndex.value = historyStack.value.length - 1;
}

function initTourState() {
  if (data.value?.item) {
    const editableTour = JSON.parse(JSON.stringify(data.value.item)) as TourConfig;
    editableTour.scenes.forEach((scene) => {
      scene.markers = scene.markers.map((marker): TourMarker => {
        if (marker.plugin === 'panel') {
          const legacySpeechBlocks = (marker.contents as Array<PanelBlock | { id: string; type: 'text-to-speech'; content: string; lang?: string; rate?: number; pitch?: number }>);
          marker.contents = legacySpeechBlocks.reduce<PanelBlock[]>((blocks, block) => {
            if (block.type !== 'text-to-speech') {
              blocks.push(block);
              return blocks;
            }
            const previousText = [...blocks].reverse().find((item) => item.type === 'text' && item.content === block.content);
            if (previousText?.type === 'text') {
              previousText.presentation = 'text-and-audio';
              previousText.speech = { lang: block.lang, rate: block.rate, pitch: block.pitch };
            } else {
              blocks.push({ id: block.id, type: 'text', content: block.content, presentation: 'audio-only', speech: { lang: block.lang, rate: block.rate, pitch: block.pitch } });
            }
            return blocks;
          }, []);
          return marker;
        }
        if (marker.plugin === 'info') {
          return { id: marker.id, plugin: 'panel', label: marker.label, yaw: marker.yaw, pitch: marker.pitch, mobileView: marker.mobileView, contents: [{ id: `${marker.id}-text`, type: 'text', content: marker.content }] };
        }
        if (marker.plugin === 'audio') {
          return { id: marker.id, plugin: 'panel', label: marker.label, yaw: marker.yaw, pitch: marker.pitch, mobileView: marker.mobileView, contents: [{ id: `${marker.id}-audio`, type: 'audio', src: marker.src }] };
        }
        if (marker.plugin === 'model3d') {
          const contents: PanelBlock[] = [{ id: `${marker.id}-image`, type: 'image3d', image: marker.image, caption: '' }];
          if (marker.content) contents.push({ id: `${marker.id}-text`, type: 'text', content: marker.content });
          return { id: marker.id, plugin: 'panel', label: marker.label, yaw: marker.yaw, pitch: marker.pitch, mobileView: marker.mobileView, contents };
        }
        if (marker.plugin === 'ai-chat') {
          return { id: marker.id, plugin: 'panel', label: marker.label, yaw: marker.yaw, pitch: marker.pitch, mobileView: marker.mobileView, contents: [{ id: `${marker.id}-ai`, type: 'ai-chat', context: marker.context }] };
        }
        return marker;
      });
    });
    tour.value = editableTour;
    historyStack.value = [JSON.parse(JSON.stringify(editableTour))];
    historyIndex.value = 0;
  }
}
initTourState();
// NOTE: Do NOT watch data.value for changes — that would re-init state
// every time saveToServer() gets the server response, resetting the UI.

function undo() {
  if (historyIndex.value > 0) {
    isHistoryAction = true;
    historyIndex.value--;
    tour.value = JSON.parse(JSON.stringify(historyStack.value[historyIndex.value]));
    isDirty.value = true;
    goToScene(Math.min(currentSceneIdx.value, (tour.value?.scenes.length ?? 1) - 1));
    isHistoryAction = false;
    showToast({ message: 'Đã hoàn tác (Undo)', variant: 'default' });
  }
}

function redo() {
  if (historyIndex.value < historyStack.value.length - 1) {
    isHistoryAction = true;
    historyIndex.value++;
    tour.value = JSON.parse(JSON.stringify(historyStack.value[historyIndex.value]));
    isDirty.value = true;
    goToScene(Math.min(currentSceneIdx.value, (tour.value?.scenes.length ?? 1) - 1));
    isHistoryAction = false;
    showToast({ message: 'Đã làm lại (Redo)', variant: 'default' });
  }
}

const canUndo = computed(() => historyIndex.value > 0);
const canRedo = computed(() => historyIndex.value < historyStack.value.length - 1);

// Active scene index
const currentSceneIdx = ref<number>(0);

// Synchronize initial scene index based on route param or initialSceneId
watch(
  () => tour.value,
  (t) => {
    if (!t || !t.scenes?.length) return;
    const foundIdx = t.scenes.findIndex((s) => s.id === initialSceneIdParam);
    if (foundIdx !== -1) {
      currentSceneIdx.value = foundIdx;
    } else if (t.initialSceneId) {
      const startIdx = t.scenes.findIndex((s) => s.id === t.initialSceneId);
      if (startIdx !== -1) currentSceneIdx.value = startIdx;
    }
  },
  { immediate: true },
);

const currentScene = computed<TourScene | null>(() => {
  if (!tour.value || !tour.value.scenes.length) return null;
  return tour.value.scenes[currentSceneIdx.value] ?? tour.value.scenes[0];
});

// Inspector tabs & state
type InspectorTab = 'scene' | 'hotspots' | 'settings';
const currentTab = ref<InspectorTab>('scene');
const editorMode = ref<'panorama' | 'highlight' | 'map'>('panorama');
const editorDevice = ref<'desktop' | 'mobile'>('desktop');
const mobileDevicePresets = [
  { id: 'standard', label: 'Tiêu chuẩn', width: 430, height: 932 },
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667 },
  { id: 'iphone-xr', label: 'iPhone XR', width: 414, height: 896 },
  { id: 'iphone-12-pro', label: 'iPhone 12 Pro', width: 390, height: 844 },
  { id: 'iphone-14-pro-max', label: 'iPhone 14 Pro Max', width: 430, height: 932 },
  { id: 'pixel-7', label: 'Pixel 7', width: 412, height: 915 },
  { id: 'galaxy-s8-plus', label: 'Galaxy S8+', width: 360, height: 740 },
  { id: 'galaxy-s20-ultra', label: 'Galaxy S20 Ultra', width: 412, height: 915 },
  { id: 'galaxy-z-fold-5', label: 'Galaxy Z Fold 5', width: 344, height: 882 },
] as const;
const mobileDevicePresetId = ref<(typeof mobileDevicePresets)[number]['id']>('standard');
const activeMobileDevicePreset = computed(() => (
  mobileDevicePresets.find(preset => preset.id === mobileDevicePresetId.value) ?? mobileDevicePresets[0]
));
const mobilePreviewStyle = computed(() => ({
  '--mobile-preview-width': `${activeMobileDevicePreset.value.width}px`,
  '--mobile-preview-height': `${activeMobileDevicePreset.value.height}px`,
  '--mobile-preview-ratio': `${activeMobileDevicePreset.value.width} / ${activeMobileDevicePreset.value.height}`,
}));
const selectedAreaId = ref<string | null>(null);
const selectedArea = computed(() => currentScene.value?.areaHighlights?.find(area => area.id === selectedAreaId.value) ?? null);
const newAreaMode = ref<NonNullable<AreaHighlight['mode']>>('fill-outline');
const newAreaLineWidth = ref(5);

// ── Map editor state ──
const mapEditorCanvas = ref<HTMLCanvasElement | null>(null);
const mapDragNodeId = ref<string | null>(null);
const mapImageUploading = ref(false);
const mapEditorImages = new Map<string, HTMLImageElement>();

function mapEditorContentRect(floor: NonNullable<TourConfig['map']>['floors'][number], w: number, h: number) {
  const padding = 12;
  const image = mapEditorImages.get(floor.id);
  const sourceW = image?.naturalWidth || floor.imageWidth || 1;
  const sourceH = image?.naturalHeight || floor.imageHeight || 1;
  const scale = Math.min((w - padding * 2) / sourceW, (h - padding * 2) / sourceH);
  const width = sourceW * scale;
  const height = sourceH * scale;
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}

function ensureMapEditorImage(floor: NonNullable<TourConfig['map']>['floors'][number]) {
  if (!floor.imageUrl) return undefined;
  const cached = mapEditorImages.get(floor.id);
  if (cached?.dataset.src === floor.imageUrl) return cached;
  const image = new Image();
  image.dataset.src = floor.imageUrl;
  image.onload = () => {
    floor.imageWidth = image.naturalWidth;
    floor.imageHeight = image.naturalHeight;
    drawMapEditor();
  };
  image.src = floor.imageUrl;
  mapEditorImages.set(floor.id, image);
  return image;
}

function ensureMapConfig() {
  if (!tour.value) return;
  if (!tour.value.map) {
    tour.value.map = {
      floors: [{
        id: 'main',
        name: 'Tất cả',
        imageUrl: '',
        imageWidth: 800,
        imageHeight: 600,
        nodes: tour.value.scenes.map((s, i) => ({
          id: s.id,
          name: s.title,
          x: 100 + (i % 5) * 140,
          y: 100 + Math.floor(i / 5) * 120,
          neighbors: [] as string[],
        })),
      }],
      position: 'bottom-left',
      width: 280,
      height: 200,
      showConnections: true,
      clickToNavigate: true,
      showFloorTabs: true,
      autoSwitchFloor: true,
    };
    markDirty();
  }
}

const mapActiveFloorId = ref<string>('');
const mapActiveFloor = computed(() => {
  const floors = tour.value?.map?.floors ?? [];
  return floors.find(f => f.id === mapActiveFloorId.value) ?? floors[0];
});

function drawMapEditor() {
  const canvas = mapEditorCanvas.value;
  if (!canvas || !tour.value?.map) return;
  const floor = mapActiveFloor.value;
  if (!floor) return;

  const rect = canvas.parentElement!.getBoundingClientRect();
  const w = rect.width;
  const h = 340;
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#14151f';
  ctx.fillRect(0, 0, w, h);

  const mapImage = ensureMapEditorImage(floor);
  if (mapImage?.complete && mapImage.naturalWidth > 0) {
    const imageRect = mapEditorContentRect(floor, w, h);
    ctx.globalAlpha = 0.86;
    ctx.drawImage(mapImage, imageRect.x, imageRect.y, imageRect.width, imageRect.height);
    ctx.globalAlpha = 1;
  }

  // Grid
  const spacing = 20;
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (let x = spacing; x < w; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = spacing; y < h; y += spacing) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Dots
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let x = spacing; x < w; x += spacing) {
    for (let y = spacing; y < h; y += spacing) {
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
    }
  }

  const mapRect = mapEditorContentRect(floor, w, h);
  const padX = mapRect.x, padY = mapRect.y;
  const aW = mapRect.width, aH = mapRect.height;

  // Connections
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1.5;
  for (const node of floor.nodes) {
    const sx = padX + (node.x / floor.imageWidth) * aW;
    const sy = padY + (node.y / floor.imageHeight) * aH;
    for (const nbrId of node.neighbors ?? []) {
      const nbr = floor.nodes.find(n => n.id === nbrId);
      if (!nbr) continue;
      const nx = padX + (nbr.x / floor.imageWidth) * aW;
      const ny = padY + (nbr.y / floor.imageHeight) * aH;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(nx, ny); ctx.stroke();
    }
  }

  // Nodes
  for (const node of floor.nodes) {
    const sx = padX + (node.x / floor.imageWidth) * aW;
    const sy = padY + (node.y / floor.imageHeight) * aH;
    const isCurrent = node.id === currentScene.value?.id;
    const isDragging = node.id === mapDragNodeId.value;
    const r = isCurrent ? 8 : 6;

    if (isCurrent) {
      ctx.save();
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = isDragging ? '#93c5fd' : 'rgba(255,255,255,0.7)';
      ctx.fill();
    }

    // Label
    ctx.font = '500 10px "Be Vietnam Pro", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const label = (node as any).name || node.id;
    ctx.fillText(label.length > 14 ? label.slice(0, 13) + '…' : label, sx, sy + r + 4);
  }
}

function mapEditorPointerDown(e: PointerEvent) {
  const canvas = mapEditorCanvas.value;
  if (!canvas || !mapActiveFloor.value) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const floor = mapActiveFloor.value;
  const w = rect.width, h = 340;
  const mapRect = mapEditorContentRect(floor, w, h);
  const padX = mapRect.x, padY = mapRect.y;
  const aW = mapRect.width, aH = mapRect.height;

  let closest: any = null;
  let minDist = 20;
  for (const node of floor.nodes) {
    const sx = padX + (node.x / floor.imageWidth) * aW;
    const sy = padY + (node.y / floor.imageHeight) * aH;
    const dist = Math.hypot(mx - sx, my - sy);
    if (dist < minDist) { minDist = dist; closest = node; }
  }
  if (closest) {
    mapDragNodeId.value = closest.id;
    canvas.setPointerCapture(e.pointerId);
  } else if (currentScene.value && mx >= padX && mx <= padX + aW && my >= padY && my <= padY + aH) {
    let node = floor.nodes.find(n => n.id === currentScene.value!.id);
    if (!node) {
      node = { id: currentScene.value.id, name: currentScene.value.title, x: 0, y: 0, neighbors: [] };
      floor.nodes.push(node);
    }
    node.x = Math.round(((mx - padX) / aW) * floor.imageWidth);
    node.y = Math.round(((my - padY) / aH) * floor.imageHeight);
    mapDragNodeId.value = node.id;
    canvas.setPointerCapture(e.pointerId);
    markDirty();
    drawMapEditor();
  }
}

function mapEditorPointerMove(e: PointerEvent) {
  if (!mapDragNodeId.value) return;
  const canvas = mapEditorCanvas.value;
  if (!canvas || !mapActiveFloor.value) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const floor = mapActiveFloor.value;
  const w = rect.width, h = 340;
  const mapRect = mapEditorContentRect(floor, w, h);
  const padX = mapRect.x, padY = mapRect.y;
  const aW = mapRect.width, aH = mapRect.height;

  const node = floor.nodes.find(n => n.id === mapDragNodeId.value);
  if (node) {
    node.x = Math.round(Math.max(0, Math.min(floor.imageWidth, ((mx - padX) / aW) * floor.imageWidth)));
    node.y = Math.round(Math.max(0, Math.min(floor.imageHeight, ((my - padY) / aH) * floor.imageHeight)));
    drawMapEditor();
  }
}

function mapEditorPointerUp() {
  if (mapDragNodeId.value) {
    mapDragNodeId.value = null;
    markDirty();
    drawMapEditor();
  }
}

function autoConnectNodes() {
  if (!tour.value?.map) return;
  // Build connections from navigation markers
  for (const floor of tour.value.map.floors) {
    for (const node of floor.nodes) {
      const scene = tour.value.scenes.find(s => s.id === node.id);
      if (!scene) continue;
      const navTargets = scene.markers
        .filter(m => m.plugin === 'navigation')
        .map(m => (m as NavigationMarker).targetScene)
        .filter((t): t is string => !!t && floor.nodes.some(n => n.id === t));
      node.neighbors = [...new Set(navTargets)];
    }
  }
  markDirty();
  drawMapEditor();
}

async function uploadMapFloorImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  const floor = mapActiveFloor.value;
  if (!file || !floor) return;
  mapImageUploading.value = true;
  try {
    const formData = new FormData();
    formData.append('files', file);
    const result = await $fetch<{ ok: boolean; files: Array<{ original: string; width?: number; height?: number }> }>('/api/admin/media', { method: 'POST', body: formData });
    const uploaded = result.files[0];
    if (!uploaded) throw new Error('Máy chủ không trả về ảnh đã tải lên.');
    floor.imageUrl = uploaded.original;
    floor.imageWidth = uploaded.width || floor.imageWidth;
    floor.imageHeight = uploaded.height || floor.imageHeight;
    mapEditorImages.delete(floor.id);
    markDirty();
    drawMapEditor();
    showToast({ message: 'Đã tải ảnh mặt bằng. Bấm lên ảnh để đặt điểm cảnh.', variant: 'success' });
  } catch (error: any) {
    showToast({ message: error?.data?.statusMessage || error?.message || 'Không thể tải ảnh mặt bằng.', variant: 'error' });
  } finally {
    mapImageUploading.value = false;
    input.value = '';
  }
}

watch(editorMode, (mode) => {
  if (mode === 'map') {
    ensureMapConfig();
    if (tour.value?.map?.floors?.[0]) {
      mapActiveFloorId.value = tour.value.map.floors[0].id;
    }
    nextTick(() => drawMapEditor());
  } else if (mode === 'highlight') {
    selectedAreaId.value ??= currentScene.value?.areaHighlights?.[0]?.id ?? null;
    engineSetAreaInteractionMode('rotate');
    nextTick(() => refreshAreaHighlights(currentScene.value?.areaHighlights ?? []));
  } else {
    if (isDrawingArea.value || areaPointTargetId.value) engineCancelAreaDrawing();
    engineSetAreaInteractionMode('rotate');
  }
});

function selectSceneFromGeoMap(sceneId: string) {
  const index = tour.value?.scenes.findIndex(scene => scene.id === sceneId) ?? -1;
  if (index >= 0) goToScene(index);
}

function setSceneGeoCoordinates(payload: { sceneId: string; coordinates: [number, number] }) {
  const scene = tour.value?.scenes.find(item => item.id === payload.sceneId);
  if (!scene) return;
  scene.coordinates = payload.coordinates;
  markDirty();
}

function setCurrentGeoCoordinate(axis: 'lng' | 'lat', rawValue: string) {
  if (!currentScene.value) return;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  const [lng, lat] = currentScene.value.coordinates ?? [108.2022, 16.0544];
  currentScene.value.coordinates = axis === 'lng' ? [value, lat] : [lng, value];
  markDirty();
}

// ── Panorama world alignment ───────────────────────────────────────────────
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

function normalizeRadians(value: number): number {
  const twoPi = Math.PI * 2;
  return ((value + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
}

function setCurrentPanoramaRotation(degrees: number) {
  if (!currentScene.value || !Number.isFinite(degrees)) return;
  currentScene.value.panoramaRotation = normalizeRadians(degrees * DEG_TO_RAD);
  setPanoramaRotation(currentScene.value.panoramaRotation);
  markDirty();
}

watch(mapActiveFloorId, () => nextTick(() => drawMapEditor()));

const selectedHotspotId = ref<string | null>(null);
const selectedHotspot = computed<TourMarker | null>(() => {
  if (!currentScene.value) return null;
  return currentScene.value.markers.find((m) => m.id === selectedHotspotId.value) ?? null;
});

// Real Upload State
const fileInput = ref<HTMLInputElement | null>(null);
const newSceneInput = ref<HTMLInputElement | null>(null);
const modelImageInput = ref<HTMLInputElement | null>(null);
const panelImageInput = ref<HTMLInputElement | null>(null);
const panelImageTargetBlockId = ref<string | null>(null);
const narrationInput = ref<HTMLInputElement | null>(null);
const narrationTargetBlockId = ref<string | null>(null);
const uploadingImage = ref(false);
const addingScene = ref(false);
const sceneQueueCurrent = ref(0);
const sceneQueueTotal = ref(0);
const sceneQueueFileName = ref('');
const sceneQueueWaiting = ref(false);
const uploadingNarration = ref(false);
const uploadingPanelImage = ref(false);
const panoramaPreviewFailed = ref(false);

function triggerImageUpload() {
  fileInput.value?.click();
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (!files || !files.length || !currentScene.value) return;

  const file = files[0];
  const formData = new FormData();
  formData.append('file', file);

  uploadingImage.value = true;
  try {
    const res = await $fetch<{ ok: boolean; files: Array<{ original: string; thumbnail: string; editorPreview: string; previewPanorama: string; viewerPanorama: string; mobilePanorama: string }> }>(
      '/api/admin/media',
      {
        method: 'POST',
        body: formData,
      },
    );

    if (res.ok && res.files?.length) {
      const uploaded = res.files[0];
      currentScene.value.panorama = uploaded.viewerPanorama;
      currentScene.value.previewPanorama = uploaded.previewPanorama;
      currentScene.value.mobilePanorama = uploaded.mobilePanorama;
      currentScene.value.editorPanorama = uploaded.editorPreview;
      panoramaPreviewFailed.value = false;
      if (uploaded.thumbnail) {
        currentScene.value.thumbnail = uploaded.thumbnail;
      }

      // Reload engine with new panorama
      await engineLoadScene(sceneForEditor(currentScene.value));
      markDirty();
      showToast({ message: 'Tải ảnh panorama mới thành công!', variant: 'success' });
    }
  } catch (err: any) {
    const message = err?.data?.statusMessage ?? err?.statusMessage ?? err?.message ?? 'Lỗi khi upload ảnh';
    showToast({ message, variant: 'error' });
  } finally {
    uploadingImage.value = false;
    if (target) target.value = '';
  }
}

async function handleModelImageChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || selectedHotspot.value?.plugin !== 'model3d') return;
  const formData = new FormData();
  formData.append('file', file);
  uploadingImage.value = true;
  try {
    const res = await $fetch<{ ok: boolean; files: Array<{ original: string }> }>('/api/admin/media', {
      method: 'POST', body: formData,
    });
    if (res.ok && res.files?.[0]) {
      (selectedHotspot.value as Model3DMarker).image = res.files[0].original;
      markDirty();
      showToast({ message: 'Đã tải ảnh vật thể lên', variant: 'success' });
    }
  } catch (err: any) {
    showToast({ message: err?.statusMessage ?? 'Không thể tải ảnh vật thể', variant: 'error' });
  } finally {
    uploadingImage.value = false;
    target.value = '';
  }
}

function triggerPanelImageUpload(blockId: string) {
  panelImageTargetBlockId.value = blockId;
  panelImageInput.value?.click();
}

async function handlePanelImageChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  const marker = selectedHotspot.value?.plugin === 'panel' ? selectedHotspot.value as PanelMarkerData : null;
  const block = marker?.contents.find((item) => item.id === panelImageTargetBlockId.value && item.type === 'image');
  if (!file || !block || block.type !== 'image') {
    target.value = '';
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  uploadingPanelImage.value = true;
  try {
    let uploadedUrl = '';
    try {
      const res = await $fetch<{ ok: boolean; file: { url: string } }>('/api/admin/panel-image', {
        method: 'POST', body: formData,
      });
      uploadedUrl = res.ok ? res.file?.url ?? '' : '';
    } catch (error: any) {
      // Nitro may not discover a newly added server route until the current
      // dev process restarts. Keep uploads working through the established
      // media route in that specific case.
      const status = error?.statusCode ?? error?.status ?? error?.response?.status;
      if (status !== 404) throw error;
      const fallback = await $fetch<{ ok: boolean; files: Array<{ original: string }> }>('/api/admin/media', {
        method: 'POST', body: formData,
      });
      uploadedUrl = fallback.ok ? fallback.files?.[0]?.original ?? '' : '';
    }

    if (!uploadedUrl) throw new Error('Máy chủ không trả về đường dẫn ảnh 2D.');
    block.src = uploadedUrl;
    syncMarkersToViewer();
    markDirty();
    showToast({ message: 'Đã tải ảnh 2D lên', variant: 'success' });
  } catch (err: any) {
    showToast({
      message: err?.data?.statusMessage ?? err?.statusMessage ?? err?.message ?? 'Không thể tải ảnh 2D',
      variant: 'error',
    });
  } finally {
    uploadingPanelImage.value = false;
    panelImageTargetBlockId.value = null;
    target.value = '';
  }
}

function triggerNarrationUpload(blockId: string) {
  narrationTargetBlockId.value = blockId;
  narrationInput.value?.click();
}

async function handleNarrationChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  const blockId = narrationTargetBlockId.value;
  const marker = selectedHotspot.value?.plugin === 'panel' ? selectedHotspot.value as PanelMarkerData : null;
  const block = marker?.contents.find((item) => item.id === blockId && item.type === 'text');
  if (!file || !block || block.type !== 'text') {
    target.value = '';
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  uploadingNarration.value = true;
  try {
    const res = await $fetch<{ ok: boolean; file: { url: string } }>('/api/admin/audio', {
      method: 'POST', body: formData,
    });
    if (res.ok && res.file?.url) {
      block.speech = { ...(block.speech ?? {}), src: res.file.url };
      syncMarkersToViewer();
      markDirty();
      showToast({ message: 'Đã gắn bản đọc vào văn bản', variant: 'success' });
    }
  } catch (err: any) {
    showToast({ message: err?.statusMessage ?? 'Không thể tải bản đọc lên', variant: 'error' });
  } finally {
    uploadingNarration.value = false;
    narrationTargetBlockId.value = null;
    target.value = '';
  }
}

function handleThumbnailError(event: Event) {
  const img = event.target as HTMLImageElement;
  // Never fall back to the full panorama here. A list of 5760×2880 images
  // decoded in <img> elements can consume hundreds of MB independently from
  // the WebGL texture used by the editor.
  img.style.visibility = 'hidden';
}

// Editor toolbar state
const isPlacingHotspot = ref(false);
const showHotspotModal = ref(false);
const pendingHotspotCoords = ref<{ yaw: number; pitch: number } | null>(null);

const previewMode = ref(false);
const zoom = ref(100);
const modeTab = ref<'edit' | 'drag'>('edit');
const leftSidebarWidth = ref(320);
const rightSidebarWidth = ref(360);

function startResize(side: 'left' | 'right', event: PointerEvent) {
  const startX = event.clientX;
  const startLeft = leftSidebarWidth.value;
  const startRight = rightSidebarWidth.value;
  const target = event.currentTarget as HTMLElement;
  target.classList.add('dragging');
  target.setPointerCapture?.(event.pointerId);

  const onMove = (moveEvent: PointerEvent) => {
    if (side === 'left') leftSidebarWidth.value = Math.max(240, Math.min(480, startLeft + moveEvent.clientX - startX));
    else rightSidebarWidth.value = Math.max(300, Math.min(520, startRight - moveEvent.clientX + startX));
  };
  const onUp = () => {
    target.classList.remove('dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    localStorage.setItem('sv-sidebar-left', String(leftSidebarWidth.value));
    localStorage.setItem('sv-sidebar-right', String(rightSidebarWidth.value));
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

// Dirty & saving state
const isDirty = ref(false);
const saving = ref(false);

function markDirty() {
  isDirty.value = true;
  pushHistorySnapshot();
}

function markSaved() {
  isDirty.value = false;
}

function setDefaultCameraEnabled(enabled: boolean) {
  if (!currentScene.value) return;
  if (editorDevice.value === 'mobile') {
    const mobile = ensureMobileView();
    mobile.defaultCameraEnabled = enabled;
  } else {
    currentScene.value.defaultCameraEnabled = enabled;
  }
  if (enabled) captureDefaultCamera();
  else markDirty();
}

function ensureMobileView(): NonNullable<TourScene['mobileView']> {
  if (!currentScene.value) return {};
  return (currentScene.value.mobileView ??= {});
}

function captureDefaultCamera() {
  if (!currentScene.value) return;
  if (editorDevice.value === 'mobile') {
    const mobile = ensureMobileView();
    mobile.defaultCameraEnabled = true;
    mobile.initialYaw = cameraYaw.value;
    mobile.initialPitch = cameraPitch.value;
  } else {
    currentScene.value.defaultCameraEnabled = true;
    currentScene.value.initialYaw = cameraYaw.value;
    currentScene.value.initialPitch = cameraPitch.value;
  }
  markDirty();
}

async function saveCurrentCamera() {
  captureDefaultCamera();
  await saveToServer();
}

function setDefaultZoomEnabled(enabled: boolean) {
  if (!currentScene.value) return;
  if (editorDevice.value === 'mobile') {
    const mobile = ensureMobileView();
    mobile.defaultZoomEnabled = enabled;
  } else {
    currentScene.value.defaultZoomEnabled = enabled;
  }
  if (enabled) captureDefaultZoom();
  else markDirty();
}

function captureDefaultZoom() {
  if (!currentScene.value) return;
  // Saving a zoom must also make the scene use it. Previously it was possible
  // to persist initialFov while defaultZoomEnabled stayed false, so the viewer
  // correctly loaded the number but deliberately ignored it.
  if (editorDevice.value === 'mobile') {
    const mobile = ensureMobileView();
    mobile.defaultZoomEnabled = true;
    mobile.initialFov = cameraFov.value;
  } else {
    currentScene.value.defaultZoomEnabled = true;
    currentScene.value.initialFov = cameraFov.value;
  }
  markDirty();
}

async function saveCurrentZoom() {
  captureDefaultZoom();
  await saveToServer();
}

// Engine canvas container
const container = ref<HTMLElement | null>(null);

// Designer engine (replaces PSV)
const {
  isLoading: engineLoading,
  cameraYaw,
  cameraPitch,
  cameraFov,
  interactionMode,
  lastPanoramaRotation,
  isPlacing: engineIsPlacing,
  placementMode,
  lastMarkerMoved,
  lastMarkerClicked,
  lastPlacement,
  isDrawingArea,
  areaInteractionMode,
  areaDraftPoints,
  lastAreaDrawn,
  selectedAreaId: engineSelectedAreaId,
  selectedAreaPoint,
  lastAreaPointMoved,
  lastAreaPointAdded,
  areaPointTargetId,
  initEngine,
  loadScene: engineLoadScene,
  startPlacement: engineStartPlacement,
  cancelPlacement: engineCancelPlacement,
  startAreaDrawing: engineStartAreaDrawing,
  finishAreaDrawing: engineFinishAreaDrawing,
  cancelAreaDrawing: engineCancelAreaDrawing,
  startAreaPointPlacement,
  setAreaInteractionMode: engineSetAreaInteractionMode,
  selectAreaPoint: engineSelectAreaPoint,
  refreshAreaHighlights,
  getCameraAim,
  captureSnapshot,
  refreshMarkers: engineRefreshMarkers,
  setFov,
  setBrightness,
  setHighlightCompression,
  setPanoramaRotation,
  setInteractionMode,
} = useDesignerEngine();

function sceneForEditor(scene: TourScene): TourScene {
  const mobileDevice = editorDevice.value === 'mobile';
  if (!mobileDevice) return scene;
  const mobile = scene.mobileView;
  return {
    ...scene,
    initialYaw: mobile?.initialYaw ?? scene.initialYaw,
    initialPitch: mobile?.initialPitch ?? scene.initialPitch,
    initialFov: mobile?.initialFov ?? scene.initialFov,
    defaultCameraEnabled: mobile?.defaultCameraEnabled ?? scene.defaultCameraEnabled,
    defaultZoomEnabled: mobile?.defaultZoomEnabled ?? scene.defaultZoomEnabled,
    markers: scene.markers.map(marker => resolveMarkerView(marker, true)),
  };
}

function refreshMarkers(scene: TourScene | null | undefined = currentScene.value): void {
  if (scene) engineRefreshMarkers(sceneForEditor(scene));
}

const activeDefaultCameraEnabled = computed(() => {
  const scene = currentScene.value;
  if (!scene) return false;
  return editorDevice.value === 'mobile'
    ? (scene.mobileView?.defaultCameraEnabled ?? scene.defaultCameraEnabled) === true
    : scene.defaultCameraEnabled === true;
});

const activeDefaultZoomEnabled = computed(() => {
  const scene = currentScene.value;
  if (!scene) return false;
  return editorDevice.value === 'mobile'
    ? (scene.mobileView?.defaultZoomEnabled ?? scene.defaultZoomEnabled) === true
    : scene.defaultZoomEnabled === true;
});

const activeInitialYaw = computed(() => editorDevice.value === 'mobile'
  ? (currentScene.value?.mobileView?.initialYaw ?? currentScene.value?.initialYaw ?? 0)
  : (currentScene.value?.initialYaw ?? 0));
const activeInitialPitch = computed(() => editorDevice.value === 'mobile'
  ? (currentScene.value?.mobileView?.initialPitch ?? currentScene.value?.initialPitch ?? 0)
  : (currentScene.value?.initialPitch ?? 0));
const activeInitialFov = computed(() => editorDevice.value === 'mobile'
  ? (currentScene.value?.mobileView?.initialFov ?? currentScene.value?.initialFov ?? 75)
  : (currentScene.value?.initialFov ?? 75));

async function setEditorDevice(device: 'desktop' | 'mobile') {
  if (editorDevice.value === device) return;
  editorDevice.value = device;
  if (currentScene.value) await engineLoadScene(sceneForEditor(currentScene.value));
}

async function clearMobileView() {
  if (!currentScene.value?.mobileView) return;
  delete currentScene.value.mobileView;
  markDirty();
  await engineLoadScene(sceneForEditor(currentScene.value));
}

watch(cameraFov, (fov) => {
  // Keep the toolbar percentage aligned with wheel zoom and restored scene FOV.
  zoom.value = Math.round(50 + ((150 - fov) / 120) * 150);
});

watch(lastPanoramaRotation, (rotation) => {
  if (rotation === null || !currentScene.value) return;
  currentScene.value.panoramaRotation = rotation;
  markDirty();
});

function updateSceneBrightness(event: Event) {
  setSceneBrightness(Number((event.target as HTMLInputElement).value));
}

function setSceneBrightness(value: number) {
  if (!currentScene.value) return;
  currentScene.value.brightness = value;
  setBrightness(value);
  markDirty();
}

function updateSceneHighlightCompression(event: Event) {
  setSceneHighlightCompression(Number((event.target as HTMLInputElement).value));
}

function setSceneHighlightCompression(value: number) {
  if (!currentScene.value) return;
  currentScene.value.highlightCompression = value;
  setHighlightCompression(value);
  markDirty();
}

const lockVideoAspectRatio = ref(true);

type MarkerViewKey = keyof MarkerMobileView;

function effectiveMarker<T extends TourMarker>(marker: T): T {
  return resolveMarkerView(marker, editorDevice.value === 'mobile') as T;
}

function markerViewTarget(marker: TourMarker): TourMarker | MarkerMobileView {
  if (editorDevice.value !== 'mobile') return marker;
  return (marker.mobileView ??= {});
}

function setMarkerViewValue(marker: TourMarker, key: MarkerViewKey, value: number | string): void {
  (markerViewTarget(marker) as Record<string, unknown>)[key] = value;
  refreshMarkers(currentScene.value);
  markDirty();
}

function clearSelectedMarkerMobileView(): void {
  if (!selectedHotspot.value?.mobileView) return;
  delete selectedHotspot.value.mobileView;
  refreshMarkers(currentScene.value);
  markDirty();
}

function updateVideoPanelSize(dimension: 'width' | 'height', rawValue: string | number) {
  if (selectedHotspot.value?.plugin !== 'video' || !currentScene.value) return;
  const marker = selectedHotspot.value as VideoMarker;
  const displayed = effectiveMarker(marker);
  const oldWidth = displayed.width ?? 640;
  const oldHeight = displayed.height ?? 360;
  const aspect = oldWidth / oldHeight || 16 / 9;
  const value = Math.round(Number(rawValue));
  if (!Number.isFinite(value)) return;

  if (dimension === 'width') {
    const width = Math.max(240, Math.min(2560, value));
    setMarkerViewValue(marker, 'width', width);
    if (lockVideoAspectRatio.value) setMarkerViewValue(marker, 'height', Math.round(width / aspect));
  } else {
    const height = Math.max(135, Math.min(1440, value));
    setMarkerViewValue(marker, 'height', height);
    if (lockVideoAspectRatio.value) setMarkerViewValue(marker, 'width', Math.round(height * aspect));
  }
}

function setVideoPanelSize(width: number, height: number) {
  if (selectedHotspot.value?.plugin !== 'video' || !currentScene.value) return;
  const marker = selectedHotspot.value as VideoMarker;
  setMarkerViewValue(marker, 'width', width);
  setMarkerViewValue(marker, 'height', height);
}

function setVideoRotation(axis: 'rotX' | 'rotY' | 'rotZ', degrees: string | number) {
  if (selectedHotspot.value?.plugin !== 'video') return;
  const marker = selectedHotspot.value as VideoMarker;
  setMarkerViewValue(marker, axis, Number(degrees) * Math.PI / 180);
}

function setPlaneMarkerScale(axis: 'scaleX' | 'scaleY', rawValue: string | number) {
  const marker = selectedHotspot.value;
  if (!marker || (marker.plugin !== 'navigation' && marker.plugin !== 'video') || !currentScene.value) return;
  setMarkerViewValue(marker, axis, Math.max(0.1, Math.min(10, Number(rawValue) || 1)));
}

function setNavigationSphereRadius(rawValue: string | number) {
  if (selectedHotspot.value?.plugin !== 'navigation' || !currentScene.value) return;
  setMarkerViewValue(selectedHotspot.value, 'sphereRadius', Math.max(120, Math.min(580, Number(rawValue) || 520)));
}

function navigationIsArrow(marker: NavigationMarker): boolean {
  return !['local', 'drone', 'location-1', 'location-2', 'pin', 'pin-top', 'anchor'].includes(marker.icon ?? 'arrow');
}

function navigationIsLocal(marker: NavigationMarker): boolean {
  return ['local', 'location-1', 'pin'].includes(marker.icon ?? '');
}

function navigationRotationDegrees(marker: NavigationMarker, axis: 'rotX' | 'rotY' | 'rotZ'): number {
  const displayed = effectiveMarker(marker);
  if (axis === 'rotX') return Math.round((displayed.rotX ?? (navigationIsArrow(marker) ? Math.PI / 3 : 0)) * 180 / Math.PI);
  if (axis === 'rotY') return Math.round((displayed.rotY ?? 0) * 180 / Math.PI);
  return Math.round((displayed.rotZ ?? marker.rotation ?? 0) * 180 / Math.PI);
}

function planeMarkerScale(marker: NavigationMarker | VideoMarker, axis: 'scaleX' | 'scaleY'): number {
  const explicit = effectiveMarker(marker)[axis];
  if (explicit !== undefined) return explicit;
  if (marker.plugin === 'navigation' && axis === 'scaleX' && navigationIsArrow(marker)) return 1.6;
  if (marker.plugin === 'navigation' && axis === 'scaleY' && navigationIsLocal(marker)) return 0.8;
  return 1;
}

// ── Hotspot drag-to-reposition ───────────────────────────────────────────────
// Watch lastMarkerMoved (emitted by MarkerPlugin via bus)
watch(lastMarkerMoved, (moved) => {
  if (!moved || !currentScene.value) return;
  const idx = currentScene.value.markers.findIndex((m) => m.id === moved.markerId);
  if (idx === -1) return;
  const marker = currentScene.value.markers[idx]!;
  const target = markerViewTarget(marker);
  target.yaw = moved.yaw;
  target.pitch = moved.pitch;
  markDirty();
});

// Guided mode timer
let guidedTimer: ReturnType<typeof setInterval> | null = null;

// Drag & drop state for scene list reordering
const draggingSceneIdx = ref<number | null>(null);
const dragOverSceneIdx = ref<number | null>(null);

// ── PSV marker HTML helpers ───────────────────────────────────────────────────
const navHtml = (label: string, isSelected: boolean) => `
  <div class="edit-hotspot nav ${isSelected ? 'selected' : ''}">
    <div class="hs-circle">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 4 L12 18"/><path d="M6 11 L12 5 L18 11"/>
      </svg>
    </div>
    <span class="hs-label">${label}</span>
  </div>`;

const infoHtml = (label: string, isSelected: boolean) => `
  <div class="edit-hotspot info ${isSelected ? 'selected' : ''}">
    <div class="hs-circle">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round">
        <circle cx="12" cy="7" r="1.8" fill="white" stroke="none"/>
        <path d="M12 11 L12 18"/>
      </svg>
    </div>
    <span class="hs-label">${label}</span>
  </div>`;

function getMarkerHtml(m: TourMarker) {
  const isSelected = m.id === selectedHotspotId.value;
  return m.plugin === 'navigation' ? navHtml(m.label, isSelected) : infoHtml(m.label, isSelected);
}

// ── Sync markers to engine ───────────────────────────────────────────────────
function syncMarkersToViewer() {
  if (!currentScene.value) return;
  refreshMarkers?.(currentScene.value);
}

watch(
  () => currentScene.value?.markers,
  () => {
    syncMarkersToViewer();
  },
  { deep: true },
);

watch(selectedHotspotId, () => {
  syncMarkersToViewer();
});

// Update panorama if URL changed via text input
async function onPanoramaUrlChange() {
  if (!currentScene.value) return;
  panoramaPreviewFailed.value = false;
  await engineLoadScene(sceneForEditor(currentScene.value));
  markDirty();
}

// ── Init Engine ───────────────────────────────────────────────────────────────
onMounted(async () => {
  leftSidebarWidth.value = Number(localStorage.getItem('sv-sidebar-left')) || 320;
  rightSidebarWidth.value = Number(localStorage.getItem('sv-sidebar-right')) || 360;
  if (!container.value || !currentScene.value) return;

  await initEngine(container.value, sceneForEditor(currentScene.value));

  // Placement click: engine emits a special navigate event with encoded coords
  // (see useDesignerEngine.handlePlacementClick)
  // We intercept it here to open the modal
  // Note: engine.bus is accessible via composable's internal engine ref
});

// Use the exact raycast coordinate clicked on the panorama.
watch(lastPlacement, (placement) => {
  if (placement && isPlacingHotspot.value) {
    pendingHotspotCoords.value = { yaw: placement.yaw, pitch: placement.pitch };
    isPlacingHotspot.value = false;
    showHotspotModal.value = true;
  }
});

// Clicking a marker in the panorama selects it in the inspector. In preview
// mode the same selection is rendered by ViewerHotspotPanel, so info markers
// now have the same visible behaviour as in the public viewer.
watch(lastMarkerClicked, (marker) => {
  if (!marker) return;
  selectedHotspotId.value = marker.id;
  if (!previewMode.value) currentTab.value = 'hotspots';
});

watch(lastAreaDrawn, (area) => {
  if (!area || !currentScene.value) return;
  area.mode = newAreaMode.value;
  area.lineWidth = newAreaLineWidth.value;
  currentScene.value.areaHighlights ??= [];
  currentScene.value.areaHighlights.push(area);
  selectedAreaId.value = area.id;
  refreshAreaHighlights(currentScene.value.areaHighlights);
  markDirty();
  showToast({ message: 'Đã thêm vùng làm nổi bật', variant: 'default' });
});

watch(engineSelectedAreaId, areaId => {
  if (areaId) selectedAreaId.value = areaId;
});

let areaMoveHistoryTimer: ReturnType<typeof setTimeout> | null = null;
watch(lastAreaPointMoved, (payload) => {
  if (!payload) return;
  selectedAreaId.value = payload.areaId;
  isDirty.value = true;
  if (areaMoveHistoryTimer) clearTimeout(areaMoveHistoryTimer);
  areaMoveHistoryTimer = setTimeout(() => markDirty(), 180);
});

watch(lastAreaPointAdded, (payload) => {
  if (!payload || !currentScene.value) return;
  const area = currentScene.value.areaHighlights?.find(item => item.id === payload.areaId);
  if (!area) return;
  area.points.push(payload.point);
  selectedAreaId.value = area.id;
  refreshAreaHighlights(currentScene.value.areaHighlights ?? []);
  engineSelectAreaPoint(area.id, area.points.length - 1);
  markDirty();
});

watch(
  () => currentScene.value?.areaHighlights,
  (areas) => refreshAreaHighlights(areas ?? []),
  { deep: true },
);

// ── Scene Navigation ──────────────────────────────────────────────────────────
async function goToScene(idx: number) {
  if (!tour.value || idx < 0 || idx >= tour.value.scenes.length) return;
  currentSceneIdx.value = idx;
  selectedHotspotId.value = null;
  panoramaPreviewFailed.value = false;

  const targetScene = tour.value.scenes[idx];
  if (targetScene) {
    await engineLoadScene(sceneForEditor(targetScene));
  }
}

// ── Add & Delete Scenes ───────────────────────────────────────────────────────
function addScene() {
  if (!tour.value || addingScene.value) return;
  newSceneInput.value?.click();
}

const SCENE_UPLOAD_PAUSE_MS = 5_000;

function waitBeforeNextScene(): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, SCENE_UPLOAD_PAUSE_MS));
}

async function handleNewSceneImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (!files.length || !tour.value) {
    input.value = '';
    return;
  }

  addingScene.value = true;
  sceneQueueCurrent.value = 0;
  sceneQueueTotal.value = files.length;
  let lastAddedSceneId: string | null = null;
  let successCount = 0;
  const failedFiles: string[] = [];
  try {
    for (const [index, file] of files.entries()) {
      sceneQueueCurrent.value = index + 1;
      sceneQueueFileName.value = file.name;
      sceneQueueWaiting.value = false;
      let addedSceneId: string | null = null;

      try {
        const formData = new FormData();
        formData.append('file', file);
        const upload = await $fetch<{
          ok: boolean;
          files: Array<{ original: string; thumbnail: string; editorPreview: string; previewPanorama: string; viewerPanorama: string; mobilePanorama: string }>;
        }>('/api/admin/media', { method: 'POST', body: formData });
        const media = upload.files?.[0];
        if (!media) throw new Error('API không trả về ảnh panorama đã tải lên.');

        const id = `scene-${Date.now().toString(36)}-${index.toString(36)}`;
        const titleFromFile = file.name.replace(/\.[^.]+$/u, '').replace(/[-_]+/gu, ' ').trim();
        const newScene: TourScene = {
          id,
          title: titleFromFile || 'Cảnh mới',
          subtitle: '',
          panorama: media.viewerPanorama,
          previewPanorama: media.previewPanorama,
          mobilePanorama: media.mobilePanorama,
          thumbnail: media.thumbnail || media.original,
          editorPanorama: media.editorPreview,
          initialYaw: 0,
          initialPitch: 0,
          initialFov: 75,
          defaultCameraEnabled: false,
          defaultZoomEnabled: false,
          panoramaRotation: 0,
          showOnMap: false,
          brightness: 1.25,
          markers: [],
        };
        tour.value.scenes.push(newScene);
        addedSceneId = id;
        currentSceneIdx.value = tour.value.scenes.length - 1;
        await $fetch(`/api/admin/tours/${slug}`, { method: 'POST', body: tour.value });
        lastAddedSceneId = id;
        successCount += 1;
      } catch (error: any) {
        if (addedSceneId && tour.value) {
          const addedIndex = tour.value.scenes.findIndex(scene => scene.id === addedSceneId);
          if (addedIndex !== -1) tour.value.scenes.splice(addedIndex, 1);
        }
        failedFiles.push(file.name);
        const message = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Không thể thêm cảnh';
        showToast({ message: `${file.name}: ${message}`, variant: 'error' });
      }

      if (index < files.length - 1) {
        sceneQueueWaiting.value = true;
        await waitBeforeNextScene();
      }
    }

    if (successCount) {
      pushHistorySnapshot();
      markSaved();
      showToast({
        message: failedFiles.length
          ? `Đã thêm ${successCount}/${files.length} cảnh; ${failedFiles.length} ảnh bị lỗi`
          : `Đã thêm ${successCount} cảnh vào tour`,
        variant: failedFiles.length ? 'warning' : 'success',
      });
      if (lastAddedSceneId) await navigateTo(`/admin/${slug}/${lastAddedSceneId}`);
    }
  } finally {
    addingScene.value = false;
    sceneQueueCurrent.value = 0;
    sceneQueueTotal.value = 0;
    sceneQueueFileName.value = '';
    sceneQueueWaiting.value = false;
    input.value = '';
  }
}

async function deleteCurrentScene() {
  if (!tour.value || !currentScene.value) return;
  if (tour.value.scenes.length <= 1) {
    showToast({ message: 'Không thể xóa cảnh cuối cùng', variant: 'error' });
    return;
  }
  if (!confirm(`Xóa cảnh "${currentScene.value.title}"?`)) return;

  const removedIndex = currentSceneIdx.value;
  const removedScene = JSON.parse(JSON.stringify(currentScene.value)) as TourScene;
  const previousInitialSceneId = tour.value.initialSceneId;
  const [removed] = tour.value.scenes.splice(removedIndex, 1);
  const nextIndex = Math.min(removedIndex, tour.value.scenes.length - 1);
  const nextScene = tour.value.scenes[nextIndex];
  if (!removed || !nextScene) return;

  if (tour.value.initialSceneId === removed.id) {
    tour.value.initialSceneId = nextScene.id;
  }

  saving.value = true;
  try {
    // Persist first: a reload must never restore the deleted scene.
    await $fetch(`/api/admin/tours/${slug}`, { method: 'POST', body: tour.value });

    // Only uploader-owned files are accepted by this endpoint. Bundled source
    // images under /images are intentionally left untouched.
    const mediaPaths = [removed.panorama, removed.mobilePanorama, removed.previewPanorama, removed.thumbnail, removed.editorPanorama].filter((path, index, all): path is string => (
      Boolean(path) && all.indexOf(path) === index
    ));
    const stillReferenced = new Set(tour.value.scenes.flatMap((scene) => [scene.panorama, scene.mobilePanorama, scene.previewPanorama, scene.thumbnail, scene.editorPanorama]));
    const orphanedMedia = mediaPaths.filter((path) => !stillReferenced.has(path));
    let mediaDeleteWarning = false;
    if (orphanedMedia.length) {
      try {
        await $fetch('/api/admin/media', { method: 'DELETE', body: { paths: orphanedMedia } });
      } catch {
        // The scene is already persisted as deleted. Do not roll it back merely
        // because filesystem cleanup failed; report the leftover file instead.
        mediaDeleteWarning = true;
      }
    }

    currentSceneIdx.value = nextIndex;
    selectedHotspotId.value = null;
    pushHistorySnapshot();
    markSaved();
    await navigateTo(`/admin/${slug}/${nextScene.id}`);
    showToast({
      message: mediaDeleteWarning
        ? 'Đã xóa cảnh, nhưng chưa thể dọn file ảnh trong thư mục lưu trữ'
        : 'Đã xóa cảnh và file ảnh khỏi thư mục lưu trữ',
      variant: mediaDeleteWarning ? 'warning' : 'success',
    });
  } catch (error: any) {
    // Restore the local editor if persistence failed.
    tour.value.scenes.splice(removedIndex, 0, removedScene);
    tour.value.initialSceneId = previousInitialSceneId;
    currentSceneIdx.value = removedIndex;
    const message = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Không thể xóa cảnh';
    showToast({ message, variant: 'error' });
  } finally {
    saving.value = false;
  }
}

// ── Reorder Scenes (Drag & Drop) ──────────────────────────────────────────────
function handleSceneDragStart(idx: number, e: DragEvent) {
  draggingSceneIdx.value = idx;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }
}

function handleSceneDragOver(idx: number, e: DragEvent) {
  e.preventDefault();
  dragOverSceneIdx.value = idx;
}

function handleSceneDrop(idx: number, e: DragEvent) {
  e.preventDefault();
  dragOverSceneIdx.value = null;
  const from = draggingSceneIdx.value;
  draggingSceneIdx.value = null;
  if (from === null || from === idx || !tour.value) return;

  const [moved] = tour.value.scenes.splice(from, 1);
  tour.value.scenes.splice(idx, 0, moved);

  if (from === currentSceneIdx.value) currentSceneIdx.value = idx;
  else if (from < currentSceneIdx.value && idx >= currentSceneIdx.value) currentSceneIdx.value--;
  else if (from > currentSceneIdx.value && idx <= currentSceneIdx.value) currentSceneIdx.value++;

  markDirty();
  showToast({ message: 'Đã sắp xếp lại danh sách cảnh', variant: 'default' });
}

// ── Hotspot Placement Flow ────────────────────────────────────────────────────
function startPlacingHotspot() {
  isPlacingHotspot.value = !isPlacingHotspot.value;
  if (isPlacingHotspot.value) {
    engineStartPlacement('navigation');
    showToast({ message: 'Nhấn lên ảnh panorama để đặt điểm tương tác', variant: 'default' });
  } else {
    engineCancelPlacement();
  }
}

function toggleAreaDrawing() {
  if (isDrawingArea.value) {
    if (!engineFinishAreaDrawing()) {
      showToast({ message: 'Cần chọn ít nhất 3 điểm để tạo vùng', variant: 'warning' });
    }
    return;
  }
  if (isPlacingHotspot.value) cancelPlacing();
  engineStartAreaDrawing();
  showToast({ message: 'Click các điểm bao quanh khu vực, sau đó bấm Hoàn tất vùng', variant: 'default' });
}

function cancelAreaDrawing() {
  engineCancelAreaDrawing();
  showToast({ message: 'Đã hủy vẽ vùng', variant: 'default' });
}

function setHighlightInteractionMode(mode: 'rotate' | 'edit') {
  if (mode === 'rotate' && (isDrawingArea.value || areaPointTargetId.value)) {
    engineCancelAreaDrawing();
  }
  engineSetAreaInteractionMode(mode);
}

function selectArea(area: AreaHighlight) {
  selectedAreaId.value = area.id;
  engineSelectAreaPoint(null, null);
}

function selectAreaNode(areaId: string, pointIndex: number) {
  selectedAreaId.value = areaId;
  engineSelectAreaPoint(areaId, pointIndex);
}

function deleteArea(areaId: string) {
  if (!currentScene.value?.areaHighlights) return;
  currentScene.value.areaHighlights = currentScene.value.areaHighlights.filter(area => area.id !== areaId);
  if (selectedAreaId.value === areaId) selectedAreaId.value = null;
  engineSelectAreaPoint(null, null);
  refreshAreaHighlights(currentScene.value.areaHighlights);
  markDirty();
}

function removeAreaPoint(area: AreaHighlight, pointIndex: number) {
  if (area.points.length <= 3) {
    showToast({ message: 'Một vùng phải có ít nhất 3 node', variant: 'warning' });
    return;
  }
  area.points.splice(pointIndex, 1);
  engineSelectAreaPoint(null, null);
  refreshAreaHighlights(currentScene.value?.areaHighlights ?? []);
  markDirty();
}

function updateSelectedArea() {
  refreshAreaHighlights(currentScene.value?.areaHighlights ?? []);
  markDirty();
}

function cancelPlacing() {
  isPlacingHotspot.value = false;
  showHotspotModal.value = false;
  pendingHotspotCoords.value = null;
  engineCancelPlacement();
}

function createHotspot(type: 'navigation' | 'video' | 'panel') {
  if (!pendingHotspotCoords.value || !currentScene.value) return;
  const id = `h${Date.now()}`;
  const base = {
    id,
    label: type === 'navigation' ? 'Chuyển cảnh' : type === 'video' ? 'Xem video' : 'Xem nội dung',
    yaw: parseFloat(pendingHotspotCoords.value.yaw.toFixed(3)),
    pitch: parseFloat(pendingHotspotCoords.value.pitch.toFixed(3)),
  };

  if (type === 'navigation') {
    const firstOther = tour.value?.scenes.find((s) => s.id !== currentScene.value?.id);
    currentScene.value.markers.push({
      ...base,
      plugin: 'navigation',
      targetScene: firstOther ? firstOther.id : '',
      icon: 'arrow',
      rotZ: 0,
      rotX: Math.PI / 3,
      rotY: 0,
      scaleX: 1.6,
      scaleY: 1,
      sphereRadius: 520,
    } as NavigationMarker);
  } else if (type === 'panel') {
    currentScene.value.markers.push({
      ...base,
      plugin: 'panel',
      placement: 'vertical',
      contents: [{ id: `${id}-text`, type: 'text', content: '' }],
    } as PanelMarkerData);
  } else if (type === 'video') {
    currentScene.value.markers.push({ ...base, plugin: 'video', src: '', width: 720, height: 405 } as VideoMarker);
  }

  selectedHotspotId.value = id;
  currentTab.value = 'hotspots';
  markDirty();
  showHotspotModal.value = false;
  pendingHotspotCoords.value = null;
  showToast({ message: 'Đã thêm điểm tương tác mới', variant: 'success' });
}

function addPanelBlock(type: PanelBlock['type']) {
  if (selectedHotspot.value?.plugin !== 'panel') return;
  const id = `block-${Date.now()}`;
  const block: PanelBlock = type === 'text'
    ? { id, type, content: '', presentation: 'text-only', speech: { lang: 'vi-VN', rate: 1, pitch: 1 } }
    : type === 'audio'
      ? { id, type, src: '' }
      : type === 'image'
        ? { id, type, src: '', alt: '', caption: '' }
      : type === 'image3d'
        ? { id, type, image: '', caption: '' }
        : { id, type, context: '' };
  selectedHotspot.value.contents.push(block);
  syncMarkersToViewer();
  markDirty();
}

function removePanelBlock(index: number) {
  if (selectedHotspot.value?.plugin !== 'panel') return;
  selectedHotspot.value.contents.splice(index, 1);
  syncMarkersToViewer();
  markDirty();
}

function movePanelBlock(index: number, direction: -1 | 1) {
  if (selectedHotspot.value?.plugin !== 'panel') return;
  const target = index + direction;
  if (target < 0 || target >= selectedHotspot.value.contents.length) return;
  const [block] = selectedHotspot.value.contents.splice(index, 1);
  selectedHotspot.value.contents.splice(target, 0, block);
  syncMarkersToViewer();
  markDirty();
}

function deleteHotspot(id: string) {
  if (!currentScene.value) return;
  currentScene.value.markers = currentScene.value.markers.filter((m) => m.id !== id);
  if (selectedHotspotId.value === id) selectedHotspotId.value = null;
  markDirty();
  showToast({ message: 'Đã xóa điểm tương tác', variant: 'default' });
}

// ── Guided & Preview Mode ─────────────────────────────────────────────────────
function togglePreviewMode() {
  previewMode.value = !previewMode.value;
  if (previewMode.value) {
    showToast({ message: 'Đang ở chế độ xem trước — như người dùng thấy', variant: 'success' });
    if (tour.value?.mode === 'guided') startGuidedMode();
  } else {
    stopGuidedMode();
  }
}

function startGuidedMode() {
  stopGuidedMode();
  const dur = (tour.value?.guidedDuration || 8) * 1000;
  guidedTimer = setInterval(() => {
    if (!tour.value) return;
    const next = (currentSceneIdx.value + 1) % tour.value.scenes.length;
    goToScene(next);
  }, dur);
}

function stopGuidedMode() {
  if (guidedTimer) clearInterval(guidedTimer);
  guidedTimer = null;
}

// ── Zoom controls ─────────────────────────────────────────────────────────────
function changeZoom(delta: number) {
  zoom.value = Math.max(50, Math.min(200, zoom.value + delta));
  // zoom% 50→200 mapped to FOV 150→30 (inverse: more zoom = lower FOV)
  const fov = 150 - ((zoom.value - 50) / 150) * 120;
  setFov(fov);
}

// ── Save to server ────────────────────────────────────────────────────────────
async function saveToServer() {
  if (!tour.value) return;
  saving.value = true;
  try {
    await $fetch<{ ok: boolean; tour: TourConfig }>(`/api/admin/tours/${slug}`, {
      method: 'POST',
      body: tour.value,
    });
    // Frontend state is the source of truth.
    // We do NOT re-assign from server response — that would reset the UI.
    // Just mark the current state as saved and snapshot it into history.
    pushHistorySnapshot();
    markSaved();
    showToast({ message: 'Đã lưu thay đổi thành công', variant: 'success' });
  } catch (err: any) {
    showToast({ message: err?.statusMessage ?? 'Lỗi khi lưu tour', variant: 'error' });
  } finally {
    saving.value = false;
  }
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────────
onMounted(() => {
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
      return;
    }

    if (e.key === 'Escape') {
      if (showHotspotModal.value) cancelPlacing();
      else if (isPlacingHotspot.value) cancelPlacing();
      else if (isDrawingArea.value) cancelAreaDrawing();
      else if (selectedHotspotId.value) selectedHotspotId.value = null;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveToServer();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      redo();
    }
    if (e.key === 'ArrowDown' && e.altKey) {
      e.preventDefault();
      if (tour.value) goToScene(Math.min(tour.value.scenes.length - 1, currentSceneIdx.value + 1));
    }
    if (e.key === 'ArrowUp' && e.altKey) {
      e.preventDefault();
      goToScene(Math.max(0, currentSceneIdx.value - 1));
    }
  };

  window.addEventListener('keydown', handleKeydown);
  onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown));
});
</script>

<template>
  <div
    :class="['admin-studio', { 'preview-mode': previewMode }]"
    :style="{ gridTemplateColumns: `${leftSidebarWidth}px 5px minmax(0, 1fr) 5px ${rightSidebarWidth}px` }"
  >

    <!-- Hidden native file input for real image upload -->
    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="hidden"
      @change="handleFileChange"
    >
    <input
      ref="newSceneInput"
      type="file"
      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
      multiple
      class="hidden"
      @change="handleNewSceneImage"
    >
    <input ref="modelImageInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="handleModelImageChange">
    <input ref="panelImageInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="handlePanelImageChange">
    <input
      ref="narrationInput"
      type="file"
      accept="audio/wav,audio/mpeg,audio/mp4,audio/ogg,audio/aac,audio/flac,.wav,.mp3,.m4a,.ogg,.aac,.flac"
      class="hidden"
      @change="handleNarrationChange"
    >

    <!-- ═══ TOPBAR ═══ -->
    <header class="topbar">
      <div class="tb-logo">
        <div class="tb-logo-mark">SV</div>
        <div class="tb-logo-text">
          <strong>{{ studioName }}</strong>
          <span>{{ tour?.title ?? 'Không gian triển lãm' }}</span>
        </div>
      </div>

      <div class="tb-breadcrumb">
        <NuxtLink to="/admin" class="hover:text-white transition-colors">Quản lý tour</NuxtLink>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m9 18 6-6-6-6" />
        </svg>
        <strong id="breadcrumbTour">{{ tour?.title }}</strong>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m9 18 6-6-6-6" />
        </svg>
        <span id="breadcrumbScene">{{ currentScene?.title }}</span>
      </div>

      <div class="tb-spacer"></div>

      <!-- Save Indicator -->
      <div class="save-indicator" :class="{ saving, dirty: isDirty }">
        <span class="dot"></span>
        <span id="saveText">{{ saving ? 'Đang lưu...' : isDirty ? 'Có thay đổi chưa lưu' : 'Đã lưu' }}</span>
      </div>

      <div class="tb-actions">
        <UiTooltip content="Hoàn tác (Ctrl+Z)" placement="bottom">
          <button
            class="tb-btn"
            id="undoBtn"
            :disabled="!canUndo"
            :style="{ opacity: canUndo ? 1 : 0.4 }"
            @click="undo"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>
        </UiTooltip>

        <UiTooltip content="Làm lại (Ctrl+Y)" placement="bottom">
          <button
            class="tb-btn"
            id="redoBtn"
            :disabled="!canRedo"
            :style="{ opacity: canRedo ? 1 : 0.4 }"
            @click="redo"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 7v6h-6" />
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
            </svg>
          </button>
        </UiTooltip>

        <button class="tb-btn" id="previewBtn" @click="togglePreviewMode">
          <svg v-if="!previewMode" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
          </svg>
          <span>{{ previewMode ? 'Chỉnh sửa' : 'Xem trước' }}</span>
        </button>

        <button class="tb-btn primary" id="saveBtn" :disabled="saving" @click="saveToServer">
          <UiSpinner v-if="saving" size="sm" color="white" />
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <path d="M17 21v-8H7v8" />
            <path d="M7 3v5h8" />
          </svg>
          <span>Lưu</span>
        </button>
      </div>
    </header>

    <!-- ═══ SIDEBAR TRÁI — SCENE LIST ═══ -->
    <aside class="sidebar-left">
      <div class="side-head">
        <div class="side-head-row">
          <h3>Danh sách cảnh</h3>
          <UiTooltip content="Thêm cảnh mới" placement="right">
            <button class="side-add" id="addSceneBtn" :disabled="addingScene" @click="addScene">
              <UiSpinner v-if="addingScene" size="sm" />
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </UiTooltip>
        </div>
        <p id="sceneCount">{{ tour?.scenes.length ?? 0 }} cảnh · Kéo để sắp xếp</p>
        <p v-if="addingScene" class="scene-queue-status" role="status" aria-live="polite">
          <template v-if="sceneQueueWaiting">Đã xong {{ sceneQueueCurrent }}/{{ sceneQueueTotal }} · nghỉ 5 giây…</template>
          <template v-else>Đang xử lý {{ sceneQueueCurrent }}/{{ sceneQueueTotal }} · {{ sceneQueueFileName }}</template>
        </p>
      </div>

      <div class="scene-list" id="sceneList">
        <div
          v-for="(s, idx) in tour?.scenes ?? []"
          :key="s.id"
          :class="[
            'scene-item',
            { active: idx === currentSceneIdx },
            { 'drag-over': dragOverSceneIdx === idx }
          ]"
          draggable="true"
          @dragstart="handleSceneDragStart(idx, $event)"
          @dragover="handleSceneDragOver(idx, $event)"
          @drop="handleSceneDrop(idx, $event)"
          @click="goToScene(idx)"
        >
          <span class="scene-drag">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
              <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
            </svg>
          </span>
          <img
            class="scene-thumb-sm"
            :src="s.thumbnail"
            :alt="s.title"
            loading="lazy"
            decoding="async"
            @error="handleThumbnailError"
          >
          <div class="scene-info">
            <strong>{{ s.title }}</strong>
            <span>{{ s.markers?.length ?? 0 }} điểm tương tác{{ tour?.initialSceneId === s.id ? ' · ★ Bắt đầu' : '' }}</span>
          </div>
          <span v-if="tour?.initialSceneId === s.id" class="scene-badge">Start</span>
        </div>
      </div>
    </aside>

    <div class="resizer resizer-left" aria-label="Thay đổi chiều rộng danh sách cảnh" @pointerdown="startResize('left', $event)" />

    <!-- ═══ CENTER — PREVIEW ═══ -->
    <main class="preview">
      <div class="preview-toolbar">
        <div class="editor-mode-switch workspace-mode-switch" aria-label="Khu vực biên tập">
          <button type="button" :class="{ active: editorMode === 'panorama' }" @click="editorMode = 'panorama'">Panorama</button>
          <button type="button" :class="{ active: editorMode === 'highlight' }" @click="editorMode = 'highlight'">Vùng sáng</button>
          <button type="button" :class="{ active: editorMode === 'map' }" @click="editorMode = 'map'">Bản đồ</button>
        </div>
        <div v-if="editorMode === 'panorama'" class="editor-mode-switch alignment-mode-switch">
          <button type="button" title="Kéo để xoay camera" :class="{ active: interactionMode === 'camera' }" @click="setInteractionMode('camera')">Camera</button>
          <button type="button" title="Kéo để căn chỉnh panorama" :class="{ active: interactionMode === 'panorama' }" @click="setInteractionMode('panorama')">Ảnh 360°</button>
        </div>
        <div v-if="editorMode === 'panorama'" class="editor-mode-switch device-mode-switch" title="Mô phỏng và lưu góc nhìn theo thiết bị">
          <button type="button" :class="{ active: editorDevice === 'desktop' }" @click="setEditorDevice('desktop')">Máy tính</button>
          <button type="button" :class="{ active: editorDevice === 'mobile' }" @click="setEditorDevice('mobile')">Điện thoại</button>
        </div>
        <div v-if="editorMode === 'panorama' && editorDevice === 'mobile'" class="mobile-device-picker">
          <select v-model="mobileDevicePresetId" title="Chọn kích thước màn hình mô phỏng">
            <option v-for="preset in mobileDevicePresets" :key="preset.id" :value="preset.id">
              {{ preset.label }} — {{ preset.width }} × {{ preset.height }}
            </option>
          </select>
          <span>{{ activeMobileDevicePreset.width }} × {{ activeMobileDevicePreset.height }}</span>
        </div>
        <details v-if="editorMode === 'panorama' && currentScene" class="view-settings-menu">
          <summary title="Thiết lập góc và zoom khi vào cảnh">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.38.36.72.6 1 .3.3.7.44 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7.6Z"/>
            </svg>
            <span>Góc vào cảnh</span>
            <svg class="menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
          </summary>
          <div class="view-settings-popover">
            <div class="view-settings-head">
              <strong>Góc nhìn mặc định</strong>
              <span>{{ editorDevice === 'mobile' ? 'Điện thoại' : 'Máy tính' }}</span>
            </div>
            <div class="view-setting-row">
              <label>
                <input type="checkbox" :checked="activeDefaultCameraEnabled" @change="setDefaultCameraEnabled(($event.target as HTMLInputElement).checked)">
                <span><strong>Hướng camera</strong><small>Yaw {{ Math.round(activeInitialYaw * RAD_TO_DEG) }}° · Pitch {{ Math.round(activeInitialPitch * RAD_TO_DEG) }}°</small></span>
              </label>
              <button type="button" :disabled="saving" @click="saveCurrentCamera">{{ saving ? 'Đang lưu…' : 'Lấy và lưu' }}</button>
            </div>
            <div class="view-setting-row">
              <label>
                <input type="checkbox" :checked="activeDefaultZoomEnabled" @change="setDefaultZoomEnabled(($event.target as HTMLInputElement).checked)">
                <span><strong>Mức zoom</strong><small>{{ (Math.tan(75 * Math.PI / 360) / Math.tan(activeInitialFov * Math.PI / 360)).toFixed(2) }}× · FOV {{ Math.round(activeInitialFov) }}°</small></span>
              </label>
              <button type="button" :disabled="saving" @click="saveCurrentZoom">{{ saving ? 'Đang lưu…' : 'Lấy và lưu' }}</button>
            </div>
            <button
              v-if="editorDevice === 'mobile' && currentScene.mobileView"
              type="button"
              class="inherit-desktop-view"
              @click="clearMobileView"
            >Dùng lại góc nhìn của máy tính</button>
          </div>
        </details>
        <div v-if="editorMode === 'highlight'" class="editor-mode-switch alignment-mode-switch">
          <button
            type="button"
            :class="{ active: areaInteractionMode === 'rotate' }"
            @click="setHighlightInteractionMode('rotate')"
          >Xoay góc nhìn</button>
          <button
            type="button"
            :class="{ active: areaInteractionMode === 'edit' }"
            @click="setHighlightInteractionMode('edit')"
          >Vẽ / chỉnh vùng</button>
        </div>
        <button
          v-if="editorMode === 'panorama'"
          :class="['tb-btn marker-add-btn', { placing: isPlacingHotspot }]"
          id="placeHotspotBtn"
          @click="startPlacingHotspot"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>{{ isPlacingHotspot ? 'Đang đặt... (ESC)' : 'Đặt điểm tương tác' }}</span>
        </button>

        <span v-if="isPlacingHotspot" class="toolbar-hint">Nhấn vào ảnh để chọn vị trí</span>
        <span v-else-if="isDrawingArea" class="toolbar-hint">Chọn ít nhất 3 điểm · ESC để hủy</span>

        <div class="pt-spacer"></div>

        <div class="pt-zoom">
          <button id="zoomOut" title="Thu nhỏ" @click="changeZoom(-10)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14" />
            </svg>
          </button>
          <span class="pt-zoom-label" id="zoomLabel">{{ zoom }}%</span>
          <button id="zoomIn" title="Phóng to" @click="changeZoom(10)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

      </div>

      <div
        :class="['preview-canvas', { 'mobile-preview': editorDevice === 'mobile' && editorMode === 'panorama' }]"
        :style="editorDevice === 'mobile' && editorMode === 'panorama' ? mobilePreviewStyle : undefined"
        id="previewCanvas"
      >
        <div ref="container" class="h-full w-full" :style="{ visibility: editorMode === 'panorama' || editorMode === 'highlight' ? 'visible' : 'hidden' }" />

        <AdminRealMapEditor
          v-if="editorMode === 'map' && tour"
          :scenes="tour.scenes"
          :current-scene-id="currentScene?.id"
          @select-scene="selectSceneFromGeoMap"
          @set-coordinates="setSceneGeoCoordinates"
        />

        <AdminMapHeadingPreview
          v-if="editorMode === 'panorama' && currentScene?.coordinates"
          :coordinates="currentScene.coordinates"
          :camera-yaw="cameraYaw"
          :panorama-rotation="currentScene.panoramaRotation ?? 0"
        />

        <div v-if="editorMode === 'panorama' && interactionMode === 'panorama'" class="panorama-rotation-hint">
          Kéo ngang để xoay panorama · Camera đang được giữ cố định
        </div>

        <div v-if="editorMode === 'panorama'" class="place-hint" :class="{ active: isPlacingHotspot }" id="placeHint">
          Nhấn lên ảnh để đặt điểm tương tác · ESC để hủy
        </div>

        <div v-if="editorMode === 'highlight'" class="place-hint active">
          <template v-if="isDrawingArea">Click để thêm node · Kéo node lớn để chỉnh · Bấm Hoàn tất vùng</template>
          <template v-else-if="areaPointTargetId">Click vị trí muốn thêm node · ESC để hủy</template>
          <template v-else-if="areaInteractionMode === 'edit'">Camera đang khóa · Kéo node để chỉnh hình dạng</template>
          <template v-else>Kéo để xoay góc nhìn · Chế độ này không tạo hoặc kéo node</template>
        </div>

        <div v-if="editorMode === 'panorama'" class="preview-info">
          <span class="preview-info-badge">CẢNH {{ currentSceneIdx + 1 }}/{{ tour?.scenes.length ?? 1 }}</span>
          <span class="preview-info-title" id="infoTitle">{{ currentScene?.title }}</span>
          <span class="preview-info-coord" id="infoCoord">
            <template v-if="isPlacingHotspot">Nhấn vị trí bất kỳ để đặt</template>
            <template v-else>
              Yaw {{ (cameraYaw * RAD_TO_DEG).toFixed(1) }}° ·
              Pitch {{ (cameraPitch * RAD_TO_DEG).toFixed(1) }}° ·
              Zoom {{ (Math.tan(75 * Math.PI / 360) / Math.tan(cameraFov * Math.PI / 360)).toFixed(2) }}× ·
              FOV {{ cameraFov.toFixed(1) }}°
            </template>
          </span>
        </div>
      </div>
    </main>

    <div class="resizer resizer-right" aria-label="Thay đổi chiều rộng bảng thuộc tính" @pointerdown="startResize('right', $event)" />

    <!-- ═══ SIDEBAR PHẢI — INSPECTOR ═══ -->
    <aside class="inspector sidebar-right">
      <div v-if="editorMode === 'panorama'" class="insp-tabs">
        <button
          :class="['insp-tab', { active: currentTab === 'scene' }]"
          @click="currentTab = 'scene'"
        >
          Cảnh
        </button>
        <button
          :class="['insp-tab', { active: currentTab === 'hotspots' }]"
          @click="currentTab = 'hotspots'"
        >
          Điểm tương tác
        </button>
        <button
          :class="['insp-tab', { active: currentTab === 'settings' }]"
          @click="currentTab = 'settings'"
        >
          Cài đặt
        </button>
      </div>

      <div class="insp-body" id="inspBody">

        <!-- ── TAB 1: CẢNH ── -->
        <template v-if="editorMode === 'panorama' && currentTab === 'scene' && currentScene">
          <div class="insp-section">
            <div class="insp-section-title">Thông tin cảnh</div>
            <div class="field">
              <label>Tên cảnh</label>
              <input
                v-model="currentScene.title"
                type="text"
                id="fieldName"
                @input="markDirty"
              >
            </div>
            <div class="field">
              <label>Mô tả ngắn</label>
              <textarea
                v-model="currentScene.subtitle"
                id="fieldDesc"
                @input="markDirty"
              />
            </div>
          </div>

          <!-- Real Image Picker with Upload & Direct URL -->
          <div class="insp-section">
            <div class="insp-section-title">Ảnh panorama</div>
            <div
              class="img-picker"
              id="imgPicker"
              title="Nhấn để tải ảnh panorama từ máy tính"
              @click="triggerImageUpload"
            >
              <img
                v-if="!panoramaPreviewFailed"
                :src="currentScene.thumbnail || currentScene.panorama"
                :alt="currentScene.title"
                decoding="async"
                @error="panoramaPreviewFailed = true"
              >
              <div v-else class="image-error">Không đọc được ảnh. Hãy kiểm tra đường dẫn hoặc tải ảnh mới.</div>
              <div class="img-picker-overlay">
                <UiSpinner v-if="uploadingImage" size="md" color="white" />
                <template v-else>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span>{{ uploadingImage ? 'Đang tải lên...' : 'Đổi ảnh (Tải lên)' }}</span>
                </template>
              </div>
            </div>

            <!-- Direct Panorama & Thumbnail URL Fields -->
            <div class="field mt-2">
              <label>URL ảnh panorama (2:1)</label>
              <input
                v-model="currentScene.panorama"
                type="text"
                placeholder="https://... hoặc /uploads/..."
                @change="onPanoramaUrlChange"
              >
            </div>
            <div class="field">
              <label>URL ảnh thumbnail</label>
              <input
                v-model="currentScene.thumbnail"
                type="text"
                placeholder="https://... hoặc /thumbnails/..."
                @input="markDirty"
              >
            </div>

            <div class="hint-text">💡 Nhấn vào ô xem trước để chọn file từ máy tính hoặc dán đường dẫn URL trực tiếp.</div>
          </div>

          <div class="insp-section">
            <div class="insp-section-title">Ánh sáng hình ảnh</div>
            <div class="brightness-control">
              <input
                :value="currentScene.brightness ?? 1.25"
                type="range"
                min="0.5"
                max="1.6"
                step="0.05"
                @input="updateSceneBrightness"
              >
              <output>{{ Math.round((currentScene.brightness ?? 1.25) * 100) }}%</output>
            </div>
            <div class="brightness-presets">
              <button type="button" @click="setSceneBrightness(1)">Gốc</button>
              <button type="button" @click="setSceneBrightness(1.25)">Mặc định</button>
              <button type="button" @click="setSceneBrightness(1.4)">Sáng rõ</button>
            </div>
            <label class="sub-control-label">Giảm vùng chói</label>
            <div class="brightness-control">
              <input
                :value="currentScene.highlightCompression ?? 0"
                type="range"
                min="0"
                max="1"
                step="0.05"
                @input="updateSceneHighlightCompression"
              >
              <output>{{ Math.round((currentScene.highlightCompression ?? 0) * 100) }}%</output>
            </div>
            <div class="brightness-presets">
              <button type="button" @click="setSceneHighlightCompression(0)">Tắt</button>
              <button type="button" @click="setSceneHighlightCompression(0.35)">Nhẹ</button>
              <button type="button" @click="setSceneHighlightCompression(0.6)">Mạnh</button>
            </div>
            <div class="hint-text">Chỉ nén vùng trời và nguồn sáng gắt; không thay đổi file ảnh gốc.</div>
          </div>

          <div class="insp-section">
            <div class="insp-section-title">Vị trí trong tour</div>
            <div class="field-row">
              <div class="field">
                <label>Thứ tự</label>
                <input
                  :value="currentSceneIdx + 1"
                  type="number"
                  min="1"
                  :max="tour?.scenes.length"
                  @change="(e: any) => {
                    const newOrder = Math.max(0, Math.min((tour?.scenes.length ?? 1) - 1, parseInt(e.target.value) - 1));
                    if (newOrder !== currentSceneIdx && tour) {
                      const [moved] = tour.scenes.splice(currentSceneIdx, 1);
                      tour.scenes.splice(newOrder, 0, moved);
                      currentSceneIdx = newOrder;
                      markDirty();
                    }
                  }"
                >
              </div>
              <div class="field">
                <label>ID</label>
                <input type="text" :value="currentScene.id" readonly style="opacity:0.5">
              </div>
            </div>

            <div class="toggle-row">
              <label for="isStartToggle">Đặt làm cảnh bắt đầu</label>
              <UiSwitch
                :model-value="tour?.initialSceneId === currentScene.id"
                @update:model-value="(val) => {
                  if (tour) {
                    tour.initialSceneId = val ? currentScene.id : undefined;
                    markDirty();
                  }
                }"
              />
            </div>
          </div>

          <div class="insp-section">
            <button class="btn-block danger" id="deleteSceneBtn" @click="deleteCurrentScene">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              Xóa cảnh này
            </button>
          </div>
        </template>

        <!-- ── TAB 2: ĐIỂM TƯƠNG TÁC ── -->
        <template v-else-if="editorMode === 'panorama' && currentTab === 'hotspots' && currentScene">
          <div class="insp-section">
            <div class="insp-section-title">
              <span>Điểm tương tác trong cảnh ({{ currentScene.markers.length }})</span>
            </div>

            <div v-if="!currentScene.markers.length" class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
              </svg>
              Chưa có điểm tương tác nào.<br>Nhấn “Đặt điểm tương tác” để bắt đầu.
            </div>

            <div v-else class="hotspot-list">
              <div
                v-for="hs in currentScene.markers"
                :key="hs.id"
                :class="['hotspot-row', { selected: hs.id === selectedHotspotId }]"
                @click="selectedHotspotId = hs.id"
              >
                <div :class="['hotspot-row-icon', hs.plugin === 'navigation' ? 'nav' : hs.plugin]">
                  <svg v-if="hs.plugin === 'navigation'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 4 L12 18"/><path d="M6 11 L12 5 L18 11"/>
                  </svg>
                  <svg v-else-if="hs.plugin === 'video'" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  <svg v-else-if="hs.plugin === 'model3d'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M12 22V12M3 7l9 5 9-5"/></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                    <circle cx="12" cy="7" r="1.8" fill="currentColor" stroke="none"/>
                    <path d="M12 11 L12 18"/>
                  </svg>
                </div>
                <span class="hotspot-row-name">{{ hs.label }}</span>
                <button class="hotspot-row-delete" @click.stop="deleteHotspot(hs.id)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                  </svg>
                </button>
              </div>
            </div>

            <button class="btn-block primary" id="quickAddHotspot" @click="startPlacingHotspot">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Thêm điểm tương tác
            </button>
          </div>

          <!-- Edit Selected Hotspot Form -->
          <div v-if="selectedHotspot" class="insp-section border-t border-white/8 pt-4">
            <div class="insp-section-title">Chỉnh sửa điểm tương tác</div>

            <div v-if="editorDevice === 'mobile'" class="marker-device-notice">
              <div>
                <strong>Bố cục điện thoại</strong>
                <span>Kéo marker hoặc chỉnh hình học bên dưới. Giá trị chưa chỉnh sẽ dùng bản máy tính.</span>
              </div>
              <button v-if="selectedHotspot.mobileView" type="button" @click="clearSelectedMarkerMobileView">Dùng bản máy tính</button>
            </div>

            <div class="field">
              <label>Nhãn hiển thị</label>
              <input
                v-model="selectedHotspot.label"
                type="text"
                @input="markDirty"
              >
            </div>

            <!-- Navigation target scene dropdown -->
            <div v-if="selectedHotspot.plugin === 'navigation'" class="field">
              <label>Cảnh đích</label>
              <select
                :value="(selectedHotspot as NavigationMarker).targetScene"
                @change="(e: any) => {
                  (selectedHotspot as NavigationMarker).targetScene = e.target.value;
                  markDirty();
                }"
              >
                <option value="" disabled>— Chọn cảnh —</option>
                <option
                  v-for="s in tour?.scenes ?? []"
                  :key="s.id"
                  :value="s.id"
                >
                  {{ s.title }}
                </option>
              </select>
            </div>

            <!-- Navigation icon mode selector -->
            <template v-if="selectedHotspot.plugin === 'navigation'">
              <div class="field">
                <label>Kiểu hiển thị</label>
                <div class="nav-icon-mode-toggle">
                  <button
                    type="button"
                    :class="['nav-mode-btn', { active: ['arrow', 'arrow-1', 'arrow-2'].includes((selectedHotspot as NavigationMarker).icon ?? 'arrow') }]"
                    @click="() => {
                      (selectedHotspot as NavigationMarker).icon = 'arrow';
                      (selectedHotspot as NavigationMarker).rotZ ??= 0;
                      (selectedHotspot as NavigationMarker).rotX ??= Math.PI / 3;
                      (selectedHotspot as NavigationMarker).rotY ??= 0;
                      (selectedHotspot as NavigationMarker).scaleX ??= 1.6;
                      (selectedHotspot as NavigationMarker).scaleY ??= 1;
                      refreshMarkers?.(currentScene); markDirty();
                    }"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px">
                      <path d="m5 15 7-6 7 6"/><path d="m5 21 7-6 7 6"/>
                    </svg>
                    Mũi tên
                  </button>
                  <button
                    type="button"
                    :class="['nav-mode-btn', { active: ['local', 'location-1', 'pin'].includes((selectedHotspot as NavigationMarker).icon ?? '') }]"
                    @click="() => {
                      (selectedHotspot as NavigationMarker).icon = 'local';
                      (selectedHotspot as NavigationMarker).scaleX = 1;
                      (selectedHotspot as NavigationMarker).scaleY = 0.8;
                      if (!(selectedHotspot as NavigationMarker).pinColor) (selectedHotspot as NavigationMarker).pinColor = '#171717';
                      refreshMarkers?.(currentScene); markDirty();
                    }"
                  >
                    <svg viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:20px">
                      <path d="M12 26S3 17.2 3 10a9 9 0 1 1 18 0c0 7.2-9 16-9 16Z"/><circle cx="12" cy="10" r="3.5"/>
                    </svg>
                    Local
                  </button>
                  <button
                    type="button"
                    :class="['nav-mode-btn', { active: ['drone', 'location-2', 'pin-top', 'anchor'].includes((selectedHotspot as NavigationMarker).icon ?? '') }]"
                    @click="() => {
                      (selectedHotspot as NavigationMarker).icon = 'drone';
                      if (!(selectedHotspot as NavigationMarker).pinColor) {
                        (selectedHotspot as NavigationMarker).pinColor = '#171717';
                      }
                      const target = (selectedHotspot as NavigationMarker).targetScene;
                      const targetScene = tour?.scenes?.find(s => s.id === target);
                      if (!((selectedHotspot as NavigationMarker).iconUrl) && targetScene?.thumbnail) {
                        (selectedHotspot as NavigationMarker).iconUrl = targetScene.thumbnail;
                      }
                      refreshMarkers?.(currentScene); markDirty();
                    }"
                  >
                    <svg viewBox="0 0 24 30" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:21px">
                      <path d="M12 28C10.5 21 4 17 4 9.5a8 8 0 1 1 16 0C20 17 13.5 21 12 28Z"/><circle cx="12" cy="9.5" r="3"/>
                    </svg>
                    Drone
                  </button>
                </div>
              </div>

              <div v-if="!navigationIsArrow(selectedHotspot as NavigationMarker)" class="field">
                <label>Font tiêu đề trên View</label>
                <select
                  :value="(selectedHotspot as NavigationMarker).labelFont ?? 'be-vietnam-pro'"
                  @change="(event: any) => {
                    (selectedHotspot as NavigationMarker).labelFont = event.target.value;
                    refreshMarkers?.(currentScene);
                    markDirty();
                  }"
                >
                  <option value="be-vietnam-pro">Be Vietnam Pro</option>
                  <option value="outfit">Outfit</option>
                  <option value="montserrat">Montserrat</option>
                  <option value="serif">Serif nghệ thuật</option>
                </select>
                <div class="hint-text">Font chỉ áp dụng cho tiêu đề đi kèm leader line ở trang View.</div>
              </div>

              <!-- Pin settings (only when pin mode) -->
              <template v-if="['local', 'drone', 'location-1', 'location-2', 'pin', 'pin-top', 'anchor'].includes((selectedHotspot as NavigationMarker).icon ?? '')">
                <!-- Pin color -->
                <div class="field">
                  <label>Màu pin</label>
                  <div class="pin-color-row">
                    <input
                      type="color"
                      :value="(selectedHotspot as NavigationMarker).pinColor ?? '#171717'"
                      @input="(e: any) => {
                        (selectedHotspot as NavigationMarker).pinColor = e.target.value;
                        refreshMarkers?.(currentScene); markDirty();
                      }"
                    >
                    <div class="pin-color-presets">
                      <button v-for="c in ['#ef4444','#f59e0b','#22c55e','#3b82f6','#8b5cf6','#ec4899','#1d6fa8','#171717']" :key="c" type="button"
                        :style="{ background: c }"
                        class="pin-color-swatch"
                        :class="{ active: (selectedHotspot as NavigationMarker).pinColor === c }"
                        @click="() => { (selectedHotspot as NavigationMarker).pinColor = c; refreshMarkers?.(currentScene); markDirty(); }"
                      />
                    </div>
                  </div>
                </div>

                <!-- Image inside pin (optional) -->
                <div class="field">
                  <label>Ảnh bên trong pin <span style="opacity:.5;font-weight:400">(tuỳ chọn)</span></label>
                  <input
                    :value="(selectedHotspot as NavigationMarker).iconUrl ?? ''"
                    type="text"
                    placeholder="/thumbnails/scene.jpg hoặc để trống"
                    @change="(e: any) => {
                      (selectedHotspot as NavigationMarker).iconUrl = e.target.value || undefined;
                      refreshMarkers?.(currentScene); markDirty();
                    }"
                  >
                  <div class="hint-text">Để trống = pin trắng trơn. Có ảnh = thumbnail tròn bên trong pin.</div>
                </div>

                <!-- Quick fill from target scene thumbnail -->
                <div v-if="(selectedHotspot as NavigationMarker).targetScene" class="field">
                  <button
                    type="button"
                    class="btn-fill-thumb"
                    @click="() => {
                      const target = (selectedHotspot as NavigationMarker).targetScene;
                      const targetScene = tour?.scenes?.find(s => s.id === target);
                      if (targetScene?.thumbnail) {
                        (selectedHotspot as NavigationMarker).iconUrl = targetScene.thumbnail;
                        refreshMarkers?.(currentScene); markDirty();
                      }
                    }"
                  >
                    📷 Dùng thumbnail cảnh đích
                  </button>
                </div>

                <!-- Preview -->
                <div v-if="(selectedHotspot as NavigationMarker).iconUrl" class="field nav-icon-preview">
                  <label>Xem trước ảnh</label>
                  <div class="nav-icon-preview-frame">
                    <img
                      :src="(selectedHotspot as NavigationMarker).iconUrl"
                      alt="Xem trước ảnh trong pin"
                      @error="($event.target as HTMLImageElement).style.display = 'none'"
                    >
                  </div>
                </div>

                <!-- Pin size -->
                <div class="field">
                  <label>
                    Kích thước pin
                    <span class="field-badge">{{ effectiveMarker(selectedHotspot as NavigationMarker).iconSize ?? 65 }}px</span>
                  </label>
                  <div class="rotation-control">
                    <input type="range" min="35" max="150" step="5"
                      :value="effectiveMarker(selectedHotspot as NavigationMarker).iconSize ?? 65"
                      @input="(e: any) => {
                        setMarkerViewValue(selectedHotspot, 'iconSize', Number(e.target.value));
                      }"
                    >
                    <button class="reset-btn" type="button" title="Về 65" @click="setMarkerViewValue(selectedHotspot, 'iconSize', 65)">↺</button>
                  </div>
                  <div class="hint-text">Kích thước pin trong không gian 3D (world units). Mặc định: 65.</div>
                </div>
              </template>
            </template>

            <template v-if="selectedHotspot.plugin === 'navigation'">
              <div class="field">
                <label>
                  Độ sâu trên mặt cầu 3D
                  <span class="field-badge">{{ Math.round(effectiveMarker(selectedHotspot as NavigationMarker).sphereRadius ?? 520) }}</span>
                </label>
                <div class="rotation-control">
                  <input type="range" min="120" max="580" step="5"
                    :value="effectiveMarker(selectedHotspot as NavigationMarker).sphereRadius ?? 520"
                    @input="(e:any) => setNavigationSphereRadius(e.target.value)"
                  >
                  <button class="reset-btn" type="button" title="Về mặt cầu mặc định" @click="setNavigationSphereRadius(520)">↺</button>
                </div>
                <div class="hint-text">120 = gần camera; 520 = mặc định; 580 = sát bề mặt panorama.</div>
              </div>
            </template>

            <!-- Navigation arrow 3D rotation — 3 axes (location pins do not use parallax) -->
            <template v-if="selectedHotspot.plugin === 'navigation' && ['arrow', 'arrow-1', 'arrow-2'].includes((selectedHotspot as NavigationMarker).icon ?? 'arrow')">
              <!-- rotZ: spin around normal (former single rotation) -->
              <div class="field">
                <label>
                  Xoay (Z) — chiều nghiêng
                  <span class="field-badge">{{ navigationRotationDegrees(selectedHotspot as NavigationMarker, 'rotZ') }}°</span>
                </label>
                <div class="rotation-control">
                  <input type="range" min="-180" max="180" step="1"
                    :value="navigationRotationDegrees(selectedHotspot as NavigationMarker, 'rotZ')"
                    @input="(e: any) => {
                      setMarkerViewValue(selectedHotspot, 'rotZ', Number(e.target.value) * Math.PI / 180);
                    }"
                  />
                  <button class="reset-btn" title="Về 0°" @click="setMarkerViewValue(selectedHotspot, 'rotZ', 0)">↺</button>
                </div>
                <div class="hint-text">0° = ^^ hướng lên. 90° = phải. -90° = trái.</div>
              </div>

              <!-- rotX: tilt forward/back -->
              <div class="field">
                <label>
                  Nghiêng (X) — đứng / nằm
                  <span class="field-badge">{{ navigationRotationDegrees(selectedHotspot as NavigationMarker, 'rotX') }}°</span>
                </label>
                <div class="rotation-control">
                  <input type="range" min="-90" max="90" step="1"
                    :value="navigationRotationDegrees(selectedHotspot as NavigationMarker, 'rotX')"
                    @input="(e: any) => {
                      setMarkerViewValue(selectedHotspot, 'rotX', Number(e.target.value) * Math.PI / 180);
                    }"
                  />
                  <button class="reset-btn" title="Về 60°" @click="setMarkerViewValue(selectedHotspot, 'rotX', Math.PI / 3)">↺</button>
                </div>
                <div class="hint-text">Mặc định 60° để mũi tên nằm theo mặt sàn. 0° = đứng thẳng.</div>
              </div>

              <!-- rotY: swivel left/right -->
              <div class="field">
                <label>
                  Xoay ngang (Y) — quay mặt
                  <span class="field-badge">{{ navigationRotationDegrees(selectedHotspot as NavigationMarker, 'rotY') }}°</span>
                </label>
                <div class="rotation-control">
                  <input type="range" min="-90" max="90" step="1"
                    :value="navigationRotationDegrees(selectedHotspot as NavigationMarker, 'rotY')"
                    @input="(e: any) => {
                      setMarkerViewValue(selectedHotspot, 'rotY', Number(e.target.value) * Math.PI / 180);
                    }"
                  />
                  <button class="reset-btn" title="Về 0°" @click="setMarkerViewValue(selectedHotspot, 'rotY', 0)">↺</button>
                </div>
                <div class="hint-text">Xoay mặt mũi tên sang trái/phải trong không gian 3D.</div>
              </div>
            </template>


            <!-- Plane Object3D markers resize independently on X/Y. -->
            <template v-if="selectedHotspot.plugin === 'navigation' || selectedHotspot.plugin === 'video'">
              <div class="field">
                <label>
                  Phóng ngang (X)
                  <span class="field-badge">{{ (planeMarkerScale(selectedHotspot as NavigationMarker | VideoMarker, 'scaleX') * 100).toFixed(0) }}%</span>
                </label>
                <div class="rotation-control">
                  <input type="range" min="0.25" max="4" step="0.05"
                    :value="planeMarkerScale(selectedHotspot as NavigationMarker | VideoMarker, 'scaleX')"
                    @input="(e:any) => setPlaneMarkerScale('scaleX', e.target.value)"
                  >
                  <button class="reset-btn" type="button" :title="selectedHotspot.plugin === 'navigation' && navigationIsArrow(selectedHotspot as NavigationMarker) ? 'Về 160%' : 'Về 100%'" @click="setPlaneMarkerScale('scaleX', selectedHotspot.plugin === 'navigation' && navigationIsArrow(selectedHotspot as NavigationMarker) ? 1.6 : 1)">↺</button>
                </div>
              </div>
              <div class="field">
                <label>
                  Phóng dọc (Y)
                  <span class="field-badge">{{ (planeMarkerScale(selectedHotspot as NavigationMarker | VideoMarker, 'scaleY') * 100).toFixed(0) }}%</span>
                </label>
                <div class="rotation-control">
                  <input type="range" min="0.25" max="4" step="0.05"
                    :value="planeMarkerScale(selectedHotspot as NavigationMarker | VideoMarker, 'scaleY')"
                    @input="(e:any) => setPlaneMarkerScale('scaleY', e.target.value)"
                  >
                  <button class="reset-btn" type="button" :title="selectedHotspot.plugin === 'navigation' && navigationIsLocal(selectedHotspot as NavigationMarker) ? 'Về 80%' : 'Về 100%'" @click="setPlaneMarkerScale('scaleY', selectedHotspot.plugin === 'navigation' && navigationIsLocal(selectedHotspot as NavigationMarker) ? 0.8 : 1)">↺</button>
                </div>
                <div class="hint-text">X và Y thay đổi độc lập; marker mặt phẳng không sử dụng chiều sâu Z.</div>
              </div>
            </template>

            <template v-if="selectedHotspot.plugin === 'panel'">
              <div class="field">
                <label>Hướng hiển thị panel</label>
                <select
                  :value="effectiveMarker(selectedHotspot as PanelMarkerData).placement ?? 'vertical'"
                  @change="(e:any) => setMarkerViewValue(selectedHotspot, 'placement', e.target.value)"
                >
                  <option value="vertical">Chiều dọc</option>
                  <option value="horizontal">Chiều ngang</option>
                </select>
                <div class="hint-text">Hệ thống tự chọn trên/dưới hoặc trái/phải theo khoảng trống còn lại.</div>
              </div>
              <div class="field">
                <label>Nội dung trong panel</label>
                <div class="video-size-presets">
                  <button type="button" @click="addPanelBlock('text')">+ Văn bản</button>
                  <button type="button" @click="addPanelBlock('image')">+ Ảnh 2D</button>
                  <button type="button" @click="addPanelBlock('image3d')">+ Ảnh 3D</button>
                  <button type="button" @click="addPanelBlock('audio')">+ Âm thanh</button>
                  <button type="button" @click="addPanelBlock('ai-chat')">+ AI Chat</button>
                </div>
                <div class="hint-text">Có thể kết hợp nhiều loại và thay đổi thứ tự hiển thị.</div>
              </div>

              <div
                v-for="(block, blockIndex) in (selectedHotspot as PanelMarkerData).contents"
                :key="block.id"
                class="field panel-block-editor"
              >
                <label>
                  {{ block.type === 'text' ? 'Văn bản' : block.type === 'image' ? 'Ảnh 2D' : block.type === 'image3d' ? 'Ảnh 3D' : block.type === 'audio' ? 'Âm thanh' : 'AI Chat' }}
                  <span class="field-badge">{{ blockIndex + 1 }}</span>
                </label>
                <template v-if="block.type === 'text'">
                  <textarea :value="block.content" placeholder="Nội dung mô tả..." @input="(e:any) => { block.content = e.target.value; markDirty(); }" />
                  <label>Chế độ hiển thị</label>
                  <select :value="block.presentation ?? 'text-only'" @change="(e:any) => { block.presentation = e.target.value; markDirty(); }">
                    <option value="text-only">Chỉ văn bản</option>
                    <option value="text-and-audio">Văn bản và bản đọc</option>
                    <option value="audio-only">Chỉ bản đọc</option>
                  </select>
                  <template v-if="(block.presentation ?? 'text-only') !== 'text-only'">
                  <label>File bản đọc (VieNeu-TTS)</label>
                  <input
                    :value="block.speech?.src ?? ''"
                    type="text"
                    placeholder="/uploads/audio/ban-doc.wav hoặc URL"
                    @change="(e:any) => { block.speech = { ...(block.speech ?? {}), src: e.target.value }; syncMarkersToViewer(); markDirty(); }"
                  >
                  <div class="video-size-presets">
                    <button type="button" :disabled="uploadingNarration" @click="triggerNarrationUpload(block.id)">
                      {{ uploadingNarration && narrationTargetBlockId === block.id ? 'Đang tải...' : 'Tải file bản đọc' }}
                    </button>
                    <button
                      v-if="block.speech?.src"
                      type="button"
                      @click="block.speech = { ...(block.speech ?? {}), src: undefined }; syncMarkersToViewer(); markDirty();"
                    >Bỏ file</button>
                  </div>
                  <audio v-if="block.speech?.src" :src="block.speech.src" controls preload="metadata" style="width:100%" />
                  <div class="hint-text">Xuất WAV/MP3 từ VieNeu-TTS rồi tải lên đây. Khi có file, thanh tiến trình sẽ dùng đúng thời lượng audio.</div>
                  <details v-if="!block.speech?.src">
                    <summary>Giọng trình duyệt dự phòng</summary>
                  <select :value="block.speech?.lang ?? 'vi-VN'" @change="(e:any) => { block.speech = { ...(block.speech ?? {}), lang: e.target.value }; markDirty(); }">
                    <option value="vi-VN">Tiếng Việt</option>
                    <option value="en-US">English (US)</option>
                    <option value="en-GB">English (UK)</option>
                    <option value="fr-FR">Français</option>
                    <option value="ja-JP">日本語</option>
                    <option value="ko-KR">한국어</option>
                  </select>
                  <label>Tốc độ <span class="field-badge">{{ (block.speech?.rate ?? 1).toFixed(1) }}x</span></label>
                  <input type="range" min="0.5" max="2" step="0.1" :value="block.speech?.rate ?? 1" @input="(e:any) => { block.speech = { ...(block.speech ?? {}), rate: Number(e.target.value) }; markDirty(); }">
                  <label>Cao độ <span class="field-badge">{{ (block.speech?.pitch ?? 1).toFixed(1) }}</span></label>
                  <input type="range" min="0.5" max="2" step="0.1" :value="block.speech?.pitch ?? 1" @input="(e:any) => { block.speech = { ...(block.speech ?? {}), pitch: Number(e.target.value) }; markDirty(); }">
                  <div class="hint-text">Giọng đọc thực tế phụ thuộc vào giọng có sẵn trên thiết bị người xem.</div>
                  </details>
                  </template>
                </template>
                <template v-else-if="block.type === 'image'">
                  <input :value="block.src" type="text" placeholder="/uploads/... hoặc https://..." @input="(e:any) => { block.src = e.target.value; syncMarkersToViewer(); markDirty(); }">
                  <div class="video-size-presets">
                    <button type="button" :disabled="uploadingPanelImage" @click="triggerPanelImageUpload(block.id)">
                      {{ uploadingPanelImage && panelImageTargetBlockId === block.id ? 'Đang tải...' : 'Tải ảnh 2D' }}
                    </button>
                    <button v-if="block.src" type="button" @click="block.src = ''; syncMarkersToViewer(); markDirty();">Bỏ ảnh</button>
                  </div>
                  <img v-if="block.src" :src="block.src" :alt="block.alt || block.caption || 'Ảnh xem trước'" class="max-h-48 w-full rounded-lg bg-black/20 object-contain">
                  <input :value="block.alt" type="text" placeholder="Mô tả ảnh cho trợ năng" @input="(e:any) => { block.alt = e.target.value; markDirty(); }">
                  <input :value="block.caption" type="text" placeholder="Chú thích ảnh (không bắt buộc)" @input="(e:any) => { block.caption = e.target.value; syncMarkersToViewer(); markDirty(); }">
                </template>
                <template v-else-if="block.type === 'image3d'">
                  <input :value="block.image" type="text" placeholder="/uploads/... hoặc https://..." @input="(e:any) => { block.image = e.target.value; markDirty(); }">
                  <input :value="block.caption" type="text" placeholder="Chú thích ảnh (không bắt buộc)" @input="(e:any) => { block.caption = e.target.value; markDirty(); }">
                </template>
                <template v-else-if="block.type === 'audio'">
                  <input :value="block.src" type="text" placeholder="/audio/file.mp3 hoặc URL" @input="(e:any) => { block.src = e.target.value; markDirty(); }">
                  <div class="hint-text">AudioBlock chỉ phát tệp âm thanh được tải lên hoặc nhập bằng URL; khối này không tạo giọng đọc từ văn bản.</div>
                </template>
                <textarea v-else :value="block.context" placeholder="Ngữ cảnh dành cho AI..." @input="(e:any) => { block.context = e.target.value; markDirty(); }" />
                <div class="video-size-presets">
                  <button type="button" :disabled="blockIndex === 0" @click="movePanelBlock(blockIndex, -1)">↑ Lên</button>
                  <button type="button" :disabled="blockIndex === (selectedHotspot as PanelMarkerData).contents.length - 1" @click="movePanelBlock(blockIndex, 1)">↓ Xuống</button>
                  <button type="button" @click="removePanelBlock(blockIndex)">Xóa</button>
                </div>
              </div>
            </template>

            <!-- Info content textarea -->
            <div v-if="selectedHotspot.plugin === 'info'" class="field">
              <label>Nội dung thông tin</label>
              <textarea
                :value="(selectedHotspot as InfoMarker).content"
                placeholder="Mô tả chi tiết địa điểm..."
                @input="(e: any) => {
                  (selectedHotspot as InfoMarker).content = e.target.value;
                  markDirty();
                }"
              />
            </div>

            <template v-if="selectedHotspot.plugin === 'video'">
              <div class="field">
                <label>Đường dẫn video</label>
                <input :value="(selectedHotspot as VideoMarker).src" type="url" placeholder="YouTube embed, Vimeo hoặc /video.mp4" @change="(e:any) => { (selectedHotspot as VideoMarker).src = e.target.value; markDirty(); }">
                <div class="hint-text">YouTube, Vimeo và video trực tiếp đều hiển thị ngay trong panorama.</div>
              </div>

              <div class="field video-panel-size">
                <label>Kích thước panel</label>
                <div class="video-size-presets">
                  <button type="button" @click="setVideoPanelSize(480, 270)">Nhỏ</button>
                  <button type="button" @click="setVideoPanelSize(640, 360)">Vừa</button>
                  <button type="button" @click="setVideoPanelSize(960, 540)">Lớn</button>
                  <button type="button" @click="setVideoPanelSize(1600, 900)">Rất lớn</button>
                </div>
                <div class="video-size-row">
                  <span>Rộng</span>
                  <input type="range" min="240" max="2560" step="10" :value="effectiveMarker(selectedHotspot as VideoMarker).width ?? 640" @input="(e:any) => updateVideoPanelSize('width', e.target.value)">
                  <input class="video-size-number" type="number" min="240" max="2560" step="10" :value="effectiveMarker(selectedHotspot as VideoMarker).width ?? 640" @change="(e:any) => updateVideoPanelSize('width', e.target.value)">
                </div>
                <div class="video-size-row">
                  <span>Cao</span>
                  <input type="range" min="135" max="1440" step="5" :value="effectiveMarker(selectedHotspot as VideoMarker).height ?? 360" @input="(e:any) => updateVideoPanelSize('height', e.target.value)">
                  <input class="video-size-number" type="number" min="135" max="1440" step="5" :value="effectiveMarker(selectedHotspot as VideoMarker).height ?? 360" @change="(e:any) => updateVideoPanelSize('height', e.target.value)">
                </div>
                <label class="video-ratio-lock">
                  <input v-model="lockVideoAspectRatio" type="checkbox">
                  Giữ nguyên tỉ lệ khung hình
                </label>
                <div class="hint-text">Kích thước hiện tại: {{ effectiveMarker(selectedHotspot as VideoMarker).width ?? 640 }} × {{ effectiveMarker(selectedHotspot as VideoMarker).height ?? 360 }} px</div>
              </div>

              <div class="field">
                <label>Xoay ngang (Y) <span class="field-badge">{{ Math.round((effectiveMarker(selectedHotspot as VideoMarker).rotY ?? 0) * 180 / Math.PI) }}°</span></label>
                <div class="rotation-control">
                  <input type="range" min="-90" max="90" step="1" :value="Math.round((effectiveMarker(selectedHotspot as VideoMarker).rotY ?? 0) * 180 / Math.PI)" @input="(e:any) => setVideoRotation('rotY', e.target.value)">
                  <button class="reset-btn" type="button" title="Về 0°" @click="setVideoRotation('rotY', 0)">↺</button>
                </div>
                <div class="hint-text">Quay cạnh trái hoặc phải của màn hình ra xa người xem.</div>
              </div>
              <div class="field">
                <label>Nghiêng (X) <span class="field-badge">{{ Math.round((effectiveMarker(selectedHotspot as VideoMarker).rotX ?? 0) * 180 / Math.PI) }}°</span></label>
                <div class="rotation-control">
                  <input type="range" min="-90" max="90" step="1" :value="Math.round((effectiveMarker(selectedHotspot as VideoMarker).rotX ?? 0) * 180 / Math.PI)" @input="(e:any) => setVideoRotation('rotX', e.target.value)">
                  <button class="reset-btn" type="button" title="Về 0°" @click="setVideoRotation('rotX', 0)">↺</button>
                </div>
                <div class="hint-text">Ngả màn hình lên hoặc xuống trong không gian 3D.</div>
              </div>
              <div class="field">
                <label>Xoay mặt phẳng (Z) <span class="field-badge">{{ Math.round((effectiveMarker(selectedHotspot as VideoMarker).rotZ ?? 0) * 180 / Math.PI) }}°</span></label>
                <div class="rotation-control">
                  <input type="range" min="-180" max="180" step="1" :value="Math.round((effectiveMarker(selectedHotspot as VideoMarker).rotZ ?? 0) * 180 / Math.PI)" @input="(e:any) => setVideoRotation('rotZ', e.target.value)">
                  <button class="reset-btn" type="button" title="Về 0°" @click="setVideoRotation('rotZ', 0)">↺</button>
                </div>
                <div class="hint-text">Xoay panel theo chiều kim đồng hồ hoặc ngược lại.</div>
              </div>
            </template>

            <template v-if="selectedHotspot.plugin === 'model3d'">
              <div class="field">
                <label>Ảnh 3D / ảnh 360° của vật thể</label>
                <button class="model-image-picker" type="button" @click="modelImageInput?.click()">
                  <img v-if="(selectedHotspot as Model3DMarker).image" :src="(selectedHotspot as Model3DMarker).image" alt="Ảnh vật thể">
                  <span v-else>Chọn ảnh được người thiết kế chuẩn bị</span>
                </button>
                <input :value="(selectedHotspot as Model3DMarker).image" type="text" placeholder="/uploads/... hoặc https://..." @input="(e:any) => { (selectedHotspot as Model3DMarker).image = e.target.value; markDirty(); }">
              </div>
              <div class="field">
                <label>Mô tả vật thể</label>
                <textarea :value="(selectedHotspot as Model3DMarker).content" placeholder="Tên tác phẩm, chất liệu, tác giả..." @input="(e:any) => { (selectedHotspot as Model3DMarker).content = e.target.value; markDirty(); }" />
              </div>
              <div class="hint-text">Ứng dụng chỉ hiển thị ảnh do người thiết kế cung cấp, không tự tạo mô hình 3D.</div>
            </template>

            <!-- Position Yaw & Pitch -->
            <div class="field-row">
              <div class="field">
                <label>Yaw (rad)</label>
                <input
                  :value="selectedHotspot.yaw.toFixed(2)"
                  type="number"
                  step="0.05"
                  @change="(e: any) => {
                    selectedHotspot!.yaw = parseFloat(e.target.value);
                    syncMarkersToViewer();
                    markDirty();
                  }"
                >
              </div>
              <div class="field">
                <label>Pitch (rad)</label>
                <input
                  :value="selectedHotspot.pitch.toFixed(2)"
                  type="number"
                  step="0.05"
                  @change="(e: any) => {
                    selectedHotspot!.pitch = parseFloat(e.target.value);
                    syncMarkersToViewer();
                    markDirty();
                  }"
                >
              </div>
            </div>
            <div class="hint-text">💡 Kéo trực tiếp điểm tương tác trên ảnh panorama để đổi vị trí.</div>
          </div>
        </template>

        <!-- ── TAB 3: CÀI ĐẶT (TÙY CHỈNH PROJECT) ── -->
        <template v-else-if="editorMode === 'panorama' && currentTab === 'settings' && tour">
          <div class="insp-section">
            <div class="insp-section-title">Chế độ tour</div>
            <div class="field">
              <label>Kiểu trải nghiệm</label>
              <select
                :value="tour.mode ?? 'free'"
                @change="(e: any) => {
                  tour!.mode = e.target.value;
                  markDirty();
                }"
              >
                <option value="free">Tự do khám phá</option>
                <option value="guided">Có hướng dẫn (tự chuyển cảnh)</option>
              </select>
            </div>
            <div class="field">
              <label>Thời gian mỗi cảnh (giây)</label>
              <input
                :value="tour.guidedDuration ?? 8"
                type="number"
                min="3"
                max="60"
                @input="(e: any) => {
                  tour!.guidedDuration = parseInt(e.target.value) || 8;
                  markDirty();
                }"
              >
            </div>
            <div class="hint-text">Ở chế độ có hướng dẫn, tour tự động chuyển sang cảnh tiếp theo sau thời gian này.</div>
          </div>

          <div class="insp-section">
            <div class="insp-section-title">Cảnh bắt đầu</div>
            <div class="field">
              <select
                :value="tour.initialSceneId ?? tour.scenes[0]?.id"
                @change="(e: any) => {
                  tour!.initialSceneId = e.target.value;
                  markDirty();
                }"
              >
                <option
                  v-for="s in tour.scenes"
                  :key="s.id"
                  :value="s.id"
                >
                  {{ s.title }}
                </option>
              </select>
            </div>
          </div>

          <div class="insp-section">
            <div class="insp-section-title">Tùy chọn hiển thị</div>
            <div class="toggle-row">
              <label>Tự động xoay ảnh</label>
              <UiSwitch
                :model-value="!!tour.autoRotate"
                @update:model-value="(val) => {
                  tour!.autoRotate = val;
                  markDirty();
                }"
              />
            </div>
            <div class="toggle-row">
              <label>Hiện bản đồ nhỏ</label>
              <UiSwitch
                :model-value="tour.showMinimap !== false"
                @update:model-value="(val) => {
                  tour!.showMinimap = val;
                  markDirty();
                }"
              />
            </div>
          </div>
        </template>

        <!-- ── CHẾ ĐỘ VÙNG SÁNG ── -->
        <template v-else-if="editorMode === 'highlight' && currentScene">
          <div class="map-mode-heading">
            <strong>Biên tập vùng sáng</strong>
            <span>Vẽ và kéo các node trực tiếp trên panorama</span>
          </div>

          <div class="insp-section">
            <template v-if="!isDrawingArea">
              <div class="field">
                <label>Kiểu vùng mới</label>
                <select v-model="newAreaMode">
                  <option value="fill-outline">Tô khu vực và sáng đường viền</option>
                  <option value="fill">Chỉ tô sáng khu vực</option>
                  <option value="outline">Chỉ tô sáng đường viền</option>
                </select>
              </div>
              <div v-if="newAreaMode !== 'fill'" class="field">
                <label>Độ rộng viền ban đầu <span class="field-badge">{{ newAreaLineWidth }} px</span></label>
                <input v-model.number="newAreaLineWidth" type="range" min="1" max="24" step="1">
              </div>
            </template>
            <button class="btn-block primary" type="button" @click="toggleAreaDrawing">
              {{ isDrawingArea ? `Hoàn tất và lưu vùng (${areaDraftPoints.length} node)` : '＋ Tạo vùng' }}
            </button>
            <button v-if="isDrawingArea" class="btn-block mt-2" type="button" @click="cancelAreaDrawing">Hủy tạo vùng</button>
            <div class="hint-text">Chọn kiểu trước, sau đó chấm ít nhất 3 node. Sau khi tạo, kéo trực tiếp các node trắng lớn để sửa điểm vẽ sai.</div>
          </div>

          <div class="insp-section">
            <div class="insp-section-title">Vùng đã tạo ({{ currentScene.areaHighlights?.length ?? 0 }})</div>
            <div v-if="!currentScene.areaHighlights?.length" class="empty-state-mini">Chưa có vùng sáng.</div>
            <div v-else class="area-tree">
              <div
                v-for="(area, index) in currentScene.areaHighlights"
                :key="area.id"
                class="area-tree-group"
              >
                <button
                  type="button"
                  class="map-node-item area-list-item"
                  :class="{ active: area.id === selectedAreaId }"
                  @click="selectArea(area)"
                >
                  <span class="area-tree-chevron">{{ area.id === selectedAreaId ? '▾' : '▸' }}</span>
                  <span class="map-node-dot" :style="{ background: area.color ?? '#22c55e' }" />
                  <span class="map-node-name">Vùng {{ index + 1 }}</span>
                  <span class="map-node-coords">{{ area.points.length }} node</span>
                </button>

                <div v-if="area.id === selectedAreaId" class="area-tree-nodes">
                  <button
                    v-for="(point, pointIndex) in area.points"
                    :key="pointIndex"
                    type="button"
                    class="map-node-item area-node-item"
                    :class="{ active: selectedAreaPoint?.areaId === area.id && selectedAreaPoint.pointIndex === pointIndex }"
                    @click="selectAreaNode(area.id, pointIndex)"
                  >
                    <span
                      class="map-node-dot"
                      :style="selectedAreaPoint?.areaId === area.id && selectedAreaPoint.pointIndex === pointIndex ? { background: '#ff8a00' } : undefined"
                    />
                    <span class="map-node-name">Node {{ pointIndex + 1 }}</span>
                    <span class="map-node-coords">{{ (point.yaw * RAD_TO_DEG).toFixed(1) }}° / {{ (point.pitch * RAD_TO_DEG).toFixed(1) }}°</span>
                    <span
                      class="hotspot-row-delete"
                      role="button"
                      tabindex="0"
                      @click.stop="removeAreaPoint(area, pointIndex)"
                    >×</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <template v-if="selectedArea">
            <div class="insp-section">
              <div class="insp-section-title">Kiểu làm nổi bật</div>
              <div class="field">
                <label>Thành phần hiển thị</label>
                <select v-model="selectedArea.mode" @change="updateSelectedArea">
                  <option value="fill-outline">Tô khu vực và sáng đường viền</option>
                  <option value="fill">Chỉ tô sáng khu vực</option>
                  <option value="outline">Chỉ làm sáng đường viền</option>
                </select>
              </div>
              <div class="field-row">
                <div v-if="selectedArea.mode !== 'outline'" class="field">
                  <label>Màu khu vực</label>
                  <input v-model="selectedArea.color" type="color" @input="updateSelectedArea">
                </div>
                <div v-if="selectedArea.mode !== 'fill'" class="field">
                  <label>Màu đường viền</label>
                  <input v-model="selectedArea.outlineColor" type="color" @input="updateSelectedArea">
                </div>
              </div>
              <div v-if="selectedArea.mode !== 'outline'" class="field">
                <label>Độ sáng vùng <span class="field-badge">{{ Math.round((selectedArea.opacity ?? 0.34) * 100) }}%</span></label>
                <input v-model.number="selectedArea.opacity" type="range" min="0.05" max="0.9" step="0.05" @input="updateSelectedArea">
              </div>
              <div v-if="selectedArea.mode !== 'fill'" class="field">
                <label>Độ rộng đường sáng <span class="field-badge">{{ selectedArea.lineWidth ?? 5 }} px</span></label>
                <input v-model.number="selectedArea.lineWidth" type="range" min="1" max="24" step="1" @input="updateSelectedArea">
              </div>
              <div class="field">
                <label>Thời gian chạy đường sáng <span class="field-badge">{{ selectedArea.durationMs ?? 1400 }} ms</span></label>
                <input v-model.number="selectedArea.durationMs" type="range" min="400" max="4000" step="100" @input="updateSelectedArea">
              </div>
              <div class="hint-text">Đường sáng chạy hết chu vi, sau đó vùng được giữ sáng trong 3 giây rồi tắt hoàn toàn. Trong trình chỉnh sửa, vùng luôn hiện để bạn căn node.</div>
            </div>

            <div class="insp-section">
              <div class="insp-section-title">Thao tác node</div>
              <button
                class="btn-block"
                type="button"
                @click="startAreaPointPlacement(selectedArea.id)"
              >
                {{ areaPointTargetId === selectedArea.id ? 'Đang chờ vị trí…' : '＋ Thêm node bằng click' }}
              </button>
              <div class="hint-text">Chọn node ngay trong cây “Vùng đã tạo” ở phía trên. Node được chọn sẽ chuyển màu cam trên panorama và có thể kéo.</div>
              <button class="btn-block danger mt-2" type="button" @click="deleteArea(selectedArea.id)">Xóa vùng này</button>
            </div>
          </template>
        </template>

        <!-- ── TAB 4: BẢN ĐỒ ── -->
        <template v-else-if="editorMode === 'map' && tour">
          <div class="map-mode-heading">
            <strong>Bản đồ vị trí thực</strong>
            <span>GPS của từng cảnh panorama</span>
          </div>
          <div class="insp-section">
            <div class="insp-section-title">Cảnh đang đặt</div>
            <div class="geo-current-scene">{{ currentScene?.title }}</div>
            <div v-if="currentScene" class="toggle-row">
              <label>Hiện cố định trên bản đồ</label>
              <UiSwitch
                :model-value="currentScene.showOnMap === true"
                @update:model-value="(value) => { currentScene!.showOnMap = value; markDirty(); }"
              />
            </div>
            <div class="field-row">
              <div class="field">
                <label>Kinh độ</label>
                <input type="number" step="0.000001" :value="currentScene?.coordinates?.[0] ?? ''" placeholder="108.2022" @change="(event: any) => setCurrentGeoCoordinate('lng', event.target.value)">
              </div>
              <div class="field">
                <label>Vĩ độ</label>
                <input type="number" step="0.000001" :value="currentScene?.coordinates?.[1] ?? ''" placeholder="16.0544" @change="(event: any) => setCurrentGeoCoordinate('lat', event.target.value)">
              </div>
            </div>
            <div class="hint-text">Tọa độ luôn dùng cho vị trí và hướng camera. Chỉ cảnh bật “Hiện cố định” mới xuất hiện khi nó không phải cảnh hiện tại.</div>
          </div>
          <div class="insp-section" v-if="currentScene">
            <div class="insp-section-title">Xoay panorama trên bản đồ</div>
            <div class="brightness-control">
              <input
                type="range"
                min="-180"
                max="180"
                step="1"
                :value="(currentScene.panoramaRotation ?? 0) * RAD_TO_DEG"
                @input="setCurrentPanoramaRotation(Number(($event.target as HTMLInputElement).value))"
              >
              <output>{{ Math.round((currentScene.panoramaRotation ?? 0) * RAD_TO_DEG) }}°</output>
            </div>
            <div class="field mt-2">
              <label>Góc xoay chính xác</label>
              <input
                type="number"
                min="-180"
                max="180"
                step="0.1"
                :value="((currentScene.panoramaRotation ?? 0) * RAD_TO_DEG).toFixed(1)"
                @change="setCurrentPanoramaRotation(Number(($event.target as HTMLInputElement).value))"
              >
            </div>
            <div class="brightness-presets">
              <button type="button" @click="setCurrentPanoramaRotation(-90)">-90°</button>
              <button type="button" @click="setCurrentPanoramaRotation(0)">Đặt lại</button>
              <button type="button" @click="setCurrentPanoramaRotation(90)">+90°</button>
            </div>
            <div class="hint-text">Giá trị này xoay chính panorama và toàn bộ marker của cảnh. Nó không thay đổi camera.</div>
          </div>
          <div class="insp-section">
            <div class="insp-section-title">Các cảnh trên bản đồ</div>
            <button v-for="(scene, index) in tour.scenes" :key="scene.id" type="button" class="geo-scene-row" :class="{ active: scene.id === currentScene?.id }" @click="goToScene(index)">
              <span class="map-node-dot" :style="{ background: scene.coordinates ? '#3b82f6' : '#64748b' }" />
              <span>{{ scene.title }}</span>
              <small>{{ scene.coordinates ? `${scene.showOnMap === true ? 'Hiện' : 'Ẩn'} · ${scene.coordinates[1].toFixed(5)}, ${scene.coordinates[0].toFixed(5)}` : 'Chưa đặt' }}</small>
            </button>
          </div>

          <div v-if="false">
          <div class="insp-section">
            <div class="insp-section-title">Trình chỉnh sửa bản đồ</div>

            <!-- Floor tabs -->
            <div v-if="tour.map && tour.map.floors.length > 1" class="map-editor-floor-tabs">
              <button
                v-for="f in tour.map.floors" :key="f.id"
                type="button"
                :class="['map-floor-tab', { active: mapActiveFloorId === f.id }]"
                @click="mapActiveFloorId = f.id"
              >
                {{ f.shortName ?? f.name }}
              </button>
            </div>

            <!-- Canvas editor -->
            <div class="map-editor-canvas-wrap">
              <canvas
                ref="mapEditorCanvas"
                @pointerdown="mapEditorPointerDown"
                @pointermove="mapEditorPointerMove"
                @pointerup="mapEditorPointerUp"
                @pointercancel="mapEditorPointerUp"
                style="cursor:grab;border-radius:8px"
              />
              <div class="map-editor-hint">Bấm lên ảnh để đặt cảnh hiện tại · Kéo điểm để chỉnh vị trí</div>
            </div>

            <!-- Auto-connect button -->
            <button type="button" class="btn-fill-thumb" style="margin-top:8px" @click="autoConnectNodes">
              🔗 Tự động kết nối từ navigation markers
            </button>
          </div>

          <!-- Floor settings -->
          <div v-if="mapActiveFloor" class="insp-section">
            <div class="insp-section-title">Tầng: {{ mapActiveFloor.name }}</div>

            <div class="field">
              <label>Tên tầng</label>
              <input
                :value="mapActiveFloor.name"
                type="text"
                @change="(e: any) => { mapActiveFloor!.name = e.target.value; markDirty(); }"
              >
            </div>

            <div class="field">
              <label>Tên ngắn (hiện trên tab)</label>
              <input
                :value="mapActiveFloor.shortName ?? ''"
                type="text"
                placeholder="VD: Sân, Xưởng..."
                @change="(e: any) => { mapActiveFloor!.shortName = e.target.value || undefined; markDirty(); }"
              >
            </div>

            <div class="field">
              <label>Ảnh nền (floorplan)</label>
              <label class="map-image-upload">
                <input type="file" accept="image/jpeg,image/png,image/webp" :disabled="mapImageUploading" @change="uploadMapFloorImage">
                <span>{{ mapImageUploading ? 'Đang tải ảnh…' : 'Tải ảnh mặt bằng' }}</span>
              </label>
              <input
                :value="mapActiveFloor.imageUrl ?? ''"
                type="text"
                placeholder="/maps/tang1.svg hoặc để trống"
                @change="(e: any) => { mapActiveFloor!.imageUrl = e.target.value || ''; mapEditorImages.delete(mapActiveFloor!.id); markDirty(); drawMapEditor(); }"
              >
              <div class="hint-text">Ảnh được dùng làm nền thật của map. Sau khi tải, chọn cảnh rồi bấm vị trí tương ứng trên ảnh.</div>
            </div>
          </div>

          <!-- Map global settings -->
          <div class="insp-section">
            <div class="insp-section-title">Cấu hình map</div>

            <div class="field">
              <label>Vị trí</label>
              <select
                :value="tour.map?.position ?? 'bottom-left'"
                @change="(e: any) => { if (tour.value?.map) tour.value.map.position = e.target.value; markDirty(); }"
              >
                <option value="bottom-right">Dưới phải</option>
                <option value="bottom-left">Dưới trái</option>
                <option value="top-right">Trên phải</option>
                <option value="top-left">Trên trái</option>
              </select>
            </div>

            <div class="field">
              <label>
                Kích thước
                <span class="field-badge">{{ tour.map?.width ?? 280 }}×{{ tour.map?.height ?? 200 }}</span>
              </label>
              <div class="rotation-control">
                <input type="range" min="200" max="500" step="10"
                  :value="tour.map?.width ?? 280"
                  @input="(e: any) => { if (tour.value?.map) { tour.value.map.width = Number(e.target.value); markDirty(); } }"
                >
              </div>
            </div>

            <div class="toggle-row">
              <label>Hiện đường nối</label>
              <UiSwitch
                :model-value="tour.map?.showConnections !== false"
                @update:model-value="(val) => { if (tour.value?.map) { tour.value.map.showConnections = val; markDirty(); } }"
              />
            </div>

            <div class="toggle-row">
              <label>Hiện mũi tên camera</label>
              <UiSwitch
                :model-value="tour.map?.showCameraArrow !== false"
                @update:model-value="(val) => { if (tour.value?.map) { tour.value.map.showCameraArrow = val; markDirty(); } }"
              />
            </div>

            <div class="toggle-row">
              <label>Click node = chuyển cảnh</label>
              <UiSwitch
                :model-value="tour.map?.clickToNavigate !== false"
                @update:model-value="(val) => { if (tour.value?.map) { tour.value.map.clickToNavigate = val; markDirty(); } }"
              />
            </div>

            <div class="toggle-row">
              <label>Tự chuyển tầng</label>
              <UiSwitch
                :model-value="tour.map?.autoSwitchFloor !== false"
                @update:model-value="(val) => { if (tour.value?.map) { tour.value.map.autoSwitchFloor = val; markDirty(); } }"
              />
            </div>
          </div>

          <!-- Node list -->
          <div v-if="mapActiveFloor" class="insp-section">
            <div class="insp-section-title">Nodes ({{ mapActiveFloor.nodes.length }})</div>
            <div class="map-node-list">
              <div v-for="node in mapActiveFloor.nodes" :key="node.id" class="map-node-item"
                :class="{ active: node.id === currentScene?.id }">
                <span class="map-node-dot" :style="{ background: node.id === currentScene?.id ? '#f59e0b' : 'rgba(255,255,255,0.5)' }" />
                <span class="map-node-name">{{ (node as any).name || node.id }}</span>
                <span class="map-node-coords">{{ node.x }}, {{ node.y }}</span>
              </div>
            </div>
          </div>
          </div>
        </template>

      </div>
    </aside>

  </div>

  <!-- ═══ MODAL: Chọn loại điểm tương tác ═══ -->
  <div class="modal-backdrop" :class="{ open: showHotspotModal }" @click.self="cancelPlacing">
    <div class="modal">
      <div class="modal-head">
        <div><span class="modal-eyebrow">Điểm tương tác mới</span><h3>Chọn hành động khi người xem nhấn vào</h3></div>
        <button class="modal-close" @click="cancelPlacing">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="type-grid">
          <div class="type-card nav" @click="createHotspot('navigation')">
            <div class="type-card-icon nav">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 4 L12 18" />
                <path d="M6 11 L12 5 L18 11" />
              </svg>
            </div>
            <strong>Chuyển cảnh</strong>
            <span>Đi tới một ảnh panorama khác</span>
          </div>
          <div class="type-card video" @click="createHotspot('video')">
            <div class="type-card-icon video"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
            <strong>Xem video</strong><span>Mở video giới thiệu hoặc tư liệu</span>
          </div>
          <div class="type-card info" @click="createHotspot('panel')">
            <div class="type-card-icon info">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <path d="M8 9h8M8 13h8M8 17h5" />
              </svg>
            </div>
            <strong>Panel nội dung</strong>
            <span>Kết hợp văn bản, ảnh 3D, âm thanh và AI</span>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="tb-btn" @click="cancelPlacing">Hủy</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.alignment-mode-switch{margin-left:8px;border-color:rgba(245,158,11,.35)}
.alignment-mode-switch button.active{background:#f59e0b;color:#111827}
.device-mode-switch{border-color:rgba(34,197,94,.35)}
.device-mode-switch button{min-width:72px}
.device-mode-switch button.active{background:#16a34a;color:#fff;box-shadow:0 3px 10px rgba(22,163,74,.3)}
.mobile-device-picker{display:flex;align-items:center;gap:7px;height:34px;padding:0 7px;border:1px solid rgba(34,197,94,.28);border-radius:8px;background:rgba(15,23,42,.62)}.mobile-device-picker select{width:155px;border:0;outline:0;color:#dcfce7;background:transparent;font-size:10.5px;font-weight:650;cursor:pointer}.mobile-device-picker select option{color:#e5e7eb;background:#1b1f26}.mobile-device-picker span{padding-left:7px;border-left:1px solid rgba(255,255,255,.1);color:#86efac;font:9.5px/1 monospace;white-space:nowrap}
.view-settings-menu{position:relative;flex:0 0 auto;color:#cbd5e1}.view-settings-menu>summary{display:flex;align-items:center;gap:7px;height:34px;padding:0 10px;border:1px solid rgba(96,165,250,.3);border-radius:8px;background:rgba(15,23,42,.62);font-size:11px;font-weight:650;white-space:nowrap;cursor:pointer;list-style:none}.view-settings-menu>summary::-webkit-details-marker{display:none}.view-settings-menu>summary:hover,.view-settings-menu[open]>summary{border-color:#3b82f6;background:rgba(37,99,235,.15);color:#fff}.view-settings-menu>summary svg{width:15px;height:15px}.view-settings-menu .menu-chevron{width:12px;transition:transform .15s}.view-settings-menu[open] .menu-chevron{transform:rotate(180deg)}
.view-settings-popover{position:absolute;z-index:80;top:calc(100% + 9px);left:0;width:330px;padding:12px;border:1px solid rgba(255,255,255,.14);border-radius:11px;background:#1b1f26;box-shadow:0 18px 48px rgba(0,0,0,.48)}.view-settings-head{display:flex;align-items:center;justify-content:space-between;padding:1px 2px 10px;border-bottom:1px solid rgba(255,255,255,.08)}.view-settings-head strong{font-size:12px;color:#fff}.view-settings-head span{padding:3px 7px;border-radius:999px;background:rgba(34,197,94,.14);color:#86efac;font-size:9px;font-weight:700}.view-setting-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:11px 2px;border-bottom:1px solid rgba(255,255,255,.07)}.view-setting-row label{display:flex;align-items:center;gap:9px;min-width:0;cursor:pointer}.view-setting-row input{width:15px;height:15px;flex:0 0 auto;accent-color:#3b82f6}.view-setting-row label span{display:flex;min-width:0;flex-direction:column;gap:3px}.view-setting-row strong{font-size:11px;color:#f8fafc}.view-setting-row small{color:#94a3b8;font-size:9.5px;font-variant-numeric:tabular-nums}.view-setting-row button{padding:6px 9px;border-radius:6px;background:#2563eb;color:#fff;font-size:10px;font-weight:700}.view-setting-row button:hover{background:#3b82f6}.view-setting-row button:disabled{opacity:.55}.inherit-desktop-view{width:100%;margin-top:10px;padding:7px;border:1px solid rgba(34,197,94,.28);border-radius:6px;color:#86efac;background:rgba(34,197,94,.08);font-size:10px;font-weight:650}.inherit-desktop-view:hover{background:rgba(34,197,94,.14)}
.marker-device-notice{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 11px;border:1px solid rgba(34,197,94,.28);border-radius:8px;background:rgba(34,197,94,.08)}.marker-device-notice>div{display:flex;min-width:0;flex-direction:column;gap:3px}.marker-device-notice strong{color:#bbf7d0;font-size:11px}.marker-device-notice span{color:#94a3b8;font-size:9.5px;line-height:1.45}.marker-device-notice button{flex:0 0 auto;padding:6px 8px;border:1px solid rgba(34,197,94,.3);border-radius:6px;color:#86efac;background:rgba(15,23,42,.42);font-size:9.5px;font-weight:650}.marker-device-notice button:hover{background:rgba(34,197,94,.15)}
.panorama-rotation-hint{position:absolute;z-index:25;left:50%;bottom:66px;transform:translateX(-50%);padding:9px 15px;border:1px solid rgba(245,158,11,.5);border-radius:999px;background:rgba(15,23,42,.88);color:#fbbf24;font-size:12px;font-weight:600;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.3)}
/* ═══ ROOT LAYOUT ═══ */
.admin-studio {
  display: grid;
  grid-template-columns: 300px 1fr 340px;
  grid-template-rows: 56px 1fr;
  height: 100vh;
  gap: 1px;
  background: rgba(255, 255, 255, 0.08);
  font-family: 'Be Vietnam Pro', system-ui, sans-serif;
  color: #ffffff;
  font-size: 14px;
}

.admin-studio > * {
  background: #141414;
}

/* ═══ TOPBAR ═══ */
.topbar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  background: #141414 !important;
}

.tb-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 16px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  height: 32px;
}

.tb-logo-mark {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1f6f8b, #155d75);
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 14px;
  box-shadow: 0 0 0 3px rgba(31, 111, 139, 0.15);
}

.tb-logo-text {
  font-size: 13px;
  line-height: 1.2;
}

.tb-logo-text strong {
  display: block;
  font-weight: 600;
}

.tb-logo-text span {
  color: rgba(255, 255, 255, 0.42);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tb-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.42);
}

.tb-breadcrumb strong {
  color: #ffffff;
  font-weight: 500;
}

.tb-breadcrumb svg {
  width: 12px;
  height: 12px;
  opacity: 0.4;
}

.tb-spacer {
  flex: 1;
}

.tb-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.tb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
  white-space: nowrap;
}

.tb-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.16);
}

.tb-btn svg {
  width: 14px;
  height: 14px;
}

.tb-btn.primary {
  background: #1f6f8b;
  border-color: #1f6f8b;
  color: #fff;
}

.tb-btn.primary:hover {
  background: #2d8fb0;
  border-color: #2d8fb0;
}

.save-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.42);
  padding: 0 12px;
}

.save-indicator .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
}

.save-indicator.saving .dot {
  background: #c9a227;
  animation: pulse 1s infinite;
}

.save-indicator.dirty .dot {
  background: #a8583f;
}

@keyframes pulse {
  50% { opacity: 0.4; }
}

/* ═══ SIDEBAR TRÁI — SCENE LIST ═══ */
.sidebar-left {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.side-head {
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.side-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.side-head h3 {
  font-size: 13px;
  font-weight: 600;
}

.side-head p {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.42);
}

.side-head .scene-queue-status {
  margin-top: 7px;
  color: #7ec8e3;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.side-add {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: rgba(31, 111, 139, 0.2);
  border: 1px solid rgba(31, 111, 139, 0.35);
  color: #7ec8e3;
  display: grid;
  place-items: center;
  transition: all 0.15s;
}

.side-add:hover {
  background: rgba(31, 111, 139, 0.35);
  color: #fff;
}

.side-add svg {
  width: 14px;
  height: 14px;
}

.scene-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.scene-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
  position: relative;
}

.scene-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.scene-item.active {
  background: rgba(31, 111, 139, 0.14);
  border-color: rgba(31, 111, 139, 0.4);
}

.scene-item.active::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 20%;
  bottom: 20%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: #1f6f8b;
}

.scene-item.drag-over {
  border-top: 2px solid #1f6f8b;
}

.scene-drag {
  cursor: grab;
  color: rgba(255, 255, 255, 0.25);
  padding: 0 2px;
  flex-shrink: 0;
}

.scene-drag svg {
  width: 12px;
  height: 12px;
}

.scene-thumb-sm {
  width: 44px;
  height: 30px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
  background: #000;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.scene-info {
  flex: 1;
  min-width: 0;
}

.scene-info strong {
  display: block;
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scene-info span {
  display: block;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.42);
  font-family: monospace;
  margin-top: 2px;
}

.scene-badge {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(201, 162, 39, 0.2);
  color: #c9a227;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* ═══ CENTER — PREVIEW ═══ */
.preview {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: #141414;
  flex-shrink: 0;
}
.editor-mode-switch { display:flex; padding:3px; border:1px solid rgba(255,255,255,.1); border-radius:8px; background:rgba(255,255,255,.04); }
.editor-mode-switch button { min-width:88px; padding:7px 13px; border-radius:6px; color:rgba(255,255,255,.52); font-size:11px; font-weight:650; }
.editor-mode-switch button.active { background:#2563eb; color:#fff; box-shadow:0 3px 10px rgba(37,99,235,.3); }
.workspace-mode-switch button{min-width:0;padding-inline:11px}.alignment-mode-switch button{min-width:0;padding-inline:10px}.device-mode-switch button{min-width:0;padding-inline:10px}
.map-mode-heading { display:flex; flex-direction:column; gap:3px; padding:2px 2px 12px; border-bottom:1px solid rgba(255,255,255,.08); }
.map-mode-heading strong { color:#fff; font-size:14px; }.map-mode-heading span { color:rgba(255,255,255,.45); font-size:10.5px; }
.geo-current-scene { margin-bottom:12px; padding:10px 12px; border-radius:7px; background:rgba(59,130,246,.12); color:#bfdbfe; font-size:12px; font-weight:600; }
.geo-scene-row { display:grid; grid-template-columns:10px minmax(0,1fr) auto; align-items:center; gap:8px; width:100%; padding:9px 8px; border-bottom:1px solid rgba(255,255,255,.06); color:rgba(255,255,255,.75); text-align:left; font-size:11px; }
.geo-scene-row:hover,.geo-scene-row.active { background:rgba(59,130,246,.12); color:#fff; }.geo-scene-row small { color:rgba(255,255,255,.38); font:9px monospace; }

.pt-tabs {
  display: flex;
  gap: 2px;
  background: rgba(255, 255, 255, 0.04);
  padding: 3px;
  border-radius: 6px;
}

.pt-tab {
  padding: 5px 12px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.42);
  transition: all 0.15s;
}

.pt-tab.active {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.pt-spacer {
  flex: 1;
}

.pt-zoom {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
}

.pt-zoom button {
  width: 26px;
  height: 26px;
  border-radius: 5px;
  color: rgba(255, 255, 255, 0.42);
  display: grid;
  place-items: center;
  transition: all 0.15s;
}

.pt-zoom button:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.pt-zoom svg {
  width: 14px;
  height: 14px;
}

.pt-zoom-label {
  font-size: 11px;
  font-family: monospace;
  color: rgba(255, 255, 255, 0.42);
  padding: 0 6px;
  min-width: 42px;
  text-align: center;
}

/* Preview canvas */
.preview-canvas {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #000;
}
.preview-canvas.mobile-preview {
  flex: 0 1 auto;
  align-self: center;
  width: min(var(--mobile-preview-width, 430px), calc(100% - 24px));
  height: auto;
  max-height: calc(100% - 24px);
  aspect-ratio: var(--mobile-preview-ratio, 430 / 932);
  margin: 12px;
  border: 1px solid rgba(255,255,255,.22);
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0,0,0,.55);
}

/* Hotspots in PSV */
:deep(.edit-hotspot) {
  position: relative;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  user-select: none;
}

:deep(.edit-hotspot.info) {
  width: 40px;
  height: 40px;
}

:deep(.edit-hotspot .hs-circle) {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: rgba(31, 111, 139, 0.9);
  border: 2.5px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 24px rgba(31, 111, 139, 0.6), 0 0 0 6px rgba(31, 111, 139, 0.2);
  display: grid;
  place-items: center;
  transition: all 0.15s;
}

:deep(.edit-hotspot.info .hs-circle) {
  background: rgba(168, 88, 63, 0.9);
  box-shadow: 0 4px 20px rgba(168, 88, 63, 0.55), 0 0 0 6px rgba(168, 88, 63, 0.18);
}

:deep(.edit-hotspot.selected .hs-circle) {
  box-shadow: 0 0 0 3px #c9a227, 0 6px 32px rgba(201, 162, 39, 0.6);
}

:deep(.edit-hotspot .hs-circle svg) {
  width: 18px;
  height: 18px;
}

:deep(.edit-hotspot .hs-label) {
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: rgba(10, 10, 10, 0.78);
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;
  border: 1px solid rgba(255, 255, 255, 0.1);
  pointer-events: none;
}

/* Preview bottom info */
.preview-info {
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(10, 10, 10, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  backdrop-filter: blur(14px);
  z-index: 6;
  pointer-events: none;
}

.preview-info-badge {
  font-size: 10px;
  font-family: monospace;
  padding: 3px 8px;
  background: rgba(31, 111, 139, 0.3);
  color: #7ec8e3;
  border-radius: 999px;
  font-weight: 600;
}

.preview-info-title {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
}

.preview-info-coord {
  font-size: 11px;
  font-family: monospace;
  color: rgba(255, 255, 255, 0.42);
}

/* Hint overlay */
.place-hint {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  background: rgba(201, 162, 39, 0.95);
  color: #1a1613;
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  z-index: 10;
  display: none;
  box-shadow: 0 8px 24px rgba(201, 162, 39, 0.4);
}

.place-hint.active {
  display: block;
  animation: hint-pulse 1.5s infinite;
}

@keyframes hint-pulse {
  0%, 100% { transform: translateX(-50%) scale(1); }
  50% { transform: translateX(-50%) scale(1.03); }
}

/* ═══ SIDEBAR PHẢI — INSPECTOR ═══ */
.inspector {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #141414 !important;
}

.insp-tabs {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  background: #141414;
}

.insp-tab {
  flex: 1;
  padding: 14px 8px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.42);
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}

.insp-tab:hover {
  color: rgba(255, 255, 255, 0.68);
}

.insp-tab.active {
  color: #ffffff;
  border-bottom-color: #1f6f8b;
}

.insp-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.insp-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.insp-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.68);
  font-weight: 500;
}

.field input[type="text"],
.field input[type="number"],
.field textarea,
.field select {
  width: 100%;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: #ffffff;
  font-size: 13px;
  outline: none;
  transition: all 0.15s;
}

.field input:focus,
.field textarea:focus,
.field select:focus {
  border-color: #1f6f8b;
  background: rgba(31, 111, 139, 0.08);
  box-shadow: 0 0 0 3px rgba(31, 111, 139, 0.15);
}

.field textarea {
  resize: vertical;
  min-height: 70px;
}

.field select option {
  background: #1c1c1c;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.hint-text {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.25);
  line-height: 1.5;
}

.brightness-control { display:grid; grid-template-columns:minmax(0,1fr) 52px; align-items:center; gap:12px; }
.brightness-control input[type='range'] { width:100%; accent-color:#f59e0b; }
.brightness-control output { padding:5px 7px; border:1px solid rgba(255,255,255,.1); border-radius:6px; background:#232833; color:#fbbf24; font:600 11px monospace; text-align:center; }
.brightness-presets { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
.brightness-presets button { padding:7px 5px; border:1px solid rgba(255,255,255,.08); border-radius:6px; background:#232833; color:rgba(255,255,255,.65); font-size:10.5px; transition:.15s; }
.brightness-presets button:hover { border-color:rgba(245,158,11,.5); color:#fff; background:rgba(245,158,11,.12); }
.sub-control-label { display:block; margin:12px 0 7px; color:rgba(255,255,255,.72); font-size:11px; font-weight:600; }

.video-panel-size { padding:10px; border:1px solid rgba(255,255,255,.08); border-radius:8px; background:rgba(255,255,255,.025); }
.video-size-presets { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
.video-size-presets button { padding:7px 5px; border:1px solid rgba(255,255,255,.1); border-radius:6px; background:#232833; color:rgba(255,255,255,.72); font-size:11px; cursor:pointer; }
.video-size-presets button:hover { border-color:rgba(220,38,38,.55); color:#fff; background:rgba(220,38,38,.14); }
.video-size-row { display:grid; grid-template-columns:34px minmax(0,1fr) 66px; align-items:center; gap:8px; }
.video-size-row > span { font-size:11px; color:rgba(255,255,255,.5); }
.video-size-row input[type='range'] { width:100%; accent-color:#dc2626; }
.field .video-size-number { padding:6px 7px; text-align:center; font-variant-numeric:tabular-nums; }
.video-ratio-lock { display:flex; align-items:center; gap:7px; cursor:pointer; }
.video-ratio-lock input { accent-color:#dc2626; }

/* Rotation control — slider + reset button inline */
.rotation-control {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rotation-control input[type="range"] {
  flex: 1;
  accent-color: #3b82f6;
  cursor: pointer;
}
.reset-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.7);
  font-size: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.reset-btn:hover { background: rgba(255,255,255,0.14); color: #fff; }

/* Navigation icon mode toggle */
.nav-icon-mode-toggle {
  display: flex;
  gap: 6px;
}
.nav-mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.55);
  font: 500 12.5px/1 'Be Vietnam Pro', sans-serif;
  cursor: pointer;
  transition: all 0.15s ease;
}
.nav-mode-btn:hover {
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.8);
}
.nav-mode-btn.active {
  background: rgba(59,130,246,0.18);
  border-color: rgba(59,130,246,0.5);
  color: #93c5fd;
}

/* Fill thumbnail button */
.btn-fill-thumb {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 14px;
  border: 1px dashed rgba(255,255,255,0.18);
  border-radius: 8px;
  background: rgba(255,255,255,0.03);
  color: rgba(255,255,255,0.65);
  font: 500 12.5px/1 'Be Vietnam Pro', sans-serif;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-fill-thumb:hover {
  background: rgba(59,130,246,0.1);
  border-color: rgba(59,130,246,0.3);
  color: #93c5fd;
}

/* Icon preview */
.nav-icon-preview-frame {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(255,255,255,0.2);
  background: rgba(0,0,0,0.3);
  margin-top: 6px;
}
.nav-icon-preview-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Pin color picker */
.pin-color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pin-color-row input[type="color"] {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  padding: 2px;
}
.pin-color-presets {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.pin-color-swatch {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255,255,255,0.15);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.12s ease;
  padding: 0;
}
.pin-color-swatch:hover {
  transform: scale(1.2);
  border-color: rgba(255,255,255,0.5);
}
.pin-color-swatch.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.25);
}

/* ── Map editor ── */
.map-editor-floor-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
}
.map-floor-tab {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.5);
  border-radius: 6px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  transition: all 0.15s ease;
}
.map-floor-tab:hover { background: rgba(255,255,255,0.08); }
.map-floor-tab.active {
  background: rgba(59,130,246,0.2);
  border-color: rgba(59,130,246,0.5);
  color: #93c5fd;
}
.map-image-upload { display:flex; align-items:center; justify-content:center; min-height:38px; margin-bottom:8px; border:1px dashed rgba(59,130,246,.55); border-radius:7px; background:rgba(59,130,246,.1); color:#bfdbfe; cursor:pointer; font-size:11px; font-weight:600; }
.map-image-upload:hover { background:rgba(59,130,246,.17); border-color:#60a5fa; }
.map-image-upload input { display:none; }
.map-editor-canvas-wrap {
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  overflow: hidden;
  background: #14151f;
}
.map-editor-canvas-wrap canvas {
  display: block;
  width: 100%;
}
.map-editor-hint {
  padding: 6px 10px;
  font-size: 10px;
  color: rgba(255,255,255,0.35);
  text-align: center;
  background: rgba(0,0,0,0.2);
}
.map-node-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.map-node-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 11px;
  color: rgba(255,255,255,0.6);
  transition: background 0.12s;
}
.map-node-item:hover { background: rgba(255,255,255,0.05); }
.map-node-item.active {
  background: rgba(245,158,11,0.08);
  color: #f59e0b;
}
.map-node-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.map-node-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.map-node-coords {
  font-size: 10px;
  opacity: 0.4;
  font-family: monospace;
}
.area-tree {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.area-tree-group {
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  background: rgba(255,255,255,0.02);
}
.area-list-item,
.area-node-item {
  width: 100%;
  border: 0;
  cursor: pointer;
  text-align: left;
}
.area-list-item {
  min-height: 38px;
  border-radius: 0;
  font-weight: 700;
}
.area-tree-chevron {
  width: 12px;
  color: rgba(255,255,255,0.48);
  flex-shrink: 0;
}
.area-tree-nodes {
  padding: 4px 4px 6px 22px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.area-node-item {
  min-height: 34px;
  border-radius: 5px;
}
.area-node-item .map-node-dot {
  width: 11px;
  height: 11px;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.18);
}
.area-node-item.active .map-node-dot {
  box-shadow: 0 0 0 3px rgba(255,138,0,0.25), 0 0 12px rgba(255,138,0,0.8);
}

/* Badge next to label showing current value */
.field-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 10px;
  background: rgba(59,130,246,0.22);
  color: #93c5fd;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  vertical-align: middle;
}


/* Image picker */
.img-picker {
  position: relative;
  width: 100%;
  aspect-ratio: 16/10;
  border-radius: 6px;
  overflow: hidden;
  border: 1px dashed rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: all 0.15s;
}

.img-picker:hover {
  border-color: #1f6f8b;
  background: rgba(31, 111, 139, 0.06);
}

.img-picker img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.img-picker-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s;
  font-size: 12px;
}

.img-picker:hover .img-picker-overlay {
  opacity: 1;
}

.img-picker-overlay svg {
  width: 20px;
  height: 20px;
}

.image-error, .model-image-picker {
  width: 100%; height: 100%; display: grid; place-items: center;
  padding: 18px; text-align: center; color: rgba(255,255,255,.52);
}
.model-image-picker { min-height: 150px; border: 1px dashed rgba(255,255,255,.16); border-radius: 8px; background: rgba(255,255,255,.025); overflow: hidden; }
.model-image-picker:hover { border-color: #9333ea; }
.model-image-picker img { width: 100%; max-height: 220px; object-fit: contain; }

/* Hotspot list */
.hotspot-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hotspot-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  font-size: 12px;
}

.hotspot-row:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.16);
}

.hotspot-row.selected {
  background: rgba(31, 111, 139, 0.14);
  border-color: rgba(31, 111, 139, 0.4);
}

.hotspot-row-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.hotspot-row-icon.nav {
  background: rgba(31, 111, 139, 0.25);
  color: #7ec8e3;
}

.hotspot-row-icon.info {
  background: rgba(168, 88, 63, 0.25);
  color: #e0a58b;
}
.hotspot-row-icon.video { background: rgba(239,68,68,.22); color: #fca5a5; }
.hotspot-row-icon.model3d { background: rgba(168,85,247,.22); color: #d8b4fe; }

.hotspot-row-icon svg {
  width: 12px;
  height: 12px;
}

.hotspot-row-name {
  flex: 1;
  font-weight: 500;
}

.hotspot-row-delete {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.25);
  display: grid;
  place-items: center;
  transition: all 0.15s;
}

.hotspot-row-delete:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}

.hotspot-row-delete svg {
  width: 12px;
  height: 12px;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 24px 16px;
  color: rgba(255, 255, 255, 0.25);
  font-size: 12px;
  line-height: 1.6;
}

.empty-state svg {
  width: 32px;
  height: 32px;
  margin: 0 auto 8px;
  opacity: 0.3;
}

/* Buttons */
.btn-block {
  width: 100%;
  padding: 9px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s;
}

.btn-block:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.16);
}

.btn-block svg {
  width: 14px;
  height: 14px;
}

.btn-block.primary {
  background: rgba(31, 111, 139, 0.2);
  border-color: rgba(31, 111, 139, 0.4);
  color: #7ec8e3;
}

.btn-block.primary:hover {
  background: rgba(31, 111, 139, 0.35);
  color: #fff;
}

.btn-block.danger {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.btn-block.danger:hover {
  background: rgba(239, 68, 68, 0.22);
  color: #fff;
}

/* Toggle row */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.toggle-row label {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.68);
}

/* ═══ PREVIEW MODE — Hide sidebars & toolbar ═══ */
.admin-studio.preview-mode {
  grid-template-columns: 1fr;
  grid-template-rows: 56px 1fr;
}

.admin-studio.preview-mode .sidebar-left,
.admin-studio.preview-mode .inspector,
.admin-studio.preview-mode .preview-toolbar {
  display: none !important;
}

/* ═══ MODAL ═══ */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(6px);
  z-index: 200;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-backdrop.open {
  display: flex;
}

.modal {
  background: #1c1c1c;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 14px;
  max-width: 480px;
  width: 100%;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  color: #fff;
}

.modal-head {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-head h3 {
  font-size: 15px;
  font-weight: 600;
}
.modal-eyebrow { display:block; margin-bottom:3px; color:#60a5fa; font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-foot {
  padding: 14px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.modal-close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.42);
  display: grid;
  place-items: center;
  transition: all 0.15s;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.modal-close svg {
  width: 14px;
  height: 14px;
}

.type-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.type-card {
  padding: 16px;
  border-radius: 10px;
  border: 1.5px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}

.type-card:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
}

.type-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  margin: 0 auto 10px;
  display: grid;
  place-items: center;
}

.type-card-icon.nav {
  background: rgba(31, 111, 139, 0.3);
  color: #7ec8e3;
}

.type-card-icon.info {
  background: rgba(168, 88, 63, 0.3);
  color: #e0a58b;
}
.type-card-icon.video { background: rgba(239,68,68,.24); color:#fca5a5; }
.type-card-icon.model3d { background: rgba(168,85,247,.24); color:#d8b4fe; }
.type-card.video:hover { border-color: rgba(239,68,68,.5); background:rgba(239,68,68,.06); }
.type-card.model3d:hover { border-color: rgba(168,85,247,.5); background:rgba(168,85,247,.06); }
.type-card.nav:hover { border-color:rgba(59,130,246,.5); background:rgba(59,130,246,.06); }
.type-card.info:hover { border-color:rgba(160,120,40,.5); background:rgba(160,120,40,.06); }

.type-card-icon svg {
  width: 20px;
  height: 20px;
}

.type-card strong {
  display: block;
  font-size: 13px;
  margin-bottom: 4px;
}

.type-card span {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.42);
  line-height: 1.4;
}

/* ═══ SÔNG VÂN STUDIO — đồng bộ với design/admin.html ═══ */
.admin-studio {
  --sv-bg-0: #0b0d10;
  --sv-bg-1: #14171c;
  --sv-bg-2: #1b1f26;
  --sv-bg-3: #232833;
  --sv-border: rgba(255,255,255,.07);
  --sv-border-strong: rgba(255,255,255,.14);
  --sv-accent: #3b82f6;
  --sv-brand: #2d6a4f;
  grid-template-rows: 60px minmax(0, 1fr);
  gap: 0;
  background: var(--sv-bg-0);
  color: #f5f7fa;
  font-size: 13.5px;
}

.admin-studio > * { background: var(--sv-bg-1); }
.topbar { grid-column: 1 / -1; grid-row: 1; height: 60px; padding: 0 20px; gap: 20px; background: linear-gradient(180deg,var(--sv-bg-2),var(--sv-bg-1)) !important; border-bottom:1px solid var(--sv-border); }
.sidebar-left { grid-column: 1; grid-row: 2; min-width:0; background:var(--sv-bg-1); }
.resizer-left { grid-column: 2; grid-row: 2; }
.preview { grid-column: 3; grid-row: 2; min-width:0; background:var(--sv-bg-1); }
.resizer-right { grid-column: 4; grid-row: 2; }
.sidebar-right { grid-column: 5; grid-row: 2; min-width:0; background:var(--sv-bg-1); }

.resizer { position:relative; z-index:20; background:var(--sv-bg-0) !important; cursor:col-resize; touch-action:none; transition:background .15s; }
.resizer::before { content:''; position:absolute; inset:0; margin:auto; width:1px; height:36px; border-radius:2px; background:var(--sv-border-strong); transition:all .15s; }
.resizer:hover,.resizer.dragging { background:rgba(59,130,246,.15) !important; }
.resizer:hover::before { height:60px; background:var(--sv-accent); }
.resizer.dragging::before { height:100%; background:var(--sv-accent); }

.tb-logo { height:40px; padding-right:20px; gap:12px; }
.tb-logo-mark { width:38px; height:38px; border-radius:10px; background:linear-gradient(135deg,var(--sv-brand),#1b4332); font-size:12px; box-shadow:0 0 0 3px rgba(45,106,79,.15); }
.tb-logo-text strong { font-size:14px; }
.tb-logo-text span { max-width:220px; font-size:11px; letter-spacing:0; text-transform:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tb-breadcrumb { font-size:12.5px; }
.save-indicator { padding:6px 14px; border:1px solid var(--sv-border); border-radius:999px; background:var(--sv-bg-3); }
.tb-btn { height:36px; padding:0 14px; border-radius:6px; background:var(--sv-bg-3); border-color:var(--sv-border); }
.tb-btn.primary { background:var(--sv-accent); border-color:var(--sv-accent); box-shadow:0 2px 8px rgba(59,130,246,.35); }

.side-head { padding:18px 16px 14px; border-color:var(--sv-border); }
.side-add { width:28px; height:28px; background:rgba(45,106,79,.2); border-color:rgba(45,106,79,.4); color:#7ec8a0; }
.scene-list { padding:10px; gap:6px; }
.scene-item { padding:8px; border-radius:10px; }
.scene-item:hover { background:var(--sv-bg-3); }
.scene-item.active { background:linear-gradient(90deg,rgba(59,130,246,.14),rgba(59,130,246,.05)); border-color:rgba(59,130,246,.4); }
.scene-item.active::before { background:var(--sv-accent); box-shadow:0 0 12px rgba(59,130,246,.7); }
.scene-thumb-sm { width:56px; height:40px; border-radius:6px; background:#000; }

.preview-toolbar { min-height:57px; padding:10px 14px; gap:10px; background:var(--sv-bg-1); border-color:var(--sv-border); }
.marker-add-btn { color:#fff; background:var(--sv-brand); border-color:var(--sv-brand); font-weight:600; }
.marker-add-btn:hover { background:#3a8562; border-color:#3a8562; }
.marker-add-btn.placing { color:#1a1613; background:#f59e0b; border-color:#f59e0b; }
.toolbar-hint { color:#f59e0b; font-size:11.5px; font-weight:600; }
.pt-zoom { background:var(--sv-bg-3); border-color:var(--sv-border); }
.preview-canvas { background:radial-gradient(circle at 50% 40%,#1a1e26 0%,#0a0c10 80%); }
.preview-info { left:16px; right:16px; bottom:16px; width:auto; padding:12px 18px; gap:14px; border:1px solid var(--sv-border-strong); border-radius:10px; background:rgba(10,12,16,.85); backdrop-filter:blur(16px); box-shadow:0 16px 48px rgba(0,0,0,.5); }
.preview-info-badge { color:#60a5fa; background:rgba(59,130,246,.15); border-color:rgba(59,130,246,.3); }
.preview-info-coord { margin-left:auto; }

.insp-tabs { border-color:var(--sv-border); }
.insp-tab { padding:14px 8px; }
.insp-tab.active { border-bottom-color:var(--sv-accent); }
.insp-body { padding:18px; gap:18px; }
.insp-section { gap:12px; }
.field input,.field textarea,.field select { background:var(--sv-bg-3); border-color:var(--sv-border); border-radius:6px; }
.field input:focus,.field textarea:focus,.field select:focus { border-color:var(--sv-accent); box-shadow:0 0 0 3px rgba(59,130,246,.14); }
.hotspot-row { padding:10px 12px; background:var(--sv-bg-3); border-color:var(--sv-border); border-radius:10px; }

.modal { max-width:720px; background:var(--sv-bg-2); border-color:var(--sv-border-strong); border-radius:14px; box-shadow:0 16px 48px rgba(0,0,0,.5); }
.modal-head { padding:20px 22px; }
.modal-body { padding:22px; }
.type-grid { gap:12px; }
.type-card { padding:20px 16px; background:var(--sv-bg-3); }

@media (max-width: 980px) {
  .admin-studio { grid-template-columns:240px 4px minmax(0,1fr) !important; }
  .resizer-right,.sidebar-right { display:none; }
  .preview { grid-column:3; }
  .tb-breadcrumb,.save-indicator { display:none; }
}
</style>
