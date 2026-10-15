// ─────────────────────────────────────────────────────────────────────────────
// Tour type system — supports plugin-based markers
// ─────────────────────────────────────────────────────────────────────────────

import type { MapConfig } from '#view360/core/three/map/IMapStrategy';

export interface PlaneMarkerScale {
  /** Horizontal scale multiplier, clamped by the engine to 0.1–10. */
  scaleX?: number;
  /** Vertical scale multiplier, clamped by the engine to 0.1–10. */
  scaleY?: number;
}

/** Optional geometry overrides used only on mobile viewports. */
export interface MarkerMobileView {
  yaw?: number;
  pitch?: number;
  sphereRadius?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  iconSize?: number;
  width?: number;
  height?: number;
  placement?: 'vertical' | 'horizontal';
}

export interface ResponsiveMarker {
  /** Missing mobile properties inherit their desktop values. */
  mobileView?: MarkerMobileView;
}

/** Navigation marker — moves to another scene */
export interface NavigationMarker extends PlaneMarkerScale, ResponsiveMarker {
  id: string;
  plugin: 'navigation';
  label: string;
  yaw: number;
  pitch: number;
  /** Khoảng cách từ tâm camera trên mặt cầu 3D. Mặc định 520, hợp lệ 120–580. */
  sphereRadius?: number;
  targetScene: string;
  /**
   * 3D rotation of the nav arrow (all in radians, applied AFTER lookAt toward sphere center).
   *
   * rotZ — spin around the camera-facing normal axis
   *         0 = ^^ points up, PI/2 = points right, PI = points down
   * rotX — tilt forward/backward (X axis = right on sphere surface)
   *         positive = tilt top away from camera (lay flat forward)
   * rotY — swivel left/right (Y axis = up on sphere surface)
   *         positive = face left, negative = face right
   *
   * `rotation` is kept for backward compatibility (alias for rotZ).
   */
  rotation?: number;   // backward compat = rotZ
  rotZ?: number; // navigation arrow default: 0
  rotX?: number; // navigation arrow default: PI/3 (60°)
  rotY?: number; // navigation arrow default: 0

  /**
   * Display mode for navigation marker:
   *   - `'arrow'` (default) — animated navigation arrow
   *   - `'location-1'` — rounded location pin
   *   - `'location-2'` — narrow location pin with a longer tail
   *
   * `arrow-1`, `arrow-2`, `pin`, `pin-top` and `anchor` are retained only
   * for backward compatibility with tours saved by older editor versions.
   */
  icon?: 'arrow' | 'local' | 'drone' | 'location-1' | 'location-2' | 'arrow-1' | 'arrow-2' | 'pin' | 'pin-top' | 'anchor';
  /** Location-pin color (CSS color string). Default: '#171717'. */
  pinColor?: string;
  /**
   * Optional URL to an image embedded inside the pin as a circular inset.
   * Only used when `icon` is `'pin'`. Typically the thumbnail of the target scene.
   */
  iconUrl?: string;
  /** Pin display size in world units (default 65). Only used in pin mode. */
  iconSize?: number;
  /** Font used by the public viewer's navigation title. */
  labelFont?: 'be-vietnam-pro' | 'outfit' | 'montserrat' | 'serif';

  /** Tên điểm (fallback cho label) */
  name?: string;

}

/** Info marker — shows a text popup */
export interface InfoMarker extends ResponsiveMarker {
  id: string;
  plugin: 'info';
  label: string;
  yaw: number;
  pitch: number;
  content: string;
}

/** Audio marker — plays an audio file */
export interface AudioMarker extends ResponsiveMarker {
  id: string;
  plugin: 'audio';
  label: string;
  yaw: number;
  pitch: number;
  src: string;
}

/** AI Chat marker — opens AI Q&A panel */
export interface AIChatMarker extends ResponsiveMarker {
  id: string;
  plugin: 'ai-chat';
  label: string;
  yaw: number;
  pitch: number;
  context?: string; // extra context to give the AI about this location
}

