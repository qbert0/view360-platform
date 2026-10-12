/**
 * ─────────────────────────────────────────────────────────────────
 * useDesignerEngine — Bridge Layer cho trang Designer (thiết kế tour)
 *
 * Cung cấp:
 *   - Preview panorama trong canvas
 *   - Đọc yaw/pitch real-time từ camera (để đặt marker)
 *   - Thêm / Xoá marker (preview, chưa lưu vào DB)
 *   - Snapshot canvas
 * ─────────────────────────────────────────────────────────────────
 */

import { ref, shallowRef, readonly, computed, onBeforeUnmount } from 'vue';
import { View360Engine } from '#view360/core/three/engine/View360Engine';
import { MarkerPlugin } from '#view360/core/three/plugins/MarkerPlugin';
import { AreaHighlightPlugin } from '#view360/core/three/plugins/AreaHighlightPlugin';
import type { AreaHighlight, AreaHighlightPoint, TourScene, TourMarker } from '#view360/types/tour';

// ── Marker placement state ──────────────────────────────────────

export type PlacementMode = 'none' | 'navigation' | 'info' | 'video' | 'model3d' | 'audio' | 'ai-chat';

export interface PendingMarker {
  type: PlacementMode;
  yaw: number;
  pitch: number;
}

// ── Composable ─────────────────────────────────────────────────

