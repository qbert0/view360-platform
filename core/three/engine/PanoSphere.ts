/**
 * ─────────────────────────────────────────────────────────────────
 * PanoSphere — Manages dual-sphere equirectangular panorama rendering
 * with smooth texture transitions (crossfade, fly-through, etc.)
 * ─────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { EquirectangularTilesAdapter } from './EquirectangularTilesAdapter';
import type {
  MultiResolutionPanorama,
  PanoramaAdapter,
  TileStreamingOptions,
} from './PanoramaAdapter';

export type PanoramaTextureFormat = 'bitmap' | 'ktx2';

export interface TextureLoadMetrics {
  url: string;
  format: PanoramaTextureFormat;
  width: number;
  height: number;
  durationMs: number;
  transferBytes: number;
  gpuCompressed: boolean;
}

export interface Ktx2BenchmarkResult {
  bitmap: TextureLoadMetrics;
  ktx2: TextureLoadMetrics;
  /** Positive means KTX2 used fewer transfer bytes. */
  transferSavingPercent: number;
  /** Positive means KTX2 loaded/transcoded/uploaded faster. */
  timeSavingPercent: number;
  recommended: boolean;
  reason: string;
}

export type TransitionStyle =
  | 'crossfade'         // simple opacity crossfade
  | 'forward'           // push/zoom forward into the next panorama
  | 'fly-through'       // 3D spatial fly into next sphere
  | 'crossfade-pan';    // crossfade + camera pan drift

export interface PanoSphereConfig {
  radius?: number;        // sphere radius. Default 600
  segments?: number;      // lat/lon segments. Default 64/48
  defaultTransition?: TransitionStyle;
  transitionDuration?: number;  // ms. Default 700
  /** Maximum decoded panorama textures retained in memory. 0 disables cache. Default: 4. */
  maxCachedTextures?: number;
  /** Viewer-only tile scheduler/cache tuning. */
  tileStreaming?: TileStreamingOptions;
}

// ── GLSL Shaders (PSV-compatible raycast approach) ────────────────────────
// The vertex shader passes local position + camera-in-local-space.
// The fragment shader raycasts through the sphere to derive UV,
// which enables fisheye (camera offset from center) without artifacts.

const VERTEX_SHADER = /* glsl */`
  varying vec3 vLocalPos;
  varying vec3 vLocalCam;

  void main() {
    vLocalPos = position;
    // Convert the world-space camera into this sphere's local coordinates.
    // Subtracting the model translation is essential during a walk transition:
    // the incoming panorama has its own centre in front of the current one.
    // With Three's orthonormal rotation matrix, row-vector multiplication by R
    // is equivalent to applying inverse(R) to the world-space displacement.
    vec3 sphereWorldCentre = modelMatrix[3].xyz;
    vLocalCam = (cameraPosition - sphereWorldCentre) * mat3(modelMatrix);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  varying vec3 vLocalPos;
  varying vec3 vLocalCam;
  uniform sampler2D map;
  uniform float opacity;
  uniform float radius;
  uniform float brightness;
  uniform float highlightCompression;

  const float PI = 3.14159265358979323846;

  void main() {
    // Raycast from camera (possibly offset for fisheye) through polygon
    // surface to the true sphere surface.
    vec3 rayDir = vLocalPos - vLocalCam;
    float a = dot(rayDir, rayDir);
    float b = dot(vLocalCam, rayDir);
    float c = dot(vLocalCam, vLocalCam) - radius * radius;
    float t = (-b + sqrt(max(b * b - a * c, 0.0))) / a;
    vec3 dir = normalize(vLocalCam + t * rayDir);

    float u = atan(-dir.x, dir.z) / (2.0 * PI) + 0.5;
    float v = asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5;

    gl_FragColor = texture2D(map, vec2(u, v));
    gl_FragColor.rgb *= brightness;

    // Roll off only harsh highlights while preserving normal mid-tones.
    float luminance = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    const float highlightStart = 0.55;
    float excess = max(luminance - highlightStart, 0.0);
    float compressedLuminance = highlightStart
      + excess / (1.0 + highlightCompression * excess * 5.0);
    if (luminance > highlightStart) {
      gl_FragColor.rgb *= compressedLuminance / luminance;
    }
    gl_FragColor.a *= opacity;
    // Texture sampling is performed in linear space. Convert the final colour
    // back to the renderer output colour space; without this, mid-tones appear
    // much darker and more contrasty than the original sRGB panorama.
    #include <colorspace_fragment>
  }
`;

