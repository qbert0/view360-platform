/**
 * ─────────────────────────────────────────────────────────────────
 * IMapStrategy — Strategy pattern for map rendering modes
 *
 * Multi-floor support: each floor has its own image and node set.
 * MapMarker delegates rendering/interaction to the active strategy.
 * ─────────────────────────────────────────────────────────────────
 */

import type { Camera } from 'three';

// ── Node ─────────────────────────────────────────────────────────

export interface MapNodeExit {
  /** Target floor id */
  floorId: string;
  /** Target node id on that floor */
  nodeId: string;
}

export interface MapNode {
  /** Must match scene.id */
  id: string;
  name: string;
  /** X position on the floorplan image (pixels from left) */
  x: number;
  /** Y position on the floorplan image (pixels from top) */
  y: number;
  /** Real-world longitude, populated from TourScene.coordinates. */
  longitude?: number;
  /** Real-world latitude, populated from TourScene.coordinates. */
  latitude?: number;
  /** Show while inactive. The current camera node is always rendered. */
  visible?: boolean;
  /** IDs of neighboring nodes (for connection lines) */
  neighbors: string[];
  /** If this node connects to a different floor */
  exitTo?: MapNodeExit;
}

// ── Floor ────────────────────────────────────────────────────────

export interface MapFloor {
  id: string;
  name: string;
  /** Short label for tabs (e.g. 'Sân', 'Xưởng') */
  shortName?: string;
  /** URL to the floorplan image */
  imageUrl: string;
  /** Original image width in px (for coordinate normalization) */
  imageWidth: number;
  /** Original image height in px */
  imageHeight: number;
  /** Nodes on this floor */
  nodes: MapNode[];
}

// ── Config ───────────────────────────────────────────────────────

export interface MapConfig {
  floors: MapFloor[];
  /** Default floor to show on open */
  defaultFloorId?: string;

  // UI
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  width?: number;
  height?: number;
  visible?: boolean;

  // Behavior
  showConnections?: boolean;
  showCameraArrow?: boolean;
  clickToNavigate?: boolean;
  showFloorTabs?: boolean;
  /** Auto-switch floor tab when navigating to a scene on a different floor */
  autoSwitchFloor?: boolean;
  /** Prefer the real Leaflet map when geo coordinates are available. */
  mode?: 'auto' | 'floorplan' | 'real';
}

// ── Strategy interface ───────────────────────────────────────────

export interface IMapStrategy {
  /** Initialize the strategy inside the given DOM container. */
  init(config: MapConfig, container: HTMLElement): Promise<void>;

  /** Called every frame. Strategies that need animation use this. */
  update(deltaTime: number, camera?: Camera): void;

  /** Highlight the current node and optionally switch floor. */
  setCurrentNode(nodeId: string): void;

  /** Sync the camera heading indicator on the map. */
  setCameraHeading(yaw: number, pitch: number, fov?: number): void;

  /** Switch to a specific floor tab. */
  setFloor(floorId: string): void;

  /** Show/hide the map. */
  setVisible(visible: boolean): void;

  /** Resize the map container. */
  resize(width: number, height: number): void;

  /** Clean up all resources. */
  dispose(): void;

  /** Callback when user clicks a node on the map. */
  onNodeClick?: (nodeId: string) => void;

  /** Callback when user switches floor tab. */
  onFloorChange?: (floorId: string) => void;
}
