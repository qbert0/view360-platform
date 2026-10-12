/**
 * ─────────────────────────────────────────────────────────────────
 * useViewerEngine — Bridge Layer cho trang Viewer (người xem)
 *
 * Đây là TOÀN BỘ điểm tiếp xúc giữa Vue và core Three.js engine.
 * - Vue components KHÔNG được import từ core/three/ trực tiếp
 * - Chỉ nhận/trả về các Vue ref và plain objects
 * ─────────────────────────────────────────────────────────────────
 */

import { ref, shallowRef, readonly, onBeforeUnmount } from 'vue';
import type { Ref } from 'vue';
import { View360Engine } from '#view360/core/three/engine/View360Engine';
import type { EngineDiagnostics } from '#view360/core/three/engine/View360Engine';
import { MarkerPlugin } from '#view360/core/three/plugins/MarkerPlugin';
import { MapPlugin } from '#view360/core/three/plugins/MapPlugin';
import { AutorotatePlugin } from '#view360/core/three/plugins/AutorotatePlugin';
import { AreaHighlightPlugin } from '#view360/core/three/plugins/AreaHighlightPlugin';
import { resolveMarkerView } from '#view360/types/tour';
import type { TourScene, TourMarker, TourConfig } from '#view360/types/tour';
import type { TransitionStyle } from '#view360/core/three/engine/PanoSphere';
import type { Ktx2BenchmarkResult } from '#view360/core/three/engine/PanoSphere';

export type { EngineDiagnostics };
export type QualityMode = 'performance' | 'balanced' | 'quality' | 'native';

// ── Options ────────────────────────────────────────────────────

export interface ViewerEngineOptions {
  /** Called when user clicks a navigation marker */
  onNavigate: (sceneId: string, yaw?: number, pitch?: number) => void;
  /** Called when user clicks a non-navigation marker */
  onMarkerClick?: (marker: TourMarker) => void;
  /** Enable auto-rotate after idle */
  autorotate?: boolean;
  /** Transition style between scenes */
  transition?: TransitionStyle;
  /**
   * Delay (ms) before Little Planet intro auto-starts.
   * During countdown, user can click to skip. Default: 0 (no delay).
   * Set to 5000 to match PSV example behavior.
   */
  introDelay?: number;
}

// ── State exported to UI ────────────────────────────────────────

export interface ViewerState {
  isLoading: Ref<boolean>;
  isTransitioning: Ref<boolean>;
  errorMessage: Ref<string>;
  currentScene: Ref<TourScene | null>;
}

// ── Composable ─────────────────────────────────────────────────

