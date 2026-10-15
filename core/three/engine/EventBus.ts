/**
 * ─────────────────────────────────────────────────────────────────
 * EventBus — Typed pub/sub for the View360 engine
 * All engine events are declared here for full type safety.
 * ─────────────────────────────────────────────────────────────────
 */

import type { TourScene, TourMarker, MapMarkerData } from '#view360/types/tour';
import type { MapConfig, MapNode } from '#view360/core/three/map/IMapStrategy';

// ── Event map: key → payload type ────────────────────────────────
export interface EngineEventMap {
  /** Camera yaw/pitch changed (fires every frame while moving) */
  'camera:move': { yaw: number; pitch: number };
  /** FOV changed via zoom */
  'camera:fov': { fov: number };
  /** Pointer drag started */
  'interaction:dragstart': { x: number; y: number };
  /** Pointer drag ended */
  'interaction:dragend': void;
  /** Scene fully loaded (texture on GPU, markers ready) */
  'scene:loaded': { scene: TourScene };
  /** Panorama-local world transform changed; all spatial plugins follow it. */
  'scene:rotation': { rotation: number };
  /** Panorama roll correction changed; spatial plugins follow the image. */
  'scene:roll': { roll: number };
  /** Scene transition started */
  'scene:transition:start': { from: TourScene | null; to: TourScene };
  /** Scene transition completed */
  'scene:transition:end': { scene: TourScene };
  /** Intro animation finished */
  'intro:end': void;
  /** Little Planet countdown started (before auto-play) */
  'intro:countdown:start': { delayMs: number };
  /** Countdown skipped by user click */
  'intro:countdown:skip': { yaw: number; pitch: number };
  /** Marker clicked */
  'marker:click': { marker: TourMarker };
  /** Marker hovered */
  'marker:hover': { marker: TourMarker | null };
  /** Navigate to another scene (from a navigation marker) */
  'navigate': { sceneId: string; yaw?: number; pitch?: number };
  /** Marker dragged to a new position (designer only) */
  'marker:moved': { markerId: string; yaw: number; pitch: number };
  /** Designer moved one vertex of an area highlight. */
  'area:point-moved': { areaId: string; pointIndex: number; yaw: number; pitch: number };
  /** Designer selected an area by pressing one of its vertices. */
  'area:selected': { areaId: string };
  /** Designer selected one editable vertex of an area. */
  'area:point-selected': { areaId: string; pointIndex: number };
  /** Lock camera input (e.g. while dragging a marker) */
  'interaction:lock': void;
  /** Unlock camera input */
  'interaction:unlock': void;
  /** Engine destroyed */
  'destroy': void;

  // ── Map events ───────────────────────────────────────────────
  /** Map plugin initialized */
  'map:ready': Record<string, never>;
  /** Map plugin destroyed */
  'map:destroyed': void;
  /** Map visibility toggled */
  'map:visibility': { visible: boolean };
  /** Map config updated */
  'map:config:updated': { config: MapConfig };
  /** User clicked a node on the map */
  'map:node:click': { markerId: string; nodeId: string };
}

type Listener<T> = T extends void ? () => void : (payload: T) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener<any>>>();

  on<K extends keyof EngineEventMap>(event: K, listener: Listener<EngineEventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    // Return unsubscribe function
    return () => this.off(event, listener);
  }

  off<K extends keyof EngineEventMap>(event: K, listener: Listener<EngineEventMap[K]>): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit<K extends keyof EngineEventMap>(
    event: K,
    ...args: EngineEventMap[K] extends void ? [] : [payload: EngineEventMap[K]]
  ): void {
    this.listeners.get(event)?.forEach((fn) => (fn as any)(...args));
  }

  once<K extends keyof EngineEventMap>(event: K, listener: Listener<EngineEventMap[K]>): void {
    const unsub = this.on(event, ((...args: any[]) => {
      (listener as any)(...args);
      unsub();
    }) as Listener<EngineEventMap[K]>);
  }

  clear(): void {
    this.listeners.clear();
  }
}