export function useDesignerEngine() {
  // ── State ──
  const isLoading = ref(true);
  const errorMessage = ref('');
  const currentScene = ref<TourScene | null>(null);

  // Camera pose — updated every frame via EventBus
  const cameraYaw = ref(0);
  const cameraPitch = ref(0);
  const cameraFov = ref(75);
  const interactionMode = ref<'camera' | 'panorama'>('camera');
  const lastPanoramaRotation = ref<number | null>(null);

  // Marker placement mode
  const placementMode = ref<PlacementMode>('none');
  const isPlacing = computed(() => placementMode.value !== 'none');

  // Last marker that was moved via drag (admin page watches this)
  const lastMarkerMoved = ref<{ markerId: string; yaw: number; pitch: number } | null>(null);
  // Marker selected directly on the panorama preview.
  const lastMarkerClicked = ref<TourMarker | null>(null);
  const lastPlacement = ref<{ type: Exclude<PlacementMode, 'none'>; yaw: number; pitch: number } | null>(null);
  const isDrawingArea = ref(false);
  const areaInteractionMode = ref<'rotate' | 'edit'>('rotate');
  const areaDraftPoints = ref<AreaHighlightPoint[]>([]);
  const lastAreaDrawn = ref<AreaHighlight | null>(null);
  const selectedAreaId = ref<string | null>(null);
  const selectedAreaPoint = ref<{ areaId: string; pointIndex: number } | null>(null);
  const lastAreaPointMoved = ref<{ areaId: string; pointIndex: number; yaw: number; pitch: number } | null>(null);
  const lastAreaPointAdded = ref<{ areaId: string; point: AreaHighlightPoint } | null>(null);
  const areaPointTargetId = ref<string | null>(null);

  // Engine instance
  const engine = shallowRef<View360Engine | null>(null);

  // Unsubscribe cleanup
  const unsubs: Array<() => void> = [];

  function forDesigner(scene: TourScene): TourScene {
    const editorSource = scene.editorPanorama
      ?? (scene.panorama.startsWith('/')
        ? `/api/admin/media/preview?path=${encodeURIComponent(scene.panorama)}`
        : scene.panorama);
    return { ...scene, panorama: editorSource };
  }

  // ── Init ───────────────────────────────────────────────────────

  async function initEngine(
    container: HTMLElement,
    initialScene: TourScene,
  ): Promise<void> {
    isLoading.value = true;
    errorMessage.value = '';

    try {
      const e = new View360Engine({
        container,
        // The designer only needs the active scene. A 5760×2880 decoded image
        // is roughly 63 MB before its GPU copy, so retaining viewer-style
        // neighbour caches here quickly exhausts memory.
        pixelRatio: 1,
        antialias: false,
        enableTiling: false,
        // No autorotate in designer — camera must stay where user puts it
        camera: {
          dampingFactor: 0.1,
        },
        pano: {
          defaultTransition: 'crossfade',
          transitionDuration: 500,
          // Admin never preloads neighbouring scenes. Only the active WebGL
          // texture exists; switching scenes destroys the previous one.
          maxCachedTextures: 0,
        },
      });

      // Marker preview + drag-to-reposition (designer mode)
      e.use(new MarkerPlugin({ pulseSpeed: 0, pulseAmplitude: 0, draggable: true }));
      const areaHighlightPlugin = new AreaHighlightPlugin({ preview: true });
      e.use(areaHighlightPlugin);
      areaHighlightPlugin.setEditingEnabled(false);

      // ── Wire camera pose to reactive refs ──
      const unsub1 = e.bus.on('camera:move', ({ yaw, pitch }) => {
        cameraYaw.value = yaw;
        cameraPitch.value = pitch;
        cameraFov.value = e.camera.getFov();
      });
      const unsub2 = e.bus.on('camera:fov', ({ fov }) => {
        cameraFov.value = fov;
      });
      const unsub3 = e.bus.on('scene:loaded', ({ scene }) => {
        currentScene.value = scene;
        cameraYaw.value = e.camera.getYaw();
        cameraPitch.value = e.camera.getPitch();
        cameraFov.value = e.camera.getFov();
        isLoading.value = false;
      });

      unsubs.push(unsub1, unsub2, unsub3);

      // ── Marker moved (drag-to-reposition) ──────────────────────────────────
      const unsub4 = e.bus.on('marker:moved', ({ markerId, yaw, pitch }) => {
        lastMarkerMoved.value = { markerId, yaw, pitch };
      });
      const unsub5 = e.bus.on('marker:click', ({ marker }) => {
        // Placement owns the next canvas click; do not select a marker while
        // the designer is waiting for a new marker position.
        if (placementMode.value === 'none') lastMarkerClicked.value = marker;
      });
      const unsub6 = e.bus.on('area:point-moved', payload => {
        lastAreaPointMoved.value = payload;
      });
      const unsub7 = e.bus.on('area:selected', ({ areaId }) => {
        selectedAreaId.value = areaId;
      });
      const unsub8 = e.bus.on('area:point-selected', payload => {
        selectedAreaPoint.value = payload;
      });
      unsubs.push(unsub4, unsub5, unsub6, unsub7, unsub8);

      // ── Canvas click → place marker ──
      const canvas = e['renderer'].domElement as HTMLCanvasElement;
      const onClick = (ev: MouseEvent) => {
        if (isDrawingArea.value || areaPointTargetId.value) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          handleAreaDrawingClick(ev, canvas, e);
          return;
        }
        if (placementMode.value === 'none') return;
        // Use current camera yaw/pitch at click as marker position
        // (the user looks at the spot they want, then clicks the button)
        // For more precision: raycast to sphere surface from mouse position
        handlePlacementClick(ev, canvas, e);
      };
      canvas.addEventListener('click', onClick, true);
      unsubs.push(() => canvas.removeEventListener('click', onClick, true));

      // Alignment interaction: in panorama mode the camera is frozen and
      // horizontal dragging rotates the panorama + its marker group instead.
      let rotatingPanorama = false;
      let rotationStartX = 0;
      let rotationStart = 0;
      const onRotationDown = (ev: PointerEvent) => {
        if (interactionMode.value !== 'panorama' || ev.button !== 0) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        rotatingPanorama = true;
        rotationStartX = ev.clientX;
        rotationStart = currentScene.value?.panoramaRotation ?? 0;
        canvas.setPointerCapture(ev.pointerId);
        canvas.style.cursor = 'ew-resize';
      };
      const onRotationMove = (ev: PointerEvent) => {
        if (!rotatingPanorama || interactionMode.value !== 'panorama') return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        const twoPi = Math.PI * 2;
        const raw = rotationStart + (ev.clientX - rotationStartX) * 0.003;
        const rotation = ((raw + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
        if (currentScene.value) currentScene.value.panoramaRotation = rotation;
        e.setSceneRotation(rotation);
      };
      const onRotationUp = (ev: PointerEvent) => {
        if (!rotatingPanorama) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        rotatingPanorama = false;
        canvas.style.cursor = interactionMode.value === 'panorama' ? 'ew-resize' : 'grab';
        lastPanoramaRotation.value = currentScene.value?.panoramaRotation ?? 0;
      };
      canvas.addEventListener('pointerdown', onRotationDown, true);
      canvas.addEventListener('pointermove', onRotationMove, true);
      canvas.addEventListener('pointerup', onRotationUp, true);
      canvas.addEventListener('pointercancel', onRotationUp, true);
      unsubs.push(
        () => canvas.removeEventListener('pointerdown', onRotationDown, true),
        () => canvas.removeEventListener('pointermove', onRotationMove, true),
        () => canvas.removeEventListener('pointerup', onRotationUp, true),
        () => canvas.removeEventListener('pointercancel', onRotationUp, true),
      );

      engine.value = e;

      // ── Load first scene without intro ──
      await e.loadScene(forDesigner(initialScene), false);
    } catch (err) {
      errorMessage.value =
        err instanceof Error ? err.message : 'Không thể khởi động designer.';
      isLoading.value = false;
    }
  }

  // ── Scene navigation (no intro in designer) ────────────────────

  async function loadScene(scene: TourScene): Promise<void> {
    if (!engine.value) return;
    isLoading.value = true;
    try {
      await engine.value.loadScene(forDesigner(scene), false);
    } finally {
      isLoading.value = false;
    }
  }

  // ── Marker Placement ───────────────────────────────────────────

  /** Start placement mode — next canvas click places a marker of this type */
  function startPlacement(type: PlacementMode): void {
    placementMode.value = type;
  }

  /** Cancel placement mode without placing */
  function cancelPlacement(): void {
    placementMode.value = 'none';
  }

  function startAreaDrawing(): void {
    setAreaInteractionMode('edit');
    placementMode.value = 'none';
    areaPointTargetId.value = null;
    areaDraftPoints.value = [];
    isDrawingArea.value = true;
    refreshAreaHighlights();
  }

  function finishAreaDrawing(): boolean {
    if (areaDraftPoints.value.length < 3) return false;
    lastAreaDrawn.value = {
      id: `area-${Date.now()}`,
      points: areaDraftPoints.value.map(point => ({ ...point })),
      color: '#22c55e',
      outlineColor: '#ffffff',
      opacity: 0.34,
      durationMs: 1400,
      mode: 'fill-outline',
      lineWidth: 5,
    };
    isDrawingArea.value = false;
    areaDraftPoints.value = [];
    return true;
  }

  function cancelAreaDrawing(): void {
    isDrawingArea.value = false;
    areaPointTargetId.value = null;
    areaDraftPoints.value = [];
    refreshAreaHighlights();
  }

  function startAreaPointPlacement(areaId: string): void {
    setAreaInteractionMode('edit');
    isDrawingArea.value = false;
    areaDraftPoints.value = [];
    areaPointTargetId.value = areaId;
  }

  function setAreaInteractionMode(mode: 'rotate' | 'edit'): void {
    areaInteractionMode.value = mode;
    const currentEngine = engine.value;
    if (!currentEngine) return;
    currentEngine.getPlugin<AreaHighlightPlugin>('area-highlight')?.setEditingEnabled(mode === 'edit');
    currentEngine.bus.emit(mode === 'edit' ? 'interaction:lock' : 'interaction:unlock');
    currentEngine.renderer.domElement.style.cursor = mode === 'edit' ? 'crosshair' : 'grab';
  }

  function selectAreaPoint(areaId: string | null, pointIndex: number | null): void {
    if (areaId !== null && pointIndex !== null) setAreaInteractionMode('edit');
    selectedAreaPoint.value = areaId !== null && pointIndex !== null ? { areaId, pointIndex } : null;
    engine.value?.getPlugin<AreaHighlightPlugin>('area-highlight')?.selectPoint(areaId, pointIndex);
  }

  function handleAreaDrawingClick(
    ev: MouseEvent,
    canvas: HTMLCanvasElement,
    e: View360Engine,
  ): void {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    import('three').then(({ Raycaster, Vector2, Vector3 }) => {
      if (!isDrawingArea.value && !areaPointTargetId.value) return;
      const raycaster = new Raycaster();
      raycaster.setFromCamera(new Vector2(ndcX, ndcY), e.camera.camera);
      const direction = raycaster.ray.direction.clone().normalize();
      direction.applyAxisAngle(new Vector3(0, 1, 0), -(currentScene.value?.panoramaRotation ?? 0));
      const point = {
        yaw: Math.atan2(-direction.x, -direction.z),
        pitch: Math.asin(THREEClamp(direction.y)),
      };
      if (areaPointTargetId.value) {
        lastAreaPointAdded.value = { areaId: areaPointTargetId.value, point };
        areaPointTargetId.value = null;
        return;
      }
      areaDraftPoints.value.push(point);
      refreshAreaHighlights();
    });
  }

  function THREEClamp(value: number): number {
    return Math.max(-1, Math.min(1, value));
  }

  function refreshAreaHighlights(areas = currentScene.value?.areaHighlights ?? []): void {
    const plugin = engine.value?.getPlugin<AreaHighlightPlugin>('area-highlight');
    if (!plugin) return;
    const draft: AreaHighlight[] = areaDraftPoints.value.length
      ? [{ id: '__draft__', points: areaDraftPoints.value, color: '#22c55e', outlineColor: '#ffffff', opacity: 0.34 }]
      : [];
    plugin.setAreas([...areas, ...draft], currentScene.value?.panoramaRotation ?? 0);
  }

  /**
   * Handle canvas click during placement mode.
   * Performs a sphere raycast to get the exact yaw/pitch at the click point.
   */
  function handlePlacementClick(
    ev: MouseEvent,
    canvas: HTMLCanvasElement,
    e: View360Engine,
  ): void {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

    // Use THREE Raycaster via engine camera
    // Import dynamically to avoid polluting Vue composable with THREE
    import('three').then(({ Raycaster, Vector2, Vector3 }) => {
      const raycaster = new Raycaster();
      const mouse = new Vector2(ndcX, ndcY);
      raycaster.setFromCamera(mouse, e.camera.camera);

      // Intersect with a virtual sphere at radius 520
      const dir = raycaster.ray.direction.clone().normalize();
      dir.applyAxisAngle(new Vector3(0, 1, 0), -(currentScene.value?.panoramaRotation ?? 0));
      const yaw = Math.atan2(-dir.x, -dir.z);
      const pitch = Math.asin(dir.y);

      const type = placementMode.value;
      if (type === 'none') return;
      lastPlacement.value = { type, yaw, pitch };
      placementMode.value = 'none';
    });
  }

  /** Get current camera yaw/pitch as a tuple (to manually set marker position) */
  function getCameraAim(): { yaw: number; pitch: number } {
    return { yaw: cameraYaw.value, pitch: cameraPitch.value };
  }

  // ── Marker sync ───────────────────────────────────────────────────

  /** Force MarkerPlugin to re-render markers for current scene */
  function refreshMarkers(scene: TourScene): void {
    const markerPlugin = engine.value?.getPlugin<MarkerPlugin>('marker');
    if (!markerPlugin) return;
    markerPlugin.onSceneReady?.(scene);
  }

  /** Set camera FOV (for zoom slider). Clamped to [30, 150]. */
  function setFov(fov: number): void {
    if (!engine.value) return;
    engine.value.camera.setTarget(
      engine.value.camera.getTargetYaw(),
      engine.value.camera.getTargetPitch(),
      Math.max(30, Math.min(150, fov)),
    );
  }

  function setBrightness(value: number): void {
    engine.value?.pano.setBrightness(value);
  }

  function setHighlightCompression(value: number): void {
    engine.value?.pano.setHighlightCompression(value);
  }

  function setPanoramaRotation(value: number): void {
    if (!engine.value) return;
    engine.value.setSceneRotation(value);
  }

  function setInteractionMode(mode: 'camera' | 'panorama'): void {
    interactionMode.value = mode;
    const canvas = engine.value?.['renderer'].domElement as HTMLCanvasElement | undefined;
    if (canvas) canvas.style.cursor = mode === 'panorama' ? 'ew-resize' : 'grab';
  }

  // ── Snapshot ───────────────────────────────────────────────────

  /** Capture current frame as a data URL (for thumbnail generation) */
  function captureSnapshot(): string | null {
    if (!engine.value) return null;
    try {
      const canvas = engine.value['renderer'].domElement as HTMLCanvasElement;
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch {
      return null;
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────

  function destroyEngine(): void {
    unsubs.forEach((fn) => fn());
    engine.value?.destroy();
    engine.value = null;
    currentScene.value = null;
  }

  onBeforeUnmount(destroyEngine);

  // ── Return ─────────────────────────────────────────────────────

  return {
    // State
    isLoading: readonly(isLoading),
    errorMessage: readonly(errorMessage),
    currentScene: readonly(currentScene),
    cameraYaw: readonly(cameraYaw),
    cameraPitch: readonly(cameraPitch),
    cameraFov: readonly(cameraFov),
    interactionMode: readonly(interactionMode),
    lastPanoramaRotation: readonly(lastPanoramaRotation),
    placementMode: readonly(placementMode),
    isPlacing,
    lastMarkerMoved: readonly(lastMarkerMoved),
    lastMarkerClicked: readonly(lastMarkerClicked),
    lastPlacement: readonly(lastPlacement),
    isDrawingArea: readonly(isDrawingArea),
    areaInteractionMode: readonly(areaInteractionMode),
    areaDraftPoints: readonly(areaDraftPoints),
    lastAreaDrawn: readonly(lastAreaDrawn),
    selectedAreaId: readonly(selectedAreaId),
    selectedAreaPoint: readonly(selectedAreaPoint),
    lastAreaPointMoved: readonly(lastAreaPointMoved),
    lastAreaPointAdded: readonly(lastAreaPointAdded),
    areaPointTargetId: readonly(areaPointTargetId),

    // Actions
    initEngine,
    loadScene,
    startPlacement,
    cancelPlacement,
    startAreaDrawing,
    finishAreaDrawing,
    cancelAreaDrawing,
    startAreaPointPlacement,
    setAreaInteractionMode,
    selectAreaPoint,
    refreshAreaHighlights,
    getCameraAim,
    captureSnapshot,
    refreshMarkers,
    setFov,
    setBrightness,
    setHighlightCompression,
    setPanoramaRotation,
    setInteractionMode,
    destroyEngine,
  };
}