export interface TextPanelBlock {
  id: string;
  type: 'text';
  content: string;
  /** Controls whether the source text, its generated narration, or both are shown. */
  presentation?: 'text-only' | 'text-and-audio' | 'audio-only';
  speech?: { src?: string; lang?: string; rate?: number; pitch?: number };
}

export interface AudioPanelBlock { id: string; type: 'audio'; src: string }
export interface ImagePanelBlock { id: string; type: 'image'; src: string; alt?: string; caption?: string }
export interface Image3DPanelBlock { id: string; type: 'image3d'; image: string; caption?: string }
export interface AIChatPanelBlock { id: string; type: 'ai-chat'; context?: string }

/** Content units rendered and managed by PanelMarker through BlockBase. */
export type PanelBlock = TextPanelBlock | AudioPanelBlock | ImagePanelBlock | Image3DPanelBlock | AIChatPanelBlock;

/** Composite panel marker — contents can be mixed and ordered freely. */
export interface PanelMarkerData extends ResponsiveMarker {
  id: string;
  plugin: 'panel';
  label: string;
  yaw: number;
  pitch: number;
  placement?: 'vertical' | 'horizontal';
  contents: PanelBlock[];
}

/**
 * Video / Iframe marker — embeds an HTML element (YouTube, video, etc.)
 * directly inside the panorama at a specific yaw/pitch position.
 */
export interface VideoMarker extends PlaneMarkerScale, ResponsiveMarker {
  id: string;
  plugin: 'video';
  label: string;
  yaw: number;
  pitch: number;
  /** YouTube embed URL, video URL, or any iframe-compatible URL */
  src: string;
  /** CSS3D panel width in pixels (default 640). */
  width?: number;
  /** CSS3D panel height in pixels (default 360). */
  height?: number;
  /** @deprecated Backward-compatible alias for the former horizontal rotation. */
  rotationYaw?: number;
  /** Local X-axis tilt in radians, applied after the panel faces the camera. */
  rotX?: number;
  /** Local Y-axis swivel in radians, applied after the panel faces the camera. */
  rotY?: number;
  /** Local Z-axis roll in radians, applied after the panel faces the camera. */
  rotZ?: number;
}

/** Object showcase — opens a manually supplied 3D/360 render image and description. */
export interface Model3DMarker extends ResponsiveMarker {
  id: string;
  plugin: 'model3d';
  label: string;
  yaw: number;
  pitch: number;
  /** Image/render supplied by the tour designer; the app does not generate it. */
  image: string;
  content?: string;
}

/** Map overlay marker — renders an interactive map panel in a corner. */
export interface MapMarkerData extends ResponsiveMarker {
  id: string;
  plugin: 'map';
  label: string;
  yaw: number;
  pitch: number;
  config: MapConfig;
}

export interface AreaHighlightPoint {
  yaw: number;
  pitch: number;
}

/** A short-lived polygon animation attached to the panorama surface. */
export interface AreaHighlight {
  id: string;
  points: AreaHighlightPoint[];
  color?: string;
  outlineColor?: string;
  opacity?: number;
  delayMs?: number;
  durationMs?: number;
  radius?: number;
  mode?: 'fill' | 'outline' | 'fill-outline';
  lineWidth?: number;
}

/** Union of all marker types */
export type TourMarker = NavigationMarker | PanelMarkerData | InfoMarker | AudioMarker | AIChatMarker | VideoMarker | Model3DMarker | MapMarkerData;

/** Resolve one marker for a device without mutating the persisted desktop data. */
export function resolveMarkerView(marker: TourMarker, mobile: boolean): TourMarker {
  if (!mobile || !marker.mobileView) return marker;
  return { ...marker, ...marker.mobileView } as TourMarker;
}


