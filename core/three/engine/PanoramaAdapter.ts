import type * as THREE from 'three';

/** Metadata emitted by the offline panorama asset pipeline. */
export interface MultiResolutionPanorama {
  enabled: boolean;
  sourceWidth: number;
  sourceHeight?: number;
  tileSize?: number;
  /** Logical pixels shared by neighbouring Deep Zoom tiles. */
  overlap?: number;
  /** Smallest useful Deep Zoom level; lower levels are covered by the base panorama. */
  minLevel?: number;
  /** Kept for backwards-compatible YAML; viewport-driven LOD no longer uses it. */
  minFov?: number;
  urlTemplate: string;
  maxLevel: number;
}

export interface TileStreamingOptions {
  maxConcurrentRequests?: number;
  maxUploadsPerFrame?: number;
  maxCacheBytes?: number;
  updateIntervalMs?: number;
  evictionGraceMs?: number;
  /** Extra texel headroom above one source pixel per framebuffer pixel. */
  resolutionScale?: number;
}

export interface PanoramaAdapterDiagnostics {
  enabled: boolean;
  level: number;
  loadedTiles: number;
  pendingTiles: number;
  queuedTiles: number;
  decodedTiles: number;
  cacheBytes: number;
  cacheBudgetBytes: number;
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * Rendering contract inspired by Photo Sphere Viewer's adapters.
 * PanoSphere owns the low-resolution base texture; an adapter can add a
 * projection-specific high-resolution representation without leaking that
 * logic into the engine, camera, markers, or Vue layer.
 */
export interface PanoramaAdapter {
  readonly diagnostics: PanoramaAdapterDiagnostics;
  configure(config: MultiResolutionPanorama | null, rotation: number): void;
  setRotation(rotation: number): void;
  setBrightness(value: number): void;
  setHighlightCompression(value: number): void;
  update(camera: THREE.PerspectiveCamera, now?: number): void;
  dispose(): void;
}
