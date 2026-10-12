<script setup lang="ts">
import type { Map as LeafletMap, Marker } from 'leaflet';
import type { TourScene } from '#view360/types/tour';

const props = defineProps<{ scenes: TourScene[]; currentSceneId?: string }>();
const emit = defineEmits<{
  selectScene: [sceneId: string];
  setCoordinates: [payload: { sceneId: string; coordinates: [number, number] }];
}>();
const host = ref<HTMLElement | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const errorMessage = ref('');
let leaflet: typeof import('leaflet') | null = null;
let map: LeafletMap | null = null;
const markers = new Map<string, Marker>();

function markerIcon(active: boolean, rotation = 0) {
  if (!leaflet) return undefined;
  return leaflet.divIcon({
    className: 'scene-pin-wrapper',
    html: `<span class="scene-orientation" style="transform:translateX(-50%) rotate(${-rotation}rad)"></span><span class="scene-pin${active ? ' is-active' : ''}"><span></span></span>`,
    iconSize: active ? [34, 42] : [28, 35], iconAnchor: active ? [17, 42] : [14, 35], tooltipAnchor: [0, -32],
  });
}

function renderMarkers(fit = false) {
  if (!leaflet || !map || state.value !== 'ready') return;
  // Hidden scenes remain usable for coordinate/camera alignment while they
  // are selected, but do not clutter the map as inactive points.
  const renderedScenes = props.scenes.filter(scene => scene.showOnMap === true || scene.id === props.currentSceneId);
  const sceneIds = new Set(renderedScenes.map(scene => scene.id));
  for (const [id, marker] of markers) if (!sceneIds.has(id)) { marker.remove(); markers.delete(id); }
  const bounds: [number, number][] = [];
  for (const scene of renderedScenes) {
    if (!scene.coordinates) continue;
    const latLng: [number, number] = [scene.coordinates[1], scene.coordinates[0]];
    bounds.push(latLng);
    let marker = markers.get(scene.id);
    if (!marker) {
      marker = leaflet.marker(latLng, { draggable: true, icon: markerIcon(scene.id === props.currentSceneId, scene.panoramaRotation), title: scene.title }).addTo(map);
      marker.bindTooltip(scene.title, { direction: 'top', offset: [0, -28] });
      marker.on('click', () => emit('selectScene', scene.id));
      marker.on('dragend', () => {
        const position = marker!.getLatLng();
        emit('setCoordinates', { sceneId: scene.id, coordinates: [position.lng, position.lat] });
      });
      markers.set(scene.id, marker);
    } else {
      marker.setLatLng(latLng);
      marker.setIcon(markerIcon(scene.id === props.currentSceneId, scene.panoramaRotation)!);
      marker.setTooltipContent(scene.title);
    }
  }
  if (fit && bounds.length) map.fitBounds(bounds, { padding: [70, 70], maxZoom: 19 });
}

function locateUser() {
  map?.locate({ setView: true, maxZoom: 20, enableHighAccuracy: true });
}

onMounted(async () => {
  if (!host.value) return;
  try {
    leaflet = await import('leaflet');
    map = leaflet.map(host.value, { center: [16.0544, 108.2022], zoom: 15, maxZoom: 22, zoomControl: true });
    const satellite = leaflet.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Imagery &copy; Esri and contributors', maxNativeZoom: 19, maxZoom: 22,
    }).addTo(map);
    const streets = leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxNativeZoom: 19, maxZoom: 22,
    });
    const labels = leaflet.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Labels &copy; Esri', maxNativeZoom: 19, maxZoom: 22,
    }).addTo(map);
    leaflet.control.layers(
      { 'Vệ tinh chi tiết': satellite, 'Bản đồ đường phố': streets },
      { 'Tên địa điểm': labels },
      { position: 'topright' },
    ).addTo(map);
    map.on('click', event => {
      if (!props.currentSceneId) return;
      emit('setCoordinates', { sceneId: props.currentSceneId, coordinates: [event.latlng.lng, event.latlng.lat] });
    });
    map.on('locationerror', () => { errorMessage.value = 'Trình duyệt không cho phép lấy vị trí hiện tại.'; });
    state.value = 'ready';
    renderMarkers(true);
    requestAnimationFrame(() => map?.invalidateSize());
  } catch (error) {
    state.value = 'error';
    errorMessage.value = error instanceof Error ? error.message : 'Không thể tải bản đồ Leaflet.';
  }
});

watch(() => props.scenes, () => renderMarkers(), { deep: true });
watch(() => props.currentSceneId, () => renderMarkers());
onBeforeUnmount(() => { markers.clear(); map?.remove(); map = null; leaflet = null; });
</script>

<template>
  <div class="real-map-editor">
    <div ref="host" class="real-map-canvas" />
    <div v-if="state === 'loading'" class="map-status">Đang tải bản đồ…</div>
    <div v-else-if="state === 'error'" class="map-status error"><strong>Không thể tải bản đồ</strong><span>{{ errorMessage }}</span></div>
    <div v-if="state === 'ready'" class="real-map-help">
      <strong>Đặt vị trí: {{ scenes.find(scene => scene.id === currentSceneId)?.title }}</strong>
      <span>Bấm lên bản đồ để đặt tọa độ · Kéo ghim để tinh chỉnh</span>
    </div>
    <button v-if="state === 'ready'" class="locate-button" type="button" title="Vị trí hiện tại" @click="locateUser">◎</button>
  </div>
</template>

<style scoped>
.real-map-editor,.real-map-canvas{position:absolute;inset:0}.real-map-editor{background:#dce3e8}.real-map-help{position:absolute;z-index:500;left:50%;top:16px;transform:translateX(-50%);display:flex;flex-direction:column;gap:3px;min-width:310px;padding:10px 16px;border:1px solid rgba(255,255,255,.55);border-radius:10px;background:rgba(15,23,42,.88);box-shadow:0 8px 24px rgba(15,23,42,.22);color:#fff;text-align:center;pointer-events:none}.real-map-help strong{font-size:12px}.real-map-help span{font-size:10px;color:#cbd5e1}.locate-button{position:absolute;z-index:500;right:14px;bottom:24px;width:42px;height:42px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#2563eb;font-size:25px;box-shadow:0 3px 14px rgba(15,23,42,.22)}.map-status{position:absolute;z-index:500;left:50%;top:50%;transform:translate(-50%,-50%);padding:12px 16px;border-radius:9px;background:#fff;color:#334155;font-size:12px;box-shadow:0 5px 24px rgba(15,23,42,.2)}.map-status.error{display:flex;flex-direction:column;gap:8px;min-width:360px;color:#be123c;text-align:center}
:deep(.scene-pin-wrapper){background:none;border:0}:deep(.scene-pin){position:relative;display:block;width:28px;height:28px;border:3px solid #fff;border-radius:50% 50% 50% 0;background:#2563eb;box-shadow:0 3px 10px rgba(15,23,42,.4);transform:rotate(-45deg)}:deep(.scene-pin span){position:absolute;inset:7px;border-radius:50%;background:#fff}:deep(.scene-pin.is-active){width:34px;height:34px;background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.25),0 4px 12px rgba(15,23,42,.45)}:deep(.scene-pin.is-active span){inset:9px}
:deep(.scene-orientation){position:absolute;z-index:-1;left:50%;top:-24px;width:0;height:0;transform-origin:50% 42px;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:18px solid #f59e0b;filter:drop-shadow(0 2px 2px rgba(15,23,42,.55))}
</style>