export function useViewerEngine(options: ViewerEngineOptions) {
  // ── Reactive state (read-only to UI) ──
  const isLoading = ref(true);
  const isTransitioning = ref(false);
  const errorMessage = ref('');
  const currentScene = ref<TourScene | null>(null);
  const mapAvailable = ref(false);
  const isMapVisible = ref(false);
  /** True while the intro countdown (delay before auto-start) is running */
  const isInCountdown = ref(false);
  /** Remaining ms in countdown (0–introDelay), updated every 100ms */
  const countdownRemaining = ref(0);

  // Engine instance (shallow = no deep reactivity, just reference)
  const engine = shallowRef<View360Engine | null>(null);

  // Preload cache tracking
  const preloaded = new Set<string>();
  let preloadTimer: ReturnType<typeof setTimeout> | null = null;
  let preloadGeneration = 0;
  let isUserDragging = false;
  let lastUserInteractionAt = 0;
  let mobilePerformanceMode = false;

  function shouldUseMobileProfile(): boolean {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 900
      || window.matchMedia('(pointer: coarse)').matches;
  }

  // ── Init ───────────────────────────────────────────────────────

  async function initEngine(
    container: HTMLElement,
    initialScene: TourScene,
    tour?: TourConfig,
  ): Promise<void> {
    isLoading.value = true;
    errorMessage.value = '';

    try {
      mobilePerformanceMode = shouldUseMobileProfile();
      const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
      const lowMemoryDevice = deviceMemory <= 4;
      const e = new View360Engine({
        container,
        antialias: false,
        // A phone with DPR 3 renders nine framebuffer pixels per CSS pixel.
        // DevTools mobile emulation does not reproduce that GPU cost.
        pixelRatio: mobilePerformanceMode
          ? Math.min(window.devicePixelRatio, 1.25)
          : Math.min(window.devicePixelRatio, 2),
        introDelay: options.introDelay ?? 0,
        pano: {
          defaultTransition: tour?.transition ?? options.transition ?? 'crossfade',
          transitionDuration: tour?.transitionDuration ?? (mobilePerformanceMode ? 500 : 700),
          maxCachedTextures: mobilePerformanceMode ? 1 : 2,
          segments: mobilePerformanceMode ? 64 : 128,
          tileStreaming: {
            maxConcurrentRequests: mobilePerformanceMode ? 2 : 4,
            maxUploadsPerFrame: mobilePerformanceMode ? 1 : 2,
            maxCacheBytes: lowMemoryDevice
              ? 48 * 1024 * 1024
              : mobilePerformanceMode
                ? 64 * 1024 * 1024
                : 160 * 1024 * 1024,
            updateIntervalMs: mobilePerformanceMode ? 120 : 80,
            evictionGraceMs: mobilePerformanceMode ? 900 : 1400,
            resolutionScale: mobilePerformanceMode ? 1 : 1.08,
          },
        },
      });

      // ── Register plugins ──
      e.use(new MarkerPlugin());
      e.use(new AreaHighlightPlugin());

      // Map plugin — auto-enabled when tour has map config
      if (tour?.map) {
        try {
          const sceneById = new Map(tour.scenes.map(scene => [scene.id, scene]));
          // `tour` comes from useFetch and can be a Vue Proxy. structuredClone
          // throws DataCloneError for proxies and used to abort the whole viewer.
          const viewerMap = JSON.parse(JSON.stringify(tour.map)) as NonNullable<TourConfig['map']>;

          // The real-map editor stores the pin choice on each scene. New tours
          // can therefore legitimately have `floors: []`; build the runtime
          // node collection from the selected scenes instead of falling back
          // to an empty 2D floorplan (which only renders a black canvas).
          if (viewerMap.floors.length === 0) {
            viewerMap.floors.push({
              id: '__geo__',
              name: 'Bản đồ',
              shortName: 'Map',
              imageUrl: '',
              imageWidth: 1,
              imageHeight: 1,
              nodes: [],
            });
          }

          const configuredNodeIds = new Set(
            viewerMap.floors.flatMap(floor => floor.nodes.map(node => node.id)),
          );
          const geoFloor = viewerMap.floors[0]!;
          for (const scene of tour.scenes) {
            if (
              scene.showOnMap === true
              && scene.coordinates
              && !configuredNodeIds.has(scene.id)
            ) {
              geoFloor.nodes.push({
                id: scene.id,
                name: scene.title,
                x: 0,
                y: 0,
                longitude: scene.coordinates[0],
                latitude: scene.coordinates[1],
                visible: true,
                neighbors: [],
              });
              configuredNodeIds.add(scene.id);
            }
          }

          for (const floor of viewerMap.floors) {
            for (const node of floor.nodes) {
              const scene = sceneById.get(node.id);
              const coordinates = scene?.coordinates;
              node.visible = scene?.showOnMap === true;
              if (coordinates) {
                node.longitude = coordinates[0];
                node.latitude = coordinates[1];
              }
            }
          }
          const mapPlugin = new MapPlugin({ defaultConfig: viewerMap });
          e.use(mapPlugin);
          mapAvailable.value = true;
          isMapVisible.value = mapPlugin.isVisible();
        } catch (mapError) {
          // The map is supplemental UI. It must never prevent the panorama
          // engine from starting when its configuration is malformed.
          console.error('[useViewerEngine] Không thể khởi tạo MapPlugin:', mapError);
        }
      }

      if (options.autorotate ?? tour?.autoRotate) {
        e.use(new AutorotatePlugin({ speed: 0.3 }));
      }

      // ── Wire events to callbacks ──
      e.bus.on('navigate', ({ sceneId, yaw, pitch }) => options.onNavigate(sceneId, yaw, pitch));

      e.bus.on('marker:click', ({ marker }) => {
        if (marker.plugin !== 'navigation') {
          options.onMarkerClick?.(marker);
        }
      });

      e.bus.on('scene:transition:start', () => {
        isTransitioning.value = true;
        cancelScheduledPreload();
      });

      e.bus.on('scene:transition:end', ({ scene }) => {
        isTransitioning.value = false;
        currentScene.value = scene;
      });

      e.bus.on('scene:loaded', ({ scene }) => {
        currentScene.value = scene;
        isLoading.value = false;
      });
      e.bus.on('interaction:dragstart', () => {
        isUserDragging = true;
        lastUserInteractionAt = performance.now();
      });
      e.bus.on('interaction:dragend', () => {
        isUserDragging = false;
        lastUserInteractionAt = performance.now();
      });
      e.bus.on('camera:fov', () => {
        lastUserInteractionAt = performance.now();
      });
      e.bus.on('map:visibility', ({ visible }) => {
        isMapVisible.value = visible;
      });

      // ── Intro countdown state ──
      let countdownInterval: ReturnType<typeof setInterval> | null = null;
      e.bus.on('intro:countdown:start', ({ delayMs }) => {
        isInCountdown.value = true;
        countdownRemaining.value = delayMs;
        countdownInterval = setInterval(() => {
          countdownRemaining.value = Math.max(0, countdownRemaining.value - 100);
        }, 100);
      });
      e.bus.on('intro:end', () => {
        isInCountdown.value = false;
        countdownRemaining.value = 0;
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      });
      e.bus.on('intro:countdown:skip', () => {
        isInCountdown.value = false;
        countdownRemaining.value = 0;
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      });

      engine.value = e;

      // ── Load first scene ──
      const viewerInitialScene = forViewer(initialScene);
      await e.loadScene(viewerInitialScene, true);

      const viewerScenes = tour?.scenes.map(forViewer);
      if (viewerInitialScene.previewPanorama && !viewerInitialScene.multiRes?.enabled) {
        scheduleCurrentSceneUpgrade(viewerInitialScene, viewerScenes);
      } else if (viewerScenes) {
        preloadNeighbours(viewerInitialScene, viewerScenes);
      }
    } catch (err) {
      errorMessage.value =
        err instanceof Error ? err.message : 'Không thể khởi động viewer.';
      isLoading.value = false;
    }
  }

  // ── Navigation ─────────────────────────────────────────────────

  async function navigateTo(
    scene: TourScene,
    allScenes?: TourScene[],
    flyYaw?: number,
    flyPitch?: number,
  ): Promise<void> {
    if (!engine.value) return;
    if (currentScene.value?.id === scene.id) return;

    isTransitioning.value = true;
    try {
      const viewerScene = forViewer(scene);
      await engine.value.navigateTo(viewerScene, undefined, flyYaw, flyPitch);
      const viewerScenes = allScenes?.map(forViewer);
      if (viewerScene.previewPanorama && !viewerScene.multiRes?.enabled) {
        scheduleCurrentSceneUpgrade(viewerScene, viewerScenes);
      } else if (viewerScenes) {
        preloadNeighbours(viewerScene, viewerScenes);
      }
    } catch (err) {
      errorMessage.value =
        err instanceof Error ? err.message : 'Lỗi chuyển cảnh.';
    } finally {
      isTransitioning.value = false;
    }
  }

  // ── Preload ────────────────────────────────────────────────────

  function preloadNeighbours(scene: TourScene, allScenes: TourScene[]): void {
    if (!engine.value) return;
    // A decoded 4K panorama consumes roughly 32 MiB before other WebGL
    // resources. On phones, retain only the active scene and load the next
    // preview on demand instead of competing for memory in the background.
    if (mobilePerformanceMode) return;

    // Preload navigation targets + adjacent scenes
    const navTargets = (scene.markers ?? [])
      .filter((m) => m.plugin === 'navigation' && 'targetScene' in m)
      .map((m) => allScenes.find((s) => s.id === (m as any).targetScene))
      .filter((s): s is TourScene => !!s);

    const idx = allScenes.findIndex((s) => s.id === scene.id);
    const adjacent = [allScenes[idx - 1], allScenes[idx + 1]].filter(
      (s): s is TourScene => !!s,
    );

    const targets = [...new Set([...navTargets, ...adjacent])].slice(0, 3);
    const pending = targets.filter(target => !preloaded.has(target.previewPanorama ?? target.panorama));
    const generation = ++preloadGeneration;
    lastUserInteractionAt = performance.now();
    scheduleNextPreload(pending, 0, generation);
  }

  function forViewer(scene: TourScene): TourScene {
    if (typeof window === 'undefined') return scene;
    const preferMobile = shouldUseMobileProfile();
    const mobile = preferMobile ? scene.mobileView : undefined;
    return {
      ...scene,
      panorama: preferMobile && scene.mobilePanorama
        ? scene.mobilePanorama
        : scene.panorama,
      // Each missing mobile value deliberately falls back to desktop.
      initialYaw: mobile?.initialYaw ?? scene.initialYaw,
      initialPitch: mobile?.initialPitch ?? scene.initialPitch,
      initialFov: mobile?.initialFov ?? scene.initialFov,
      defaultCameraEnabled: mobile?.defaultCameraEnabled ?? scene.defaultCameraEnabled,
      defaultZoomEnabled: mobile?.defaultZoomEnabled ?? scene.defaultZoomEnabled,
      markers: scene.markers.map(marker => resolveMarkerView(marker, preferMobile)),
    };
  }

  /** Upgrade the active 2K preview only after camera input has gone idle. */
  function scheduleCurrentSceneUpgrade(scene: TourScene, allScenes?: TourScene[]): void {
    const generation = ++preloadGeneration;
    lastUserInteractionAt = performance.now();
    const attempt = () => {
      if (generation !== preloadGeneration || !engine.value) return;
      const idleFor = performance.now() - lastUserInteractionAt;
      const requiredIdle = mobilePerformanceMode ? 2200 : 1200;
      if (isUserDragging || idleFor < requiredIdle) {
        preloadTimer = setTimeout(attempt, 250);
        return;
      }
      preloadTimer = null;
      void engine.value.upgradeCurrentPanorama(scene.id, scene.panorama).then(() => {
        if (generation !== preloadGeneration) return;
        if (allScenes) preloadNeighbours(scene, allScenes);
      }).catch(() => {});
    };
    preloadTimer = setTimeout(attempt, 250);
  }

  /**
   * Full-resolution panorama decode + GPU upload is expensive. Run only one
   * preload at a time and wait until camera interaction has been idle, rather
   * than uploading three textures on the first frames after a transition.
   */
  function scheduleNextPreload(
    targets: TourScene[],
    index: number,
    generation: number,
  ): void {
    if (generation !== preloadGeneration || index >= targets.length) return;
    if (preloadTimer) clearTimeout(preloadTimer);
    preloadTimer = setTimeout(async () => {
      preloadTimer = null;
      if (generation !== preloadGeneration) return;

      const idleFor = performance.now() - lastUserInteractionAt;
      if (isUserDragging || idleFor < 1200) {
        scheduleNextPreload(targets, index, generation);
        return;
      }

      const target = targets[index];
      const pano = engine.value?.pano;
      if (!target || !pano) return;
      const targetUrl = target.previewPanorama ?? target.panorama;
      preloaded.add(targetUrl);
      try {
        await pano.preload(targetUrl);
      } catch {
        preloaded.delete(targetUrl);
      }
      // Leave breathing room between GPU uploads as well.
      lastUserInteractionAt = performance.now() - 700;
      scheduleNextPreload(targets, index + 1, generation);
    }, 250);
  }

  function cancelScheduledPreload(): void {
    preloadGeneration++;
    if (preloadTimer) {
      clearTimeout(preloadTimer);
      preloadTimer = null;
    }
  }

  // ── Dev Tools ──────────────────────────────────────────────────

  /** Snapshot of GPU/rendering metrics. Only call after engine is initialized. */
  function getDiagnostics(): EngineDiagnostics | null {
    return engine.value?.getDiagnostics() ?? null;
  }

  function benchmarkCurrentKtx2(): Promise<Ktx2BenchmarkResult> {
    const scene = currentScene.value;
    if (!engine.value || !scene?.ktx2Panorama) {
      return Promise.reject(new Error('Scene hiện tại chưa có ảnh KTX2 để benchmark.'));
    }
    return engine.value.benchmarkKtx2(scene.panorama, scene.ktx2Panorama);
  }

  /**
   * Change renderer quality mode.
   * Takes effect immediately without restarting the engine.
   */
  function setQualityMode(mode: QualityMode): void {
    engine.value?.setQualityMode(mode);
  }

  function toggleMap(): void {
    const plugin = engine.value?.getPlugin<MapPlugin>('map');
    if (!plugin) return;
    plugin.setVisible(!plugin.isVisible());
  }

  // ── Cleanup ────────────────────────────────────────────────────

  function destroyEngine(): void {
    cancelScheduledPreload();
    engine.value?.destroy();
    engine.value = null;
    preloaded.clear();
    currentScene.value = null;
    mapAvailable.value = false;
    isMapVisible.value = false;
  }

  // Auto-cleanup when parent component unmounts
  onBeforeUnmount(destroyEngine);

  // ── Return (read-only state + actions) ────────────────────────

  return {
    // State — readonly so UI cannot mutate directly
    isLoading: readonly(isLoading),
    isTransitioning: readonly(isTransitioning),
    errorMessage: readonly(errorMessage),
    currentScene: readonly(currentScene),
    mapAvailable: readonly(mapAvailable),
    isMapVisible: readonly(isMapVisible),

    // Actions
    initEngine,
    navigateTo,
    destroyEngine,

    // Dev tools
    getDiagnostics,
    benchmarkCurrentKtx2,
    setQualityMode,
    toggleMap,
  };
}
