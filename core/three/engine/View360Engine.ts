/**
 * ─────────────────────────────────────────────────────────────────
 * View360Engine — Core rendering engine
 *
 * Wires together: Renderer, CameraController, PanoSphere, EventBus,
 * and a plugin registry. Drives the rAF loop.
 * ─────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import { EventBus } from './EventBus';
import { CameraController, type CameraConfig } from './CameraController';
import { PanoSphere, type Ktx2BenchmarkResult, type PanoSphereConfig, type TransitionStyle } from './PanoSphere';
import { PluginBase } from '../plugins/PluginBase';
import type { TourScene } from '#view360/types/tour';

export interface View360EngineOptions {
  container: HTMLElement;
  camera?: CameraConfig;
  pano?: PanoSphereConfig;
  pixelRatio?: number;   // default min(devicePixelRatio, 2)
  antialias?: boolean;   // default true
  toneMappingExposure?: number;  // default 1.0
  /** Viewer-only high-resolution tile streaming. Disable in the admin designer. */
  enableTiling?: boolean;
  /**
   * Delay (ms) before the Little Planet intro auto-starts.
   * During the countdown, clicking the canvas skips to the clicked angle.
   * Set to 0 to start immediately. Default: 0
   */
  introDelay?: number;
}

/** Snapshot of GPU/rendering metrics — returned by getDiagnostics() */
export interface EngineDiagnostics {
  /** Source image size (original file) */
  srcWidth: number;
  srcHeight: number;
  /** Effective size after GPU maxTextureSize cap */
  gpuWidth: number;
  gpuHeight: number;
  /** GPU maximum texture size (4096 / 8192 / 16384) */
  maxTexSize: number;
  /** True if source image exceeds maxTexSize (GPU downscaled it) */
  isCapped: boolean;
  /** CSS canvas size */
  canvasCssW: number;
  canvasCssH: number;
  /** WebGL framebuffer size (CSS × DPR) */
  canvasGlW: number;
  canvasGlH: number;
  /** Current renderer DPR */
  dpr: number;
  /** Physical device DPR */
  deviceDpr: number;
  /** Current camera FOV */
  fov: number;
  /** Source pixels per screen pixel in current view (>1 = surplus detail, <1 = upscaling) */
  pixelDensity: number;
  /** URL of the current panorama */
  textureUrl: string;
  textureFormat: 'bitmap' | 'ktx2';
  textureLoadMs: number;
  textureTransferBytes: number;
  gpuCompressed: boolean;
  tilingEnabled: boolean;
  tileLevel: number;
  loadedTiles: number;
  pendingTiles: number;
  queuedTiles: number;
  decodedTiles: number;
  tileCacheBytes: number;
  tileCacheBudgetBytes: number;
  /** GPU vendor string */
  vendor: string;
  /** GPU renderer string */
  renderer: string;
}

export class View360Engine {
  readonly bus: EventBus;
  readonly camera: CameraController;
  readonly pano: PanoSphere;

  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;

  private plugins = new Map<string, PluginBase>();
  private rafId: number | null = null;
  private lastTime: number | null = null;

  private currentScene: TourScene | null = null;
  private isTransitioning = false;
  private introDelay: number;
  private _introCountdownTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastContainerSize = { width: 0, height: 0 };
  private readonly enableTiling: boolean;

