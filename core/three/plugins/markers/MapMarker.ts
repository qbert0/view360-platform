/**
 * ─────────────────────────────────────────────────────────────────
 * MapMarker — extends PanelMarker
 *
 * Renders an interactive map overlay panel in a corner of the viewer.
 * Delegates rendering to IMapStrategy (2D / real / 3D).
 *
 * Because it extends PanelMarker, MarkerPlugin automatically:
 *  - calls updatePanels() every frame
 *  - includes it in panelMarkerTypes()
 *  - closes it on scene transition via hideAllPanels()
 * ─────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import { PanelMarker } from './PanelMarker';
import { MapStrategyFactory } from '../../map/MapStrategyFactory';
import type { IMapStrategy, MapConfig } from '../../map/IMapStrategy';
import type { TourMarker, MapMarkerData } from '#view360/types/tour';

/**
 * MapMarker — panel-based marker that displays a map overlay.
 *
 * Unlike other PanelMarker subclasses, MapMarker does NOT anchor to a
 * 3D world-space position. Instead it renders a fixed-position panel
 * in a corner of the viewer container.
 */
export class MapMarker extends PanelMarker {
  // @ts-expect-error — narrowing literal type from parent's 'panel'
  override readonly markerType = 'map' as const;
  protected override readonly style = { color: '#2563eb', icon: '🗺', label: 'Bản đồ' };

  private strategy: IMapStrategy | null = null;
  private panelEl: HTMLElement | null = null;
  private mapContainer: HTMLElement | null = null;
  private heading = { yaw: 0, pitch: 0, fov: 75 };
  private _currentNodeId: string | null = null;
  private _visible = true;
  private lifecycle = 0;
  private ready = false;

  // ── Type guard ───────────────────────────────────────────────

  override supports(marker: TourMarker): marker is MapMarkerData {
    return marker.plugin === 'map';
  }

  // ── Sprite anchor ───────────────────────────────────────────

  override createObject(marker: MapMarkerData): THREE.Object3D {
    // Map doesn't appear as a 3D sprite — create a minimal invisible anchor.
    // The actual map UI is a DOM overlay managed separately.
    const sprite = super.createObject(marker);
    // Make the sprite invisible — map is shown via DOM overlay.
    if (sprite instanceof THREE.Sprite) {
      sprite.material.opacity = 0;
      sprite.material.depthTest = false;
      sprite.visible = false;
    }
    return sprite;
  }

  // ── Panel lifecycle ─────────────────────────────────────────

