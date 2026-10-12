<script setup lang="ts">
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';

const props = defineProps<{
  coordinates?: [number, number];
  cameraYaw: number;
  panoramaRotation: number;
}>();
const host = ref<HTMLElement | null>(null);
let leaflet: typeof import('leaflet') | null = null;
let map: LeafletMap | null = null;
const ready = ref(false);
const failed = ref(false);
const errorMessage = ref('');
let resizeObserver: ResizeObserver | null = null;
let loadTimer: ReturnType<typeof setTimeout> | null = null;

function update() {
  if (!map || !props.coordinates) return;
  const point: [number, number] = [props.coordinates[1], props.coordinates[0]];
  map.panTo(point, { animate: false });
}

onMounted(async () => {
  if (!host.value || !props.coordinates) return;
  try {
    leaflet = await import('leaflet');
    const point: [number, number] = [props.coordinates[1], props.coordinates[0]];
    map = leaflet.map(host.value, { center: point, zoom: 19, zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, keyboard: false });

    const satellite = leaflet.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Imagery &copy; Esri',
      maxNativeZoom: 19,
      maxZoom: 22,
    });

    let satelliteErrors = 0;
    let streetErrors = 0;
    const markReady = () => {
      ready.value = true;
      failed.value = false;
      errorMessage.value = '';
      if (loadTimer) clearTimeout(loadTimer);
    };
    const streets = leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxNativeZoom: 19,
      maxZoom: 22,
    });
    streets.on('tileload', markReady);
    streets.on('load', markReady);
    streets.on('tileerror', () => {
      streetErrors++;
      if (streetErrors >= 3) {
        failed.value = true;
        errorMessage.value = 'Không tải được tile bản đồ. Hãy kiểm tra mạng hoặc trình chặn nội dung.';
      }
    });
    satellite.on('tileload', markReady);
    satellite.on('load', markReady);
    satellite.on('tileerror', () => {
      satelliteErrors++;
      if (satelliteErrors >= 3 && map?.hasLayer(satellite)) {
        failed.value = true;
        errorMessage.value = '';
        satellite.remove();
        streets.addTo(map);
      }
    });
    satellite.addTo(map);

    resizeObserver = new ResizeObserver(() => map?.invalidateSize({ pan: false }));
    resizeObserver.observe(host.value);
    await nextTick();
    requestAnimationFrame(() => map?.invalidateSize({ pan: false }));
    loadTimer = setTimeout(() => {
      if (!ready.value) {
        failed.value = true;
        errorMessage.value = 'Nguồn bản đồ phản hồi quá chậm.';
      }
    }, 8000);
  } catch (error) {
    failed.value = true;
    errorMessage.value = error instanceof Error ? error.message : 'Không thể khởi tạo bản đồ.';
  }
});
watch(() => props.coordinates, update, { deep: true });
onBeforeUnmount(() => {
  if (loadTimer) clearTimeout(loadTimer);
  resizeObserver?.disconnect();
  resizeObserver = null;
  map?.remove();
  map = null;
  leaflet = null;
});
</script>

<template>
  <div class="heading-map-shell">
    <div ref="host" class="heading-map-canvas" />
    <div class="heading-overlay" aria-label="Hướng camera và panorama">
      <span class="heading-axis pano" :style="{ transform: `translateX(-50%) rotate(${-panoramaRotation}rad)` }" />
      <span class="heading-axis camera" :style="{ transform: `translateX(-50%) rotate(${-cameraYaw}rad)` }" />
      <span class="heading-center" />
    </div>
    <div class="heading-legend"><span class="camera-key">Camera</span><span class="pano-key">Panorama</span></div>
    <div v-if="!ready && !failed" class="map-loading">Đang tải bản đồ…</div>
    <div v-if="failed" class="map-fallback">{{ errorMessage || 'Đang dùng bản đồ đường phố' }}</div>
  </div>
</template>

<style scoped>
.heading-map-shell{position:absolute;right:18px;top:18px;z-index:20;width:230px;height:150px;border:1px solid rgba(255,255,255,.7);border-radius:12px;overflow:hidden;background:#d1d5db;box-shadow:0 8px 28px rgba(0,0,0,.38)}
.heading-map-canvas{position:absolute;inset:0;background:#d1d5db}.heading-overlay{position:absolute;z-index:800;left:50%;top:50%;width:50px;height:50px;transform:translate(-50%,-50%);pointer-events:none}.heading-axis{position:absolute;left:50%;top:-4px;width:0;height:0;transform-origin:50% 29px;border-left:7px solid transparent;border-right:7px solid transparent}.heading-axis.camera{border-bottom:24px solid #f59e0b;z-index:3}.heading-axis.pano{border-bottom:30px solid #3b82f6;opacity:.85;z-index:2}.heading-center{position:absolute;left:50%;top:50%;width:14px;height:14px;transform:translate(-50%,-50%);border:3px solid #fff;border-radius:50%;background:#111827;z-index:4}.heading-legend{position:absolute;z-index:801;left:7px;bottom:6px;display:flex;gap:8px;padding:3px 6px;border-radius:5px;background:rgba(15,23,42,.78);font-size:8px;font-weight:700}.camera-key{color:#fbbf24}.pano-key{color:#60a5fa}.map-loading,.map-fallback{position:absolute;z-index:802;left:50%;top:50%;max-width:210px;transform:translate(-50%,-50%);padding:5px 8px;border-radius:5px;background:rgba(15,23,42,.82);color:#fff;font-size:9px;text-align:center}.map-fallback{top:12px;transform:translateX(-50%)}
</style>
