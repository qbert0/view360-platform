/**
 * ─────────────────────────────────────────────────────────────────
 * MapPlugin — extends MarkerPlugin
 *
 * Adds a multi-floor map overlay to the 360° viewer.
 * Inherits ALL of MarkerPlugin's infrastructure (CSS3D, raycasting,
 * panels, drag, fade, hover) and adds:
 *   - MapMarker type registration
 *   - Camera heading → map sync
 *   - Current node → map sync (auto floor switching)
 *   - Top-level TourConfig.map support (auto-inject)
 *   - switchMode() / setVisible() / updateConfig() APIs
 * ─────────────────────────────────────────────────────────────────
 */

import { MarkerPlugin, type MarkerPluginOptions } from './MarkerPlugin';
import { MapMarker } from './markers/MapMarker';
import type { MapConfig } from '../map/IMapStrategy';
import type { TourScene, TourMarker, MapMarkerData } from '#view360/types/tour';

export interface MapPluginOptions extends MarkerPluginOptions {
  /** Default map config — auto-injected into every scene if no map marker exists. */
  defaultConfig?: MapConfig;
}

/**
 * MapPlugin — extends MarkerPlugin.
 *
 * Usage:
 * ```ts
 * engine.addPlugin(new MapPlugin({ defaultConfig: tourConfig.map }));
 * ```
 */
export class MapPlugin extends MarkerPlugin {
  override readonly id: string = 'map';
  override readonly name: string = 'Map Plugin';

  private readonly mapMarker: MapMarker;
  private readonly defaultConfig?: MapConfig;
  private currentYaw = 0;
  private currentPitch = 0;
  private currentFov = 75;
  private currentSceneId: string | null = null;
  /** Only mapped scenes are allowed to move the active pin/heading. */
  private currentSceneIsMapped = false;
  /** Map belonging to the active scene, even when its DOM panel is hidden. */
  private currentMapData: MapMarkerData | null = null;
  private mapOpenTask: Promise<void> | null = null;

  constructor(options: MapPluginOptions = {}) {
    super(options);

    this.defaultConfig = options.defaultConfig;
    this.mapMarker = new MapMarker();
    // The map is optional viewer UI. Keep it hidden until the visitor
    // explicitly opens it, unless a tour deliberately opts into visibility.
    this.mapMarker.setMapVisible(options.defaultConfig?.visible === true);

    // Register the 'map' marker type so MarkerPlugin recognizes it.
    this.registerMarkerType(this.mapMarker);
  }

  // ── Lifecycle overrides ─────────────────────────────────────

  protected override onInit(): void {
    super.onInit();

    // Sync camera heading to map every frame via the bus
    this.unsubs.push(
      this.ctx.bus.on('camera:move', ({ yaw, pitch }) => {
        this.currentYaw = yaw;
        this.currentPitch = pitch;
        if (this.currentSceneIsMapped) {
          this.mapMarker.syncCameraHeading(yaw, pitch, this.currentFov);
        }
      }),

      this.ctx.bus.on('camera:fov', ({ fov }) => {
        this.currentFov = fov;
        if (this.currentSceneIsMapped) {
          this.mapMarker.syncCameraHeading(this.currentYaw, this.currentPitch, fov);
        }
      }),
    );

    // Listen for map node clicks dispatched as DOM CustomEvents
    const handleNodeClick = (e: Event) => {
      const { nodeId, markerId } = (e as CustomEvent).detail;
      this.ctx.bus.emit('map:node:click', { markerId, nodeId });
      if (this.defaultConfig?.clickToNavigate !== false) {
        this.ctx.bus.emit('navigate', { sceneId: nodeId });
      }
    };
    document.addEventListener('map:node:click', handleNodeClick);
    this.unsubs.push(() => document.removeEventListener('map:node:click', handleNodeClick));

    this.ctx.bus.emit('map:ready', {});
  }

  protected override onUpdate(delta: number): void {
    super.onUpdate(delta);
    // Strategy.update() is handled internally by MapMarker via
    // PanelMarker.updatePanels() which MarkerPlugin already calls.
  }

  protected override onDestroy(): void {
    this.mapMarker.disposeMap();
    super.onDestroy();
    this.ctx.bus.emit('map:destroyed');
  }

  override onSceneLoad(scene: TourScene): void {
    // Don't hide the map panel during transitions — it should persist.
    // But let base class fade out the 3D sprite markers.
    super.onSceneLoad(scene);
  }

