/**
 * ─────────────────────────────────────────────────────────────────
 * VideoPlugin — Embeds HTML elements (iframes, video, etc.) inside
 * the 360° panorama at specific yaw/pitch coordinates.
 *
 * Works by:
 *   1. Creating an overlay <div> on top of the WebGL canvas
 *   2. Each frame: projects 3D sphere position → 2D screen coords
 *   3. Positions the HTML element absolutely at those coords
 *   4. Hides element when it faces away from camera (behind)
 *   5. Scales element proportionally when user zooms (FOV changes)
 *
 * Usage:
 *   engine.use(new VideoPlugin());
 *   // markers with plugin: 'video' are auto-discovered from scene
 * ─────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import { PluginBase } from './PluginBase';
import type { TourScene, VideoMarker } from '#view360/types/tour';

/** Internal state per iframe panel */
interface Panel {
  marker:    VideoMarker;
  container: HTMLDivElement;
  iframe:    HTMLIFrameElement;
  pos3D:     THREE.Vector3;  // world position on sphere surface
}

const SPHERE_RADIUS  = 520;
const DEFAULT_WIDTH  = 480;
const DEFAULT_HEIGHT = 270;
/** FOV at which dimensions are "native" — panels scale relative to this */
const REFERENCE_FOV  = 75;

export class VideoPlugin extends PluginBase {
  readonly id   = 'video';
  readonly name = 'Video / Iframe Plugin';

  private overlay!: HTMLDivElement;
  private panels: Panel[] = [];

  private _projVec    = new THREE.Vector3();
  private _camDir     = new THREE.Vector3();

  // ── Lifecycle ────────────────────────────────────────────────

  protected override onInit(): void {
    // Create transparent overlay on top of WebGL canvas
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position:       'absolute',
      inset:          '0',
      pointerEvents:  'none',    // pass-through by default
      overflow:       'hidden',
      zIndex:         '10',
    });

    // Insert overlay as sibling of canvas (inside container)
    this.ctx.container.style.position = 'relative';
    this.ctx.container.appendChild(this.overlay);
  }

  protected override onUpdate(_delta: number): void {
    if (this.panels.length === 0) return;

    const camera  = this.ctx.camera.camera;
    const canvas  = this.ctx.renderer.domElement;
    const cssW    = canvas.clientWidth;
    const cssH    = canvas.clientHeight;
    const fov     = camera.fov;

    // Compute current camera forward direction (world space)
    this._camDir.set(0, 0, -1).applyQuaternion(camera.quaternion);

    for (const panel of this.panels) {
      // Is the panel in front of the camera?
      const dot = panel.pos3D.clone().normalize().dot(this._camDir);

      if (dot <= 0.05) {
        // Behind camera — hide completely
        panel.container.style.display = 'none';
        continue;
      }

      // Project 3D world position to NDC
      this._projVec.copy(panel.pos3D).project(camera);

      // NDC → CSS pixels
      const screenX = (this._projVec.x + 1) / 2 * cssW;
      const screenY = (-this._projVec.y + 1) / 2 * cssH;

      // Scale relative to current FOV (zoom in = panels get bigger)
      const scale = REFERENCE_FOV / fov;
      const w = (panel.marker.width  ?? DEFAULT_WIDTH)  * scale;
      const h = (panel.marker.height ?? DEFAULT_HEIGHT) * scale;

      // Opacity based on dot product (fades near 90° edge)
      const opacity = Math.min(1, (dot - 0.05) / 0.15);

      Object.assign(panel.container.style, {
        display:   'block',
        left:      `${screenX - w / 2}px`,
        top:       `${screenY - h / 2}px`,
        width:     `${w}px`,
        height:    `${h}px`,
        opacity:   `${opacity}`,
        transform: panel.marker.rotationYaw
          ? `rotateY(${panel.marker.rotationYaw}rad)`
          : 'none',
      });
    }
  }

  protected override onDestroy(): void {
    this.clearPanels();
    this.overlay.remove();
  }

  // ── Scene hooks ────────────────────────────────────────────────

  override onSceneLoad(_scene: TourScene): void {
    // Fade out + remove all panels when switching scene
    this.clearPanels();
  }

  override onSceneReady(scene: TourScene): void {
    const videoMarkers = (scene.markers ?? []).filter(
      (m): m is VideoMarker => m.plugin === 'video',
    );
    videoMarkers.forEach((m) => this.createPanel(m));
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Programmatically add an element panel (without a TourScene marker).
   * Useful for one-off embeds from composable code.
   */
  addPanel(marker: VideoMarker): void {
    this.createPanel(marker);
  }

  removePanel(id: string): void {
    const idx = this.panels.findIndex((p) => p.marker.id === id);
    if (idx === -1) return;
    const [panel] = this.panels.splice(idx, 1);
    this.destroyPanel(panel);
  }

  // ── Private ────────────────────────────────────────────────────

  private createPanel(marker: VideoMarker): void {
    // Container — positioned absolutely inside overlay
    const container = document.createElement('div');
    Object.assign(container.style, {
      position:      'absolute',
      borderRadius:  '12px',
      overflow:      'hidden',
      boxShadow:     '0 8px 40px rgba(0,0,0,0.65)',
      pointerEvents: 'auto',   // this element IS interactive
      transition:    'opacity 0.2s ease',
      background:    '#000',
    });

    // Iframe
    const iframe = document.createElement('iframe');
    iframe.src              = this.sanitizeSrc(marker.src);
    iframe.width            = '100%';
    iframe.height           = '100%';
    iframe.style.border     = 'none';
    iframe.style.display    = 'block';
    iframe.allow            = 'fullscreen; autoplay; encrypted-media';
    iframe.allowFullscreen  = true;
    // Prevent iframe from stealing wheel/pointer events from camera
    iframe.style.pointerEvents = 'auto';

    container.appendChild(iframe);
    this.overlay.appendChild(container);

    // Pre-compute world position (stays fixed on sphere surface)
    const pos3D = new THREE.Vector3(
      -SPHERE_RADIUS * Math.sin(marker.yaw) * Math.cos(marker.pitch),
       SPHERE_RADIUS * Math.sin(marker.pitch),
      -SPHERE_RADIUS * Math.cos(marker.yaw) * Math.cos(marker.pitch),
    );

    this.panels.push({ marker, container, iframe, pos3D });
  }

  private clearPanels(): void {
    this.panels.forEach((p) => this.destroyPanel(p));
    this.panels = [];
  }

  private destroyPanel(panel: Panel): void {
    // Stop iframe load (pauses audio/video)
    panel.iframe.src = 'about:blank';
    panel.container.remove();
  }

  /**
   * Convert a plain YouTube watch URL to embed URL if needed.
   * https://youtube.com/watch?v=XYZ → https://www.youtube-nocookie.com/embed/XYZ
   */
  private sanitizeSrc(src: string): string {
    try {
      const url = new URL(src);
      if (url.hostname.includes('youtube.com') && url.pathname === '/watch') {
        const v = url.searchParams.get('v');
        if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
      }
      if (url.hostname === 'youtu.be') {
        const v = url.pathname.slice(1);
        if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
      }
    } catch {}
    return src;
  }
}