  constructor(opts: View360EngineOptions) {
    this.container = opts.container;
    this.enableTiling = opts.enableTiling ?? true;

    // ── Scene ──
    this.scene = new THREE.Scene();
    this.bus = new EventBus();

    // ── Renderer ──
    const w = opts.container.clientWidth || window.innerWidth;
    const h = opts.container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: opts.antialias ?? true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(opts.pixelRatio ?? Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = opts.toneMappingExposure ?? 1.0;
    this.container.appendChild(this.renderer.domElement);

    // ── Camera ──
    this.camera = new CameraController(
      this.container,
      this.renderer.domElement,
      this.bus,
      opts.camera ?? {},
    );

    // ── Panorama Sphere ──
    this.pano = new PanoSphere(this.scene, this.renderer, opts.pano ?? {});

    // ── Resize handler ──
    window.addEventListener('resize', this.onResize);
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const width = Math.round(entry.contentRect.width);
        const height = Math.round(entry.contentRect.height);
        if (width <= 0 || height <= 0) return;
        this.resizeTo(width, height);
      });
      this.resizeObserver.observe(this.container);
    }

    this.introDelay = opts.introDelay ?? 0;

    // ── Start loop ──
    this.rafId = requestAnimationFrame(this.loop);
  }

  // ── Plugin Registry ────────────────────────────────────────────

  use(plugin: PluginBase): this {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[View360Engine] Plugin "${plugin.id}" already registered.`);
      return this;
    }
    this.plugins.set(plugin.id, plugin);
    plugin._init({
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      bus: this.bus,
      container: this.container,
    });
    return this;
  }

  getPlugin<T extends PluginBase>(id: string): T | undefined {
    return this.plugins.get(id) as T | undefined;
  }

  // ── Scene API ──────────────────────────────────────────────────

  /**
   * Load a scene.
   * @param playIntro - if true, plays the Little Planet intro animation
   *                    (with optional countdown delay + click-to-skip)
   */
  async loadScene(scene: TourScene, playIntro = true): Promise<void> {
    // Cancel any pending countdown from a previous call
    if (this._introCountdownTimer !== null) {
      clearTimeout(this._introCountdownTimer);
      this._introCountdownTimer = null;
    }

    const previousYaw = this.camera.getYaw();
    const previousPitch = this.camera.getPitch();
    const useDefaultCamera = scene.defaultCameraEnabled === true;
    const useDefaultZoom = scene.defaultZoomEnabled ?? useDefaultCamera;
    this.currentScene = scene;
    this.notifyPluginsSceneLoad(scene);
    this.pano.setBrightness(scene.brightness ?? 1.25);
    this.pano.setHighlightCompression(scene.highlightCompression ?? 0);
    // Remove previous high-resolution patches before the base-sphere crossfade.
    // Destination tiles are enabled only after the transition completes.
    this.pano.setMultiResolution(null);

    const initialPanorama = scene.previewPanorama ?? scene.panorama;
    // Apply both panorama axes before publishing the decoded texture. This
    // prevents a visible upright frame followed by a late roll correction.
    const panoramaApplied = await this.pano.setImmediate(
      initialPanorama,
      scene.panoramaRotation ?? 0,
      scene.panoramaRoll ?? 0,
    );
    if (!panoramaApplied) return;

    if (playIntro) {
      const targetYaw = useDefaultCamera ? (scene.initialYaw ?? 0) : previousYaw;
      const targetPitch = useDefaultCamera ? (scene.initialPitch ?? 0) : previousPitch;
      const targetFov = useDefaultZoom ? (scene.initialFov ?? 75) : this.camera.getFov();

      // Park camera at start position (looking down, wide FOV)
      this.camera.setRaw(-Math.PI / 2, -Math.PI / 2, 130);

      // Start viewport-driven refinement as soon as the preview and the intro
      // camera are ready. The adapter already limits concurrent downloads and
      // GPU uploads per frame, so detail can improve during Little Planet
      // instead of waiting 2.5 seconds for the animation to finish.
      this.pano.setMultiResolution(
        this.enableTiling ? (scene.multiRes ?? null) : null,
        scene.panoramaRotation ?? 0,
        scene.panoramaRoll ?? 0,
      );

      if (this.introDelay > 0) {
        // ── Countdown phase: lock input, wait for delay OR click ──
        this.bus.emit('interaction:lock');
        this.bus.emit('intro:countdown:start', { delayMs: this.introDelay });

        await new Promise<void>((resolve) => {
          // Click to skip: read NDC from canvas click → derive pitch/yaw
          const canvas = this.renderer.domElement;

          const onSkipClick = (e: MouseEvent) => {
            clearTimeout(this._introCountdownTimer!);
            this._introCountdownTimer = null;
            canvas.removeEventListener('click', onSkipClick);

            // Compute clicked yaw/pitch from mouse position
            const rect  = canvas.getBoundingClientRect();
            const ndcX  = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
            const ndcY  = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
            const hFov  = (130 * Math.PI) / 180 / 2;
            const clickYaw   = targetYaw   + ndcX * hFov * (rect.width / rect.height);
            const clickPitch = targetPitch - ndcY * hFov;

            this.bus.emit('intro:countdown:skip', { yaw: clickYaw, pitch: clickPitch });
            resolve();
          };

          canvas.addEventListener('click', onSkipClick);

          this._introCountdownTimer = setTimeout(() => {
            canvas.removeEventListener('click', onSkipClick);
            this._introCountdownTimer = null;
            resolve();
          }, this.introDelay);
        });

        this.bus.emit('interaction:unlock');
      }

      await this.playLittlePlanetIntro(targetYaw, targetPitch, targetFov);
    } else {
      // Designer and direct loads obey the same rule as navigation: scenes
      // without a default camera keep the viewer's current world direction.
      this.camera.setOrientation(
        useDefaultCamera ? (scene.initialYaw ?? 0) : previousYaw,
        useDefaultCamera ? (scene.initialPitch ?? 0) : previousPitch,
        useDefaultZoom ? (scene.initialFov ?? 75) : this.camera.getFov(),
      );

      this.pano.setMultiResolution(
        this.enableTiling ? (scene.multiRes ?? null) : null,
        scene.panoramaRotation ?? 0,
        scene.panoramaRoll ?? 0,
      );
    }

    this.bus.emit('scene:loaded', { scene });
    this.notifyPluginsSceneReady(scene);
  }

  /**
   * Rotate panorama-local space as one engine-level operation.
   * Spatial plugins subscribe to `scene:rotation`; callers must not reach into
   * individual plugins to keep their objects aligned.
   */
  setSceneRotation(rotation: number): void {
    const normalized = Number.isFinite(rotation) ? rotation : 0;
    if (this.currentScene) this.currentScene.panoramaRotation = normalized;
    this.pano.setRotation(normalized);
    this.bus.emit('scene:rotation', { rotation: normalized });
  }

  /**
   * Apply roll correction to panorama-local space. Rotating the image sphere
   * keeps camera controls level and lets the correction exist before a newly
   * loaded texture becomes visible.
   */
  setSceneRoll(roll: number): void {
    const normalized = Number.isFinite(roll) ? roll : 0;
    if (this.currentScene) this.currentScene.panoramaRoll = normalized;
    this.pano.setRoll(normalized);
    this.bus.emit('scene:roll', { roll: normalized });
  }

  /**
   * Transition to a new scene.
   */
  async navigateTo(
    scene: TourScene,
    transition?: TransitionStyle,
    flyYaw?: number,
    flyPitch?: number,
  ): Promise<void> {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const from = this.currentScene;
    this.bus.emit('scene:transition:start', { from, to: scene });
    this.notifyPluginsSceneLoad(scene);
    this.pano.setBrightness(scene.brightness ?? 1.25);
    this.pano.setHighlightCompression(scene.highlightCompression ?? 0);
    this.pano.setMultiResolution(null);

    // Compute fly direction vector from current camera aim
    const yaw = flyYaw ?? this.camera.getYaw();
    const pitch = flyPitch ?? this.camera.getPitch();
    const dir = new (await import('three')).Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
       Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );

    // Animate camera into scene during transition
    const camStartPos = this.camera.camera.position.clone();
    const camEndPos = dir.clone().multiplyScalar(this.pano['radius'] * 0.85);

    // Camera belongs to world space and remains independent of the panorama.
    // Scene alignment is applied by rotating PanoSphere itself.
    const startYaw = this.camera.getYaw();
    const startPitch = this.camera.getPitch();
    const useDefaultCamera = scene.defaultCameraEnabled === true;
    const useDefaultZoom = scene.defaultZoomEnabled ?? useDefaultCamera;
    const destYaw = useDefaultCamera ? (scene.initialYaw ?? 0) : startYaw;
    const destPitch = useDefaultCamera ? (scene.initialPitch ?? 0) : startPitch;
    const destFov = useDefaultZoom ? (scene.initialFov ?? 75) : this.camera.getFov();
    // Take the shortest path around the yaw circle.
    const yawDelta = Math.atan2(Math.sin(destYaw - startYaw), Math.cos(destYaw - startYaw));
    const baseFov = this.camera.getFov();
    const travelDistance = this.pano['radius'] * 0.28;

    const transitionStyle = transition ?? this.pano.transitionStyle;
    const initialPanorama = scene.previewPanorama ?? scene.panorama;
    await this.pano.transition(initialPanorama, transitionStyle, dir, (p) => {
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      if (useDefaultCamera || useDefaultZoom) {
        this.camera.setRaw(
          startYaw + yawDelta * ease,
          startPitch + (destPitch - startPitch) * ease,
          baseFov + (destFov - baseFov) * ease,
        );
      }
      if (transitionStyle === 'forward') {
        // Move monotonically from the old panorama centre to the temporary
        // centre of the incoming panorama. Unlike an FOV pulse, this changes
        // the camera's position relative to both spheres and produces a real
        // directional perspective warp. At completion both are re-centred.
        this.camera.camera.position.copy(dir).multiplyScalar(travelDistance * ease);
        return;
      }
      if (transitionStyle !== 'fly-through') return;

      // Fly camera position
      this.camera.camera.position.lerpVectors(camStartPos, camEndPos, ease * 0.88);

      // FOV warp for "fly" feel
      const warpFov = baseFov + Math.sin(p * Math.PI) * 20;
      this.camera.camera.fov = warpFov;
      this.camera.camera.updateProjectionMatrix();
    }, scene.panoramaRotation ?? 0, scene.panoramaRoll ?? 0);

    // Reset camera position after transition. Crossfade keeps the viewer's
    // current direction so there is no camera jump when the new image appears.
    this.camera.camera.position.set(0, 0, 0);
    this.camera.camera.fov = baseFov;
    this.camera.camera.updateProjectionMatrix();
    this.camera.setOrientation(destYaw, destPitch, destFov);

    this.currentScene = scene;
    this.pano.setMultiResolution(
      this.enableTiling ? (scene.multiRes ?? null) : null,
      scene.panoramaRotation ?? 0,
      scene.panoramaRoll ?? 0,
    );
    this.isTransitioning = false;

    this.bus.emit('scene:transition:end', { scene });
    this.notifyPluginsSceneReady(scene);
  }

  /**
   * Replace a scene preview with its selected full-resolution panorama.
   * The scene-id guard prevents a late decode from overwriting a newer scene.
   */
  async upgradeCurrentPanorama(sceneId: string, url: string): Promise<boolean> {
    if (!url || this.currentScene?.id !== sceneId || this.isTransitioning) return false;
    const texture = await this.pano.preload(url);
    if (this.currentScene?.id !== sceneId || this.isTransitioning) return false;
    this.pano.useTexture(texture);
    return true;
  }

  /**
   * 🪐 Little Planet intro — matches PSV animatedValues exactly:
   *   pitch:   -PI/2 → target   (from looking straight down)
   *   yaw:     +PI/2 offset → target
   *   FOV:     130°  → saved scene FOV (75° by default)
   *   fisheye: 2     → 0        (camera offset = PSV fisheye)
   *   easing:  inOutQuad        (identical to PSV)
   *   duration: 2500ms
   */
  async playLittlePlanetIntro(targetYaw = 0, targetPitch = 0, targetFov = 75): Promise<void> {
    const startFov      = 130;
    const endFov        = THREE.MathUtils.clamp(targetFov, 30, 120);
    const startPitch    = -Math.PI / 2;           // straight down
    const startYaw      = targetYaw + Math.PI / 2; // 90° offset (matches PSV yaw.start = PI/2)
    const startFisheye  = 2;
    const duration      = 2500;
    const start         = performance.now();

    const easeInOutQuad = (t: number) =>
      t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    this.camera.setRaw(startYaw, startPitch, startFov);
    this.pano.setFisheye(startFisheye, this.camera.camera);

    return new Promise((resolve) => {
      const step = (now: number) => {
        const p    = Math.min((now - start) / duration, 1);
        const ease = easeInOutQuad(p);

        const fov     = startFov      + (endFov      - startFov)     * ease;
        const yaw     = startYaw      + (targetYaw   - startYaw)     * ease;
        const pitch   = startPitch    + (targetPitch - startPitch)   * ease;
        const fisheye = startFisheye  * (1 - ease);  // 2 → 0

        this.camera.setRaw(yaw, pitch, fov);
        // Apply fisheye offset AFTER setRaw (which updates camera quaternion)
        this.pano.setFisheye(fisheye, this.camera.camera);

        if (p < 1) {
          requestAnimationFrame(step);
        } else {
          // Ensure camera is back at exact center
          this.camera.camera.position.set(0, 0, 0);
          this.camera.setOrientation(targetYaw, targetPitch, endFov);
          this.bus.emit('intro:end');
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }


  // ── Misc API ───────────────────────────────────────────────────

  getCurrentScene(): TourScene | null {
    return this.currentScene;
  }

  benchmarkKtx2(bitmapUrl: string, ktx2Url: string): Promise<Ktx2BenchmarkResult> {
    return this.pano.benchmarkKtx2(bitmapUrl, ktx2Url);
  }

  // ── Quality Mode ───────────────────────────────────────────────

  /** DPR caps per quality level */
  static readonly QUALITY_DPR: Record<string, number> = {
    performance: 1,
    balanced:    1.5,
    quality:     2,
    native:      Infinity,
  };

  setQualityMode(mode: 'performance' | 'balanced' | 'quality' | 'native'): void {
    const cap = View360Engine.QUALITY_DPR[mode] ?? 2;
    const dpr = cap === Infinity ? window.devicePixelRatio : Math.min(window.devicePixelRatio, cap);
    this.renderer.setPixelRatio(dpr);
    // Resize to apply new pixel ratio immediately
    const w = this.container.clientWidth  || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
  }

  // ── Diagnostics ────────────────────────────────────────────────

  /** Returns a snapshot of all GPU/rendering metrics for the dev panel */
  getDiagnostics(): EngineDiagnostics {
    const gl = this.renderer.getContext();
    const caps = this.renderer.capabilities;
    const canvas = this.renderer.domElement;
    const tex = this.pano.textureInfo;
    const tiles = this.pano.tileInfo;
    const maxTex = caps.maxTextureSize;

    const srcW = tiles.enabled ? tiles.sourceWidth : (tex?.width ?? 0);
    const srcH = tiles.enabled ? tiles.sourceHeight : (tex?.height ?? 0);
    const dpr = this.renderer.getPixelRatio();

    // Effective texture width after GPU capping
    // Multi-resolution panoramas never upload the full source as one texture,
    // so maxTextureSize does not cap their effective panorama resolution.
    const gpuW = tiles.enabled ? srcW : Math.min(srcW, maxTex);
    const gpuH = tiles.enabled ? srcH : Math.min(srcH, maxTex);

    // Pixel density: how many source pixels per screen pixel at current FOV
    // (screen pixels at DPR = canvas.width/height)
    const hFovRad = (this.camera.getFov() * Math.PI) / 180;
    const screenWidthPx = canvas.width; // already includes DPR
    const equiWidthPx = tiles.enabled ? tiles.sourceWidth : srcW; // full equirect covers 360°
    const visibleSrcPx = equiWidthPx * (hFovRad / (2 * Math.PI));
    const pixelDensity = visibleSrcPx / screenWidthPx;

    return {
      srcWidth:    srcW,
      srcHeight:   srcH,
      gpuWidth:    gpuW,
      gpuHeight:   gpuH,
      maxTexSize:  maxTex,
      isCapped:    !tiles.enabled && (srcW > maxTex || srcH > maxTex),
      canvasCssW:  canvas.clientWidth,
      canvasCssH:  canvas.clientHeight,
      canvasGlW:   canvas.width,
      canvasGlH:   canvas.height,
      dpr,
      deviceDpr:   window.devicePixelRatio,
      fov:         this.camera.getFov(),
      pixelDensity: +pixelDensity.toFixed(2),
      textureUrl:  tex?.url ?? '',
      textureFormat: tex?.format ?? 'bitmap',
      textureLoadMs: tex?.durationMs ?? 0,
      textureTransferBytes: tex?.transferBytes ?? 0,
      gpuCompressed: tex?.gpuCompressed ?? false,
      tilingEnabled: tiles.enabled,
      tileLevel: tiles.level,
      loadedTiles: tiles.loadedTiles,
      pendingTiles: tiles.pendingTiles,
      queuedTiles: tiles.queuedTiles,
      decodedTiles: tiles.decodedTiles,
      tileCacheBytes: tiles.cacheBytes,
      tileCacheBudgetBytes: tiles.cacheBudgetBytes,
      vendor:      gl.getParameter(gl.VENDOR)   as string,
      renderer:    gl.getParameter(gl.RENDERER) as string,
    };
  }

  // ── Dispose ────────────────────────────────────────────────────

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.plugins.forEach((p) => p._destroy());
    this.plugins.clear();

    this.camera.dispose();
    this.pano.dispose();
    this.bus.emit('destroy');
    this.bus.clear();

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── Private ────────────────────────────────────────────────────

  private loop = (now: number): void => {
    this.rafId = requestAnimationFrame(this.loop);

    const delta = this.lastTime !== null ? (now - this.lastTime) / 1000 : 0;
    this.lastTime = now;

    if (!this.isTransitioning) {
      this.camera.update();
    }

    this.plugins.forEach((p) => p._update(delta));
    this.pano.updateTiles(this.camera.camera, now);
    this.renderer.render(this.scene, this.camera.camera);
  };

  private onResize = (): void => {
    const rect = this.container.getBoundingClientRect();
    this.resizeTo(
      Math.round(rect.width) || window.innerWidth,
      Math.round(rect.height) || window.innerHeight,
    );
  };

  private resizeTo(width: number, height: number): void {
    if (width === this.lastContainerSize.width && height === this.lastContainerSize.height) return;
    this.lastContainerSize = { width, height };
    this.camera.onResize(width, height);
    this.renderer.setSize(width, height, true);
  }

  private notifyPluginsSceneLoad(scene: TourScene): void {
    this.plugins.forEach((p) => p.onSceneLoad?.(scene));
  }

  private notifyPluginsSceneReady(scene: TourScene): void {
    this.plugins.forEach((p) => p.onSceneReady?.(scene));
  }
}