  /**
   * Open or close the map panel. Called from MapPlugin, not from
   * the regular marker-click flow.
   */
  async openMapPanel(
    marker: MapMarkerData,
    container: HTMLElement,
  ): Promise<boolean> {
    if (this.panelEl && this.ready) {
      // Already open — just ensure visible
      this.panelEl.style.display = this._visible ? 'block' : 'none';
      this.strategy?.setVisible(this._visible);
      return true;
    }

    const lifecycle = ++this.lifecycle;
    this.ready = false;

    // Create fixed-position panel
    this.panelEl = document.createElement('div');
    this.panelEl.className = 'view360-map-panel';
    this.panelEl.style.cssText = [
      'position:absolute',
      'z-index:50',
      'pointer-events:auto',
      'border-radius:12px',
      'overflow:hidden',
      'box-shadow:0 8px 32px rgba(0,0,0,0.35)',
      'border:1px solid rgba(255,255,255,0.12)',
      'backdrop-filter:blur(8px)',
      'background:rgba(10,10,20,0.85)',
      'transition:opacity .2s ease',
      this.positionCSS(marker.config.position ?? 'bottom-left'),
      `width:${marker.config.width ?? 300}px`,
      `height:${marker.config.height ?? 220}px`,
    ].join(';');

    if (!document.getElementById('view360-leaflet-map-style')) {
      const style = document.createElement('style');
      style.id = 'view360-leaflet-map-style';
      style.textContent = `
        .view360-map-panel .leaflet-control-layers{font:11px "Be Vietnam Pro",sans-serif;border:0;border-radius:8px;box-shadow:0 3px 14px rgba(0,0,0,.28)}
        .view360-map-panel .leaflet-control-attribution{font-size:8px;background:rgba(255,255,255,.78)}
        .v360-map-marker-wrap{background:none!important;border:0!important}
        .v360-map-dot{position:absolute;left:50%;top:50%;width:16px;height:16px;transform:translate(-50%,-50%);border:3px solid #fff;border-radius:50%;background:#3b82f6;box-shadow:0 2px 8px rgba(0,0,0,.55)}
        .v360-map-dot.is-active{width:22px;height:22px;background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.28),0 2px 9px rgba(0,0,0,.55)}
        .v360-map-heading{position:absolute;left:50%;top:-9px;width:0;height:0;transform-origin:50% 30px;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:15px solid #f59e0b;filter:drop-shadow(0 1px 2px rgba(0,0,0,.65))}
      `;
      document.head.appendChild(style);
    }

    // Prevent panorama drag when interacting with map
    ['pointerdown', 'pointerup', 'click', 'wheel', 'touchstart', 'touchend'].forEach((name) => {
      this.panelEl!.addEventListener(name, (e) => e.stopPropagation());
    });

    this.mapContainer = document.createElement('div');
    this.mapContainer.style.cssText = 'width:100%;height:100%';
    this.panelEl.appendChild(this.mapContainer);

    const loadingEl = document.createElement('div');
    loadingEl.textContent = 'Đang tải bản đồ…';
    loadingEl.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;color:rgba(255,255,255,.7);font:500 12px "Be Vietnam Pro",sans-serif;pointer-events:none';
    this.panelEl.appendChild(loadingEl);
    container.appendChild(this.panelEl);

    // Initialize strategy
    const panelEl = this.panelEl;
    const mapContainer = this.mapContainer;
    const strategy = MapStrategyFactory.create(marker.config);
    this.strategy = strategy;
    strategy.onNodeClick = (nodeId: string) => {
      document.dispatchEvent(
        new CustomEvent('map:node:click', {
          detail: { markerId: marker.id, nodeId },
          bubbles: true,
        }),
      );
    };

    await strategy.init(marker.config, mapContainer);

    // Scene changes can dispose the panel while Leaflet's dynamic import or
    // tile strategy is still initializing. Never let that obsolete task mark
    // the newly active map as ready.
    if (lifecycle !== this.lifecycle || this.panelEl !== panelEl) {
      strategy.dispose();
      panelEl.remove();
      return false;
    }

    loadingEl.remove();
    this.ready = true;
    if (this._currentNodeId) strategy.setCurrentNode(this._currentNodeId);
    strategy.setCameraHeading(this.heading.yaw, this.heading.pitch, this.heading.fov);

    if (!this._visible) this.panelEl.style.display = 'none';
    else strategy.setVisible(true);
    return true;
  }

  // ── Sync methods (called by MapPlugin) ──────────────────────

  syncCameraHeading(yaw: number, pitch: number, fov?: number): void {
    this.heading = { yaw, pitch, fov: fov ?? 75 };
    this.strategy?.setCameraHeading(yaw, pitch, fov);
  }

  syncCurrentNode(nodeId: string): void {
    this._currentNodeId = nodeId;
    this.strategy?.setCurrentNode(nodeId);
  }

  setMapVisible(visible: boolean): void {
    this._visible = visible;
    if (this.panelEl) this.panelEl.style.display = visible ? 'block' : 'none';
    this.strategy?.setVisible(visible);
  }

  isMapVisible(): boolean {
    return this._visible;
  }

  /**
   * Switch strategy at runtime. Disposes old, creates new.
   */
  async switchMode(marker: MapMarkerData, newConfig: MapConfig): Promise<void> {
    this.strategy?.dispose();
    this.strategy = null;
    if (this.mapContainer) this.mapContainer.innerHTML = '';

    this.strategy = MapStrategyFactory.create(newConfig);
    this.strategy.onNodeClick = (nodeId: string) => {
      document.dispatchEvent(
        new CustomEvent('map:node:click', {
          detail: { markerId: marker.id, nodeId },
          bubbles: true,
        }),
      );
    };

    if (this.mapContainer) {
      await this.strategy.init(newConfig, this.mapContainer);
      if (this._currentNodeId) this.strategy.setCurrentNode(this._currentNodeId);
      this.strategy.setCameraHeading(this.heading.yaw, this.heading.pitch, this.heading.fov);
    }
  }

  // ── Dispose ─────────────────────────────────────────────────

  override disposeObject(object: THREE.Object3D): void {
    super.disposeObject(object);
    this.disposeMap();
  }

  disposeMap(): void {
    this.lifecycle++;
    this.ready = false;
    this.strategy?.dispose();
    this.strategy = null;
    this.panelEl?.remove();
    this.panelEl = null;
    this.mapContainer = null;
  }

  // ── Helpers ─────────────────────────────────────────────────

  private positionCSS(pos: string): string {
    switch (pos) {
      case 'top-left':     return 'top:16px;left:16px';
      case 'top-right':    return 'top:16px;right:16px';
      case 'bottom-left':  return 'bottom:16px;left:16px';
      case 'bottom-right': return 'bottom:16px;right:16px';
      default:             return 'bottom:16px;left:16px';
    }
  }
}