// ── PanoSphere ─────────────────────────────────────────────────────────────

export class PanoSphere {
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private imageBitmapLoader: THREE.ImageBitmapLoader;
  private ktx2Loader: KTX2Loader;
  private panoramaAdapter: PanoramaAdapter;

  private sphereA: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private sphereB: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

  private readonly radius: number;
  private readonly transitionDuration: number;
  private readonly defaultTransition: TransitionStyle;

  private isTransitioning = false;
  private immediateLoadGeneration = 0;
  private textureCache = new Map<string, THREE.Texture>();
  private pendingTextures = new Map<string, Promise<THREE.Texture>>();
  private readonly maxCachedTextures: number;

  /** Dimensions of the most-recently-loaded source image */
  private lastTextureInfo: TextureLoadMetrics | null = null;

  get textureInfo() { return this.lastTextureInfo; }
  get tileInfo() { return this.panoramaAdapter.diagnostics; }

  /** Blank 1×1 transparent texture — used before first panorama loads */
  private static blankTex = (() => {
    const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    t.needsUpdate = true;
    return t;
  })();

  private makeShaderMat(opacity: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        map:     { value: PanoSphere.blankTex },
        opacity: { value: opacity },
        radius:  { value: this.radius },
        brightness: { value: 1.25 },
        highlightCompression: { value: 0 },
      },
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side:        THREE.BackSide,  // camera is inside sphere
      transparent: true,
      depthWrite:  false,
      // Panorama photographs are already colour graded. Do not apply the
      // renderer's cinematic ACES curve a second time.
      toneMapped: false,
    });
  }

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, config: PanoSphereConfig = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.imageBitmapLoader = new THREE.ImageBitmapLoader();
    this.imageBitmapLoader.setOptions({
      imageOrientation: 'flipY',
      premultiplyAlpha: 'none',
    });
    this.ktx2Loader = new KTX2Loader()
      .setTranscoderPath('/basis/')
      .setWorkerLimit(1)
      .detectSupport(renderer);

    this.radius = config.radius ?? 600;
    this.transitionDuration = config.transitionDuration ?? 700;
    this.defaultTransition = config.defaultTransition ?? 'crossfade';
    this.maxCachedTextures = Math.max(0, Math.floor(config.maxCachedTextures ?? 2));

    const segsW = config.segments ?? 128;  // higher tessellation for fisheye
    const segsH = Math.round(segsW * 0.75);

    // Standard (not inverted) sphere — BackSide handles inside view
    const geo = new THREE.SphereGeometry(this.radius, segsW, segsH);

    this.sphereA = new THREE.Mesh(geo,        this.makeShaderMat(1));
    this.sphereB = new THREE.Mesh(geo.clone(), this.makeShaderMat(0));
    // Both meshes occupy the same sphere. Force the old panorama to render as
    // the opaque-looking base and the incoming panorama to composite over it.
    this.sphereA.renderOrder = 0;
    this.sphereB.renderOrder = 1;
    this.sphereB.visible = false;

    this.scene.add(this.sphereA);
    this.scene.add(this.sphereB);
    this.panoramaAdapter = new EquirectangularTilesAdapter(
      this.scene,
      this.renderer,
      this.radius,
      config.tileStreaming,
    );
  }

  get busy(): boolean { return this.isTransitioning; }
  get transitionStyle(): TransitionStyle { return this.defaultTransition; }

  /** Adjust panorama luminance without resizing or recompressing the source. */
  setBrightness(value: number): void {
    const brightness = Math.max(0.5, Math.min(2, value));
    this.sphereA.material.uniforms.brightness.value = brightness;
    this.sphereB.material.uniforms.brightness.value = brightness;
    this.panoramaAdapter.setBrightness(brightness);
  }

  /** Compress harsh highlights without darkening the complete panorama. */
  setHighlightCompression(value: number): void {
    const compression = Math.max(0, Math.min(1, value));
    this.sphereA.material.uniforms.highlightCompression.value = compression;
    this.sphereB.material.uniforms.highlightCompression.value = compression;
    this.panoramaAdapter.setHighlightCompression(compression);
  }

  /** Rotate the active panorama in world space without moving the camera. */
  setRotation(rotation: number): void {
    this.sphereA.rotation.y = rotation;
    this.panoramaAdapter.setRotation(rotation);
  }

  setMultiResolution(config: MultiResolutionPanorama | null, rotation = 0): void {
    this.panoramaAdapter.configure(config, rotation);
  }

  updateTiles(camera: THREE.PerspectiveCamera, now?: number): void {
    this.panoramaAdapter.update(camera, now);
  }

  // ── Texture Loading ────────────────────────────────────────────

  /**
   * Preload a texture into GPU VRAM. Cached so same URL is never loaded twice.
   */
  async preload(url: string): Promise<THREE.Texture> {
    // Designer mode deliberately bypasses the panorama cache. It needs only
    // the currently displayed texture, not viewer-style scene preloading.
    if (this.maxCachedTextures === 0) return this.loadTexture(url);

    if (this.textureCache.has(url)) {
      const cached = this.textureCache.get(url)!;
      // Refresh insertion order so Map also acts as a small LRU cache.
      this.textureCache.delete(url);
      this.textureCache.set(url, cached);
      return cached;
    }
    const pending = this.pendingTextures.get(url);
    if (pending) return pending;
    const request = this.loadTexture(url);
    this.pendingTextures.set(url, request);
    try {
      return await request;
    } finally {
      this.pendingTextures.delete(url);
    }
  }

  /**
   * Set the panorama instantly (no transition).
   */
  async setImmediate(url: string, rotation = 0): Promise<boolean> {
    const generation = ++this.immediateLoadGeneration;
    const tex = await this.preload(url);
    // Rapid scene clicks can complete out of order. A stale request must not
    // replace the most recently requested admin scene or leak its texture.
    if (generation !== this.immediateLoadGeneration) {
      if (this.maxCachedTextures === 0) this.disposeTexture(tex);
      return false;
    }
    const previousTexture = this.sphereA.material.uniforms.map.value as THREE.Texture;
    this.sphereA.material.uniforms.map.value     = tex;
    this.sphereA.material.uniforms.opacity.value = 1;
    this.sphereA.position.set(0, 0, 0);
    this.sphereA.rotation.y = rotation;
    this.sphereB.visible = false;
    // Immediate loads (notably the admin designer) do not need the previous
    // transition texture. Releasing this reference allows the LRU to dispose
    // the old full-resolution panorama straight away.
    this.sphereB.material.uniforms.map.value = PanoSphere.blankTex;
    if (this.maxCachedTextures === 0) {
      if (previousTexture !== tex && previousTexture !== PanoSphere.blankTex) {
        this.disposeTexture(previousTexture);
      }
    } else {
      this.trimTextureCache();
    }
    return true;
  }

  /**
   * Apply fisheye / "little planet" distortion by offsetting the camera
   * position along its forward axis — matching PSV's exact formula:
   *
   *   camera.position = -forward * (fisheye / 2) * radius
   *
   * At fisheye=2: camera sits AT the sphere surface (north pole when looking
   * straight down) → produces true stereographic "little planet" projection.
   * At fisheye=0: camera at center → normal equirectangular perspective.
   *
   * PSV uses normalized radius≈1 so their offset (fisheye/2) already equals
   * radius. We must scale by `this.radius` (600) to get the same visual.
   */
  setFisheye(value: number, camera: THREE.PerspectiveCamera): void {
    if (value <= 0) {
      camera.position.set(0, 0, 0);
      return;
    }
    // Get normalized forward direction from current camera quaternion
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    // Scale by radius: fisheye=2 → camera ON sphere surface = stereographic
    const offset = (value / 2) * this.radius;
    camera.position.copy(forward).multiplyScalar(-offset);
  }


  // ── Transitions ────────────────────────────────────────────────

  /**
   * Transition to a new panorama URL using the given style.
   * Returns a Promise that resolves when the transition is done.
   * @param onProgress - called each frame with 0–1 progress (use for FOV warp etc.)
   */
  async transition(
    url: string,
    style: TransitionStyle = this.defaultTransition,
    direction?: THREE.Vector3,
    onProgress?: (p: number) => void,
    rotation = 0,
  ): Promise<void> {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const newTex = await this.preload(url);
    // The incoming panorama is oriented in world space before it becomes
    // visible, so crossfade never exposes an incorrectly aligned frame.
    this.sphereB.rotation.y = rotation;

    switch (style) {
      case 'forward':
        await this.doForward(newTex, direction, onProgress);
        break;
      case 'fly-through':
        await this.doFlyThrough(newTex, direction, onProgress);
        break;
      case 'crossfade-pan':
        await this.doCrossfade(newTex, onProgress);
        break;
      case 'crossfade':
      default:
        await this.doCrossfade(newTex, onProgress);
        break;
    }

    this.isTransitioning = false;
  }

  // ── Dispose ────────────────────────────────────────────────────

  dispose(): void {
    const textures = new Set<THREE.Texture>(this.textureCache.values());
    textures.add(this.sphereA.material.uniforms.map.value as THREE.Texture);
    textures.add(this.sphereB.material.uniforms.map.value as THREE.Texture);
    textures.delete(PanoSphere.blankTex);
    textures.forEach((texture) => this.disposeTexture(texture));
    this.textureCache.clear();
    this.pendingTextures.clear();
    this.ktx2Loader.dispose();
    this.panoramaAdapter.dispose();
    this.sphereA.geometry.dispose();
    this.sphereA.material.dispose();
    this.sphereB.geometry.dispose();
    this.sphereB.material.dispose();
  }

  // ── Private ────────────────────────────────────────────────────

  private loadTexture(url: string): Promise<THREE.Texture> {
    return this.isKtx2Url(url)
      ? this.loadKtx2Texture(url)
      : this.loadBitmapTexture(url);
  }

  private loadBitmapTexture(url: string): Promise<THREE.Texture> {
    const startedAt = performance.now();
    return new Promise((resolve, reject) => {
      this.imageBitmapLoader.load(
        url,
        (bitmap) => {
          const tex = new THREE.Texture(bitmap);
          // ImageBitmap was flipped during off-main-thread decoding. Prevent
          // WebGL from trying to apply the DOM-image flip a second time.
          tex.flipY = false;
          tex.colorSpace = THREE.SRGBColorSpace;
          // A panorama is periodic on the horizontal axis. ClampToEdge leaves
          // a one-pixel line where U jumps from 1 back to 0, especially when
          // mipmaps are sampled. Repeat lets filtering cross that seam.
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          // The custom raycast shader has a derivative discontinuity exactly
          // where equirectangular U wraps from 1 back to 0. Mipmapping can
          // therefore select a different level at that longitude, producing a
          // bright vertical streak which appears/disappears as the camera
          // rotates. Sample the source level directly for stable panorama
          // colour at every viewing angle.
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          tex.anisotropy = 1;
          tex.needsUpdate = true;
          this.renderer.initTexture(tex); // warm GPU VRAM
          if (this.maxCachedTextures > 0) {
            this.textureCache.set(url, tex);
            // Keep the freshly loaded texture alive until its caller assigns
            // it to a sphere; the old active texture cannot be evicted until
            // that assignment happens.
            this.trimTextureCache(tex);
          }

          // Capture source dimensions for diagnostics
          const img = tex.image as HTMLImageElement | ImageBitmap | null;
          if (img) {
            this.lastTextureInfo = {
              url,
              format: 'bitmap',
              width:  'naturalWidth'  in img ? img.naturalWidth  : (img as ImageBitmap).width,
              height: 'naturalHeight' in img ? img.naturalHeight : (img as ImageBitmap).height,
              durationMs: performance.now() - startedAt,
              transferBytes: this.getTransferBytes(url),
              gpuCompressed: false,
            };
          }

          resolve(tex);
        },
        undefined,
        reject,
      );
    });
  }

  private async loadKtx2Texture(url: string): Promise<THREE.Texture> {
    const startedAt = performance.now();
    const texture = await this.ktx2Loader.loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 1;
    texture.needsUpdate = true;
    this.renderer.initTexture(texture);

    if (this.maxCachedTextures > 0) {
      this.textureCache.set(url, texture);
      this.trimTextureCache(texture);
    }

    const image = texture.image as { width?: number; height?: number } | undefined;
    const mip = (texture as THREE.CompressedTexture).mipmaps?.[0];
    this.lastTextureInfo = {
      url,
      format: 'ktx2',
      width: image?.width ?? mip?.width ?? 0,
      height: image?.height ?? mip?.height ?? 0,
      durationMs: performance.now() - startedAt,
      transferBytes: this.getTransferBytes(url),
      gpuCompressed: texture.isCompressedTexture === true,
    };
    return texture;
  }

  /**
   * Cold-ish A/B measurement for the development diagnostics panel. The
   * cache-busting query keeps the browser HTTP/decode cache from making the
   * second candidate look artificially fast. Neither texture becomes active.
   */
  async benchmarkKtx2(bitmapUrl: string, ktx2Url: string): Promise<Ktx2BenchmarkResult> {
    const activeTextureInfo = this.lastTextureInfo;
    const nonce = `ktx-bench=${Date.now()}`;
    const appendNonce = (url: string) => `${url}${url.includes('?') ? '&' : '?'}${nonce}`;

    const benchmarkBitmapUrl = appendNonce(bitmapUrl);
    const bitmapTexture = await this.loadBitmapTexture(benchmarkBitmapUrl);
    const bitmap = { ...this.lastTextureInfo! };
    this.textureCache.delete(benchmarkBitmapUrl);
    this.disposeTexture(bitmapTexture);

    const benchmarkKtx2Url = appendNonce(ktx2Url);
    const ktx2Texture = await this.loadKtx2Texture(benchmarkKtx2Url);
    const ktx2 = { ...this.lastTextureInfo! };
    this.textureCache.delete(benchmarkKtx2Url);
    this.disposeTexture(ktx2Texture);
    this.lastTextureInfo = activeTextureInfo;

    const transferSavingPercent = bitmap.transferBytes > 0
      ? ((bitmap.transferBytes - ktx2.transferBytes) / bitmap.transferBytes) * 100
      : 0;
    const timeSavingPercent = bitmap.durationMs > 0
      ? ((bitmap.durationMs - ktx2.durationMs) / bitmap.durationMs) * 100
      : 0;
    // Runtime compression is valuable, but a panorama format should not be
    // selected when it multiplies bandwidth or substantially delays display.
    const recommended = ktx2.gpuCompressed
      && transferSavingPercent >= -10
      && timeSavingPercent >= -20;

    return {
      bitmap,
      ktx2,
      transferSavingPercent,
      timeSavingPercent,
      recommended,
      reason: recommended
        ? 'KTX2 giảm áp lực GPU mà không làm tải mạng/chờ hiển thị tệ đáng kể.'
        : 'Giữ WebP: mẫu KTX2 hiện tại tốn băng thông hoặc thời gian tải nhiều hơn lợi ích GPU.',
    };
  }

  private isKtx2Url(url: string): boolean {
    try {
      return new URL(url, window.location.href).pathname.toLowerCase().endsWith('.ktx2');
    } catch {
      return url.split('?')[0]?.toLowerCase().endsWith('.ktx2') ?? false;
    }
  }

  private getTransferBytes(url: string): number {
    const absoluteUrl = new URL(url, window.location.href).href;
    const entries = performance.getEntriesByName(absoluteUrl, 'resource') as PerformanceResourceTiming[];
    const entry = entries.at(-1);
    return entry?.encodedBodySize || entry?.transferSize || 0;
  }

  /** Promote an already decoded/uploaded texture without running a scene transition. */
  useTexture(texture: THREE.Texture): void {
    this.sphereA.material.uniforms.map.value = texture;
    this.sphereA.material.uniforms.opacity.value = 1;
    this.sphereB.visible = false;
    this.sphereB.material.uniforms.map.value = PanoSphere.blankTex;
    this.sphereB.material.uniforms.opacity.value = 0;
    this.trimTextureCache();
  }

  /** Keep only nearby panoramas in GPU memory, never disposing active textures. */
  private trimTextureCache(protectedTexture?: THREE.Texture): void {
    if (this.maxCachedTextures === 0) return;
    if (this.textureCache.size <= this.maxCachedTextures) return;
    const active = new Set<THREE.Texture>([
      this.sphereA.material.uniforms.map.value,
      this.sphereB.material.uniforms.map.value,
    ]);
    if (protectedTexture) active.add(protectedTexture);
    for (const [url, texture] of this.textureCache) {
      if (this.textureCache.size <= this.maxCachedTextures) break;
      if (active.has(texture)) continue;
      this.textureCache.delete(url);
      this.disposeTexture(texture);
    }
  }

  /** Release both GPU storage and the browser's decoded image backing store. */
  private disposeTexture(texture: THREE.Texture): void {
    texture.dispose();
    const image = texture.image as HTMLImageElement | ImageBitmap | undefined;
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
      image.close();
      return;
    }
    if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
      image.src = '';
    }
    texture.image = null;
  }

  /**
   * Simple crossfade: sphereA fades out, sphereB (new texture) fades in.
   * After done, sphereA gets new texture and sphereB is hidden.
   */
  private doCrossfade(newTex: THREE.Texture, onProgress?: (p: number) => void): Promise<void> {
    this.sphereB.material.uniforms.map.value     = newTex;
    this.sphereB.material.uniforms.opacity.value = 0;
    this.sphereB.position.set(0, 0, 0);
    this.sphereB.visible = true;

    const duration = this.transitionDuration;
    const start = performance.now();

    return new Promise((resolve) => {
      const step = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;

        this.sphereA.material.uniforms.opacity.value = 1 - ease;
        this.sphereB.material.uniforms.opacity.value = ease;
        onProgress?.(p);

        if (p < 1) {
          requestAnimationFrame(step);
        } else {
          this.promoteSphereB(newTex);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  /**
   * Forward push: keep the two panorama opacities complementary at every
   * frame. This prevents the background/blank sphere from showing through
   * during the transition while the engine applies a smooth FOV push.
   */
  private doForward(
    newTex: THREE.Texture,
    direction?: THREE.Vector3,
    onProgress?: (p: number) => void,
  ): Promise<void> {
    this.sphereB.material.uniforms.map.value = newTex;
    this.sphereB.material.uniforms.opacity.value = 0;
    // Give the destination a real (temporary) centre in world space. The
    // camera travels to this point; once it arrives, promoteSphereB recentres
    // both camera and panorama atomically without changing their relationship.
    const destination = (direction?.clone().normalize() ?? new THREE.Vector3(0, 0, -1))
      .multiplyScalar(this.radius * 0.28);
    this.sphereB.position.copy(destination);
    this.sphereB.visible = true;

    const duration = this.transitionDuration;
    const start = performance.now();
    const smootherstep = (edge0: number, edge1: number, value: number) => {
      const x = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
      return x * x * x * (x * (x * 6 - 15) + 10);
    };

    return new Promise((resolve) => {
      const step = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        // Keep the old scene readable while the viewer starts moving, then
        // blend around the peak of the forward motion and finish the incoming
        // scene before the camera settles. This feels like crossing a doorway
        // instead of applying a full-duration dissolve.
        const mix = smootherstep(0.28, 0.78, p);
        // Keep the old panorama fully covering the canvas. With normal alpha
        // compositing, two complementary 50% layers only produce 75% coverage.
        this.sphereA.material.uniforms.opacity.value = 1;
        this.sphereB.material.uniforms.opacity.value = mix;
        onProgress?.(p);

        if (p < 1) requestAnimationFrame(step);
        else {
          this.promoteSphereB(newTex);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  /**
   * 3D Fly-through: camera moves toward direction, enters next sphere.
   * Requires the calling engine to also animate camera position.
   */
  private doFlyThrough(newTex: THREE.Texture, direction?: THREE.Vector3, onProgress?: (p: number) => void): Promise<void> {
    const flyDist = this.radius * 0.85;
    const dir = direction?.clone().normalize() ?? new THREE.Vector3(0, 0, -1);
    const targetPos = dir.multiplyScalar(flyDist);

    this.sphereB.material.uniforms.map.value     = newTex;
    this.sphereB.material.uniforms.opacity.value = 0;
    this.sphereB.position.copy(targetPos);
    this.sphereB.visible = true;

    const duration = this.transitionDuration;
    const start = performance.now();

    return new Promise((resolve) => {
      const step = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

        this.sphereA.material.uniforms.opacity.value = 1 - ease;
        this.sphereB.material.uniforms.opacity.value = ease;
        onProgress?.(p);

        if (p < 1) {
          requestAnimationFrame(step);
        } else {
          this.promoteSphereB(newTex);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  /** After transition done: move new texture to sphereA, reset sphereB */
  private promoteSphereB(newTex: THREE.Texture): void {
    this.sphereA.material.uniforms.map.value     = newTex;
    this.sphereA.material.uniforms.opacity.value = 1;
    this.sphereA.position.set(0, 0, 0);
    this.sphereA.rotation.y = this.sphereB.rotation.y;
    this.panoramaAdapter.setRotation(this.sphereB.rotation.y);

    this.sphereB.visible = false;
    this.sphereB.material.uniforms.map.value = PanoSphere.blankTex;
    this.sphereB.material.uniforms.opacity.value = 0;
    this.sphereB.position.set(0, 0, 0);
    this.trimTextureCache();
  }
}