/** A single 360° scene within a tour */
export interface TourScene {
  id: string;
  title: string;
  subtitle: string;
  panorama: string;
  /** Untouched 8K/12K upload used to generate multi-resolution assets. */
  sourcePanorama?: string;
  /** Fast 2K panorama shown immediately while the viewer waits for full quality. */
  previewPanorama?: string;
  /** Bandwidth-friendly panorama selected on small/coarse-pointer devices. */
  mobilePanorama?: string;
  /** Optional GPU-compressed candidate. Benchmark before enabling in production. */
  ktx2Panorama?: string;
  /**
   * Offline-generated Deep Zoom pyramid for viewport-driven 8K–16K streaming.
   * It is also useful for large 5.7K sources to avoid monolithic GPU uploads.
   */
  multiRes?: {
    enabled: boolean;
    sourceWidth: number;
    sourceHeight?: number;
    tileSize?: number;
    /** Deep Zoom gutter shared by neighbouring tiles. */
    overlap?: number;
    /** First pyramid level above the pinned preview panorama. */
    minLevel?: number;
    minFov?: number;
    urlTemplate: string;
    maxLevel: number;
  };
  thumbnail: string;
  /** Lower-resolution 2:1 panorama used only by the admin designer. */
  editorPanorama?: string;
  initialYaw: number;
  initialPitch: number;
  /** Vertical camera field of view saved with the entry camera. 75° = default zoom. */
  initialFov?: number;
  /** Apply initialYaw/initialPitch whenever the viewer enters this scene. */
  defaultCameraEnabled?: boolean;
  /** Apply initialFov without forcing the saved yaw/pitch. */
  defaultZoomEnabled?: boolean;
  /**
   * Optional entry camera overrides for phones. Missing values inherit the
   * desktop camera settings above, keeping existing tours backward compatible.
   */
  mobileView?: {
    initialYaw?: number;
    initialPitch?: number;
    initialFov?: number;
    defaultCameraEnabled?: boolean;
    defaultZoomEnabled?: boolean;
  };
  /** Rotation of the panorama and its scene markers in world space, radians. */
  panoramaRotation?: number;
  /**
   * Roll correction for the panorama in radians (rotation around the Z / forward axis).
   * Use this to straighten tilted 360° photos. Positive = clockwise.
   */
  panoramaRoll?: number;
  /** Panorama brightness multiplier. 1 = original, recommended range 0.6–1.6. */
  brightness?: number;
  /** Soft highlight roll-off. 0 = original, 1 = strongest compression. */
  highlightCompression?: number;
  coordinates?: [number, number];
  /** Persist this scene as a public map point. Current scene is always shown. */
  showOnMap?: boolean;
  markers: TourMarker[];
  /** Animated areas shown once when this scene becomes ready. */
  areaHighlights?: AreaHighlight[];
}

/** Full tour configuration — loaded from YAML */
export interface TourConfig {
  /** Brand application that owns this tour. */
  siteId?: string;
  slug: string;
  title: string;
  location: string;
  summary: string;
  duration?: string;
  theme?: string;            // 'nature' | 'tourism' | 'minimal'
  initialSceneId?: string;   // optional: ID of initial scene to load
  plugins?: string[];        // enabled plugins list
  mode?: 'free' | 'guided';  // 'free' | 'guided'
  guidedDuration?: number;   // seconds per scene in guided mode
  autoRotate?: boolean;      // auto rotate panorama
  showMinimap?: boolean;     // show mini map
  transition?: 'crossfade' | 'forward' | 'fly-through' | 'crossfade-pan';
  transitionDuration?: number;
  transitionColor?: string;
  thumbnailFallbackAfterMs?: number;
  preloadEnabled?: boolean;
  preloadRadius?: number;
  minOverlayMs?: number;
  /** Multi-floor interactive map configuration */
  map?: MapConfig;
  scenes: TourScene[];
}

/** Lightweight tour entry for listing (no scenes) */
export interface TourEntry {
  slug: string;
  title: string;
  location: string;
  summary: string;
  sceneCount: number;
  /** Scene opened directly from the admin tour list. */
  firstSceneId?: string;
  cover?: string;
  theme?: string;
}