  override onSceneReady(scene: TourScene): void {
    super.onSceneReady(scene);
    this.currentSceneId = scene.id;
    this.currentYaw = this.ctx.camera.getYaw();
    this.currentPitch = this.ctx.camera.getPitch();
    this.currentFov = this.ctx.camera.getFov();

    const explicitMap = scene.markers?.find(
      (marker): marker is MapMarkerData => marker.plugin === 'map',
    );

    // Keep the active config independently from the Three.js object. The base
    // plugin disposes marker objects on every scene change, including the map
    // panel, so the viewer must be able to recreate that panel afterwards.
    this.currentMapData = explicitMap ?? this.createDefaultMapData();
    this.currentSceneIsMapped = this.isSceneShownOnMap(scene.id);

    if (this.currentMapData && !explicitMap) {
      this.addMarkerObject(this.mapMarker.createObject(this.currentMapData));
    }

    // Recreate the panel after a scene transition when it was open before.
    if (this.mapMarker.isMapVisible()) void this.ensureMapPanel();

    // A scene may exist in the tour without being a public map point. In that
    // case preserve the last mapped position instead of moving/creating a pin.
    if (this.currentSceneIsMapped) {
      this.mapMarker.syncCurrentNode(scene.id);
      this.mapMarker.syncCameraHeading(this.currentYaw, this.currentPitch, this.currentFov);
    }
  }

  // ── Public API ──────────────────────────────────────────────

  /** Toggle map visibility. */
  setVisible(visible: boolean): void {
    this.mapMarker.setMapVisible(visible);
    if (visible) void this.ensureMapPanel();
    this.ctx.bus.emit('map:visibility', { visible });
  }

  /** Get current visibility state. */
  isVisible(): boolean {
    return this.mapMarker.isMapVisible();
  }

  /** Switch map strategy at runtime. */
  async switchMode(newConfig: MapConfig): Promise<void> {
    const markerData = this.getMapMarkerData();
    if (!markerData) {
      console.warn('[MapPlugin] No map marker found to switch mode.');
      return;
    }
    Object.assign(markerData.config, newConfig);
    await this.mapMarker.switchMode(markerData, newConfig);
    this.ctx.bus.emit('map:config:updated', { config: newConfig });
  }

  /** Update config without changing strategy. */
  updateConfig(partial: Partial<MapConfig>): void {
    const markerData = this.getMapMarkerData();
    if (!markerData) return;
    Object.assign(markerData.config, partial);
    this.ctx.bus.emit('map:config:updated', { config: markerData.config });
  }

  /** Get current map config (for Vue bindings). */
  getConfig(): MapConfig | undefined {
    return this.getMapMarkerData()?.config;
  }

  // ── Private helpers ─────────────────────────────────────────

  private hasMapMarker(scene: TourScene): boolean {
    return !!scene.markers?.some((m) => m.plugin === 'map');
  }

  private getMapMarkerData(): MapMarkerData | undefined {
    if (this.currentMapData) return this.currentMapData;
    for (const child of this.group.children) {
      const marker = child.userData.marker as TourMarker | undefined;
      if (marker?.plugin === 'map') return marker as MapMarkerData;
    }
    return undefined;
  }

  private isSceneShownOnMap(sceneId: string): boolean {
    return this.currentMapData?.config.floors.some(floor =>
      floor.nodes.some(node => node.id === sceneId && node.visible === true),
    ) === true;
  }

  /**
   * Inject a virtual map marker into the scene and immediately open
   * its panel. The marker is hidden (no 3D sprite) — only the panel
   * overlay is shown.
   */
  private createDefaultMapData(): MapMarkerData | null {
    if (!this.defaultConfig) return null;
    return {
      id: '__map__',
      plugin: 'map',
      label: 'Bản đồ',
      yaw: 0,
      pitch: 0,
      config: { ...this.defaultConfig },
    };
  }

  /** Ensure that toggling the map on also creates its DOM/Leaflet panel. */
  private ensureMapPanel(): Promise<void> {
    if (this.mapOpenTask) return this.mapOpenTask;
    const markerData = this.currentMapData;
    if (!markerData) return Promise.resolve();

    let cancelled = false;
    this.mapOpenTask = this.mapMarker.openMapPanel(markerData, this.ctx.container)
      .then((opened) => {
        cancelled = !opened;
      })
      .catch((error) => {
        // A provider or Leaflet failure must not interrupt panorama rendering,
        // but dispose the partial panel so the next click can retry cleanly.
        console.error('[MapPlugin] Không thể mở bản đồ:', error);
        this.mapMarker.disposeMap();
      })
      .finally(() => {
        this.mapOpenTask = null;
        // A scene transition cancelled an older async initialization. Start
        // once more using the active scene/config instead of leaving a shell.
        if (cancelled && this.mapMarker.isMapVisible()) {
          void this.ensureMapPanel();
        }
      });
    return this.mapOpenTask;
  }
}
