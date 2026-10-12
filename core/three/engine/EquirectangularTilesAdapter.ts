import * as THREE from 'three';
import type {
  MultiResolutionPanorama,
  PanoramaAdapter,
  PanoramaAdapterDiagnostics,
  TileStreamingOptions,
} from './PanoramaAdapter';
import { TileStore, type ByteLruEntry } from './TileStore';

type TileImage = ImageBitmap | HTMLImageElement;

interface TileAddress {
  key: string;
  level: number;
  x: number;
  y: number;
  cols: number;
  rows: number;
  levelWidth: number;
  levelHeight: number;
  priority: number;
}

interface TileJob extends TileAddress {
  generation: number;
  controller: AbortController;
}

interface DecodedTile {
  address: TileAddress;
  generation: number;
  image: TileImage;
}

interface TileRecord extends ByteLruEntry {
  address: TileAddress;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  texture: THREE.Texture;
  /** Estimated RGBA GPU memory. The decoded bitmap is released after upload. */
  bytes: number;
  lastUsedAt: number;
}

const TILE_VERTEX_SHADER = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TILE_FRAGMENT_SHADER = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D map;
  uniform float brightness;
  uniform float highlightCompression;

  void main() {
    gl_FragColor = texture2D(map, vUv);
    gl_FragColor.rgb *= brightness;
    float luminance = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    const float highlightStart = 0.55;
    float excess = max(luminance - highlightStart, 0.0);
    float compressedLuminance = highlightStart
      + excess / (1.0 + highlightCompression * excess * 5.0);
    if (luminance > highlightStart) {
      gl_FragColor.rgb *= compressedLuminance / luminance;
    }
    #include <colorspace_fragment>
  }
`;

const DEFAULT_OPTIONS: Required<TileStreamingOptions> = {
  maxConcurrentRequests: 4,
  maxUploadsPerFrame: 2,
  maxCacheBytes: 160 * 1024 * 1024,
  updateIntervalMs: 90,
  evictionGraceMs: 1400,
  resolutionScale: 1.08,
};

/**
 * Viewport-driven equirectangular tile adapter.
 *
 * Its lifecycle follows Photo Sphere Viewer's adapter boundary, while the
 * cancellable request queue and byte-budgeted LRU mirror Marzipano's
 * TextureStore. The base panorama remains owned by PanoSphere and therefore
 * acts as the permanently pinned lowest-resolution fallback.
 */
export class EquirectangularTilesAdapter implements PanoramaAdapter {
  readonly group = new THREE.Group();

  private config: MultiResolutionPanorama | null = null;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly sphereRadius: number;
  private readonly options: Required<TileStreamingOptions>;
  private readonly records = new TileStore<TileRecord>();
  private readonly queued = new Map<string, TileJob>();
  private readonly loading = new Map<string, TileJob>();
  private decoded: DecodedTile[] = [];
  private desired = new Set<string>();
  private failedUntil = new Map<string, number>();
  private generation = 0;
  private lastSelectionAt = -Infinity;
  private brightness = 1.25;
  private highlightCompression = 0;
  private currentLevel = 0;
  private readonly onContextLost = (event: Event) => {
    // Allow the browser to restore the context. Detail tiles are disposable
    // derived assets and will be streamed back after restoration.
    event.preventDefault();
    this.generation++;
    this.cancelAllJobs();
    this.clearRecords();
    this.group.visible = false;
  };
  private readonly onContextRestored = () => {
    const config = this.config;
    if (!config) return;
    this.configure(config, this.group.rotation.y);
  };

  get diagnostics(): PanoramaAdapterDiagnostics {
    return {
      enabled: Boolean(this.config),
      level: this.currentLevel,
      loadedTiles: this.records.size,
      pendingTiles: this.queued.size + this.loading.size + this.decoded.length,
      queuedTiles: this.queued.size,
      decodedTiles: this.decoded.length,
      cacheBytes: this.records.totalBytes,
      cacheBudgetBytes: this.options.maxCacheBytes,
      sourceWidth: this.config?.sourceWidth ?? 0,
      sourceHeight: this.config?.sourceHeight ?? Math.round((this.config?.sourceWidth ?? 0) / 2),
    };
  }

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    radius: number,
    options: TileStreamingOptions = {},
  ) {
    this.renderer = renderer;
    this.sphereRadius = radius;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.group.renderOrder = 2;
    this.group.visible = false;
    scene.add(this.group);
    renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  configure(config: MultiResolutionPanorama | null, rotation: number): void {
    this.generation++;
    this.cancelAllJobs();
    this.clearRecords();
    // Multi-resolution is explicitly declared by the offline pipeline. Do not
    // impose an 8K-only runtime gate: a 5.7K source still benefits from
    // viewport loading and must use the generated pyramid from its YAML.
    this.config = config?.enabled
      && config.sourceWidth > 0
      && config.sourceHeight > 0
      && config.maxLevel >= 0
      ? config
      : null;
    this.currentLevel = 0;
    this.lastSelectionAt = -Infinity;
    this.group.rotation.y = rotation;
    this.group.visible = Boolean(this.config);
    this.group.updateMatrixWorld(true);
  }

  setRotation(rotation: number): void {
    this.group.rotation.y = rotation;
    this.group.updateMatrixWorld(true);
    this.lastSelectionAt = -Infinity;
  }

  setBrightness(value: number): void {
    this.brightness = value;
    this.records.forEach(({ mesh }) => { mesh.material.uniforms.brightness.value = value; });
  }

  setHighlightCompression(value: number): void {
    this.highlightCompression = value;
    this.records.forEach(({ mesh }) => { mesh.material.uniforms.highlightCompression.value = value; });
  }

  update(camera: THREE.PerspectiveCamera, now = performance.now()): void {
    if (!this.config) return;

    if (now - this.lastSelectionAt >= this.options.updateIntervalMs) {
      this.lastSelectionAt = now;
      this.refreshDesiredTiles(camera, now);
    }

    // GPU uploads are deliberately frame-budgeted. Network and decode may run
    // concurrently, but they can no longer create a long upload spike.
    this.uploadDecodedTiles(now);
    this.evictTiles(now);
    this.pumpQueue();
  }

  dispose(): void {
    this.generation++;
    this.cancelAllJobs();
    this.clearRecords();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.group.removeFromParent();
  }

  private refreshDesiredTiles(camera: THREE.PerspectiveCamera, now: number): void {
    const config = this.config;
    if (!config) return;

    const level = this.selectLevel(camera, config);
    this.currentLevel = level;
    const targetTiles = this.visibleTiles(camera, level, config);
    const nextDesired = new Map<string, TileAddress>();

    for (const tile of targetTiles) {
      nextDesired.set(tile.key, tile);

      // Keep one lower-resolution parent until the detail tile exists. The
      // base sphere remains the final fallback below this parent.
      if (!this.records.has(tile.key) && level > this.minimumStreamingLevel(config)) {
        const parent = this.parentAddress(tile, config);
        if (parent && !nextDesired.has(parent.key)) nextDesired.set(parent.key, parent);
      }
    }

    this.desired = new Set(nextDesired.keys());

    for (const address of nextDesired.values()) {
      const record = this.records.get(address.key);
      if (record) {
        this.records.touch(address.key, now);
        continue;
      }
      const queued = this.queued.get(address.key);
      if (queued) {
        queued.priority = address.priority;
        continue;
      }
      const loading = this.loading.get(address.key);
      if (loading) {
        loading.priority = address.priority;
        continue;
      }
      if (this.decoded.some(tile => tile.address.key === address.key)) continue;
      if ((this.failedUntil.get(address.key) ?? 0) > now) continue;
      this.enqueue(address);
    }

    // A generation change handles scene replacement. Within one scene, abort
    // requests that became irrelevant because the camera moved elsewhere.
    for (const [key, job] of this.queued) {
      if (!this.desired.has(key)) this.queued.delete(key);
      else job.priority = nextDesired.get(key)?.priority ?? job.priority;
    }
    for (const [key, job] of this.loading) {
      if (!this.desired.has(key)) job.controller.abort();
    }
    const retainedDecoded: DecodedTile[] = [];
    for (const tile of this.decoded) {
      if (this.desired.has(tile.address.key) && tile.generation === this.generation) retainedDecoded.push(tile);
      else this.releaseImage(tile.image);
    }
    this.decoded = retainedDecoded;
  }

  /** Google Street View-style LOD: select enough source pixels for the actual framebuffer. */
  private selectLevel(camera: THREE.PerspectiveCamera, config: MultiResolutionPanorama): number {
    const drawingBuffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = Math.min(
      Math.PI * 1.98,
      2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect),
    );
    const requiredPanoramaWidth = drawingBuffer.x
      * (Math.PI * 2 / Math.max(horizontalFov, 0.01))
      * this.options.resolutionScale;
    const minLevel = this.minimumStreamingLevel(config);

    let selected = config.maxLevel;
    for (let level = minLevel; level <= config.maxLevel; level++) {
      if (this.levelDimensions(level, config).width >= requiredPanoramaWidth) {
        selected = level;
        break;
      }
    }

    if (this.currentLevel < minLevel) return selected;
    if (selected > this.currentLevel) {
      const currentWidth = this.levelDimensions(this.currentLevel, config).width;
      return requiredPanoramaWidth > currentWidth * 1.08 ? selected : this.currentLevel;
    }
    if (selected < this.currentLevel) {
      const selectedWidth = this.levelDimensions(selected, config).width;
      return requiredPanoramaWidth < selectedWidth * 0.78 ? selected : this.currentLevel;
    }
    return selected;
  }

  private visibleTiles(
    camera: THREE.PerspectiveCamera,
    level: number,
    config: MultiResolutionPanorama,
  ): TileAddress[] {
    const dimensions = this.levelDimensions(level, config);
    const tileSize = config.tileSize ?? 1024;
    const cols = Math.ceil(dimensions.width / tileSize);
    const rows = Math.ceil(dimensions.height / tileSize);
    const result: TileAddress[] = [];

    camera.updateMatrixWorld();
    this.group.updateMatrixWorld(true);
    const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(viewProjection);
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection).normalize();

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const bounds = this.tileBounds(x, y, dimensions.width, dimensions.height, tileSize);
        const centerLocal = this.pointOnSphere(
          (bounds.u0 + bounds.u1) / 2,
          (bounds.vTop + bounds.vBottom) / 2,
          this.radiusForLevel(level, config),
        );
        const centerWorld = centerLocal.clone().applyMatrix4(this.group.matrixWorld);
        let patchRadius = 0;
        for (const [u, v] of [
          [bounds.u0, bounds.vTop],
          [bounds.u1, bounds.vTop],
          [bounds.u0, bounds.vBottom],
          [bounds.u1, bounds.vBottom],
        ] as Array<[number, number]>) {
          const corner = this.pointOnSphere(u, v, this.radiusForLevel(level, config))
            .applyMatrix4(this.group.matrixWorld);
          patchRadius = Math.max(patchRadius, centerWorld.distanceTo(corner));
        }
        if (!frustum.intersectsSphere(new THREE.Sphere(centerWorld, patchRadius * 1.08))) continue;

        const direction = centerWorld.clone().sub(camera.position).normalize();
        const angle = Math.acos(THREE.MathUtils.clamp(cameraDirection.dot(direction), -1, 1));
        result.push({
          key: this.tileKey(level, x, y),
          level,
          x,
          y,
          cols,
          rows,
          levelWidth: dimensions.width,
          levelHeight: dimensions.height,
          priority: angle * 1000,
        });
      }
    }
    return result;
  }

  private parentAddress(tile: TileAddress, config: MultiResolutionPanorama): TileAddress | null {
    const level = tile.level - 1;
    if (level < this.minimumStreamingLevel(config)) return null;
    const dimensions = this.levelDimensions(level, config);
    const tileSize = config.tileSize ?? 1024;
    const x = Math.floor(tile.x / 2);
    const y = Math.floor(tile.y / 2);
    return {
      key: this.tileKey(level, x, y),
      level,
      x,
      y,
      cols: Math.ceil(dimensions.width / tileSize),
      rows: Math.ceil(dimensions.height / tileSize),
      levelWidth: dimensions.width,
      levelHeight: dimensions.height,
      // Parent first, while preserving centre-out ordering.
      priority: tile.priority - 10_000,
    };
  }

  private enqueue(address: TileAddress): void {
    const job: TileJob = {
      ...address,
      generation: this.generation,
      controller: new AbortController(),
    };
    this.queued.set(address.key, job);
  }

  private pumpQueue(): void {
    if (!this.config) return;
    while (this.loading.size < this.options.maxConcurrentRequests && this.queued.size) {
      const next = [...this.queued.values()].sort((a, b) => a.priority - b.priority)[0];
      if (!next) return;
      this.queued.delete(next.key);
      if (!this.desired.has(next.key) || next.generation !== this.generation) continue;
      this.loading.set(next.key, next);
      void this.loadJob(next);
    }
  }

  private async loadJob(job: TileJob): Promise<void> {
    const config = this.config;
    if (!config) return;
    const url = config.urlTemplate
      .replace('{level}', String(job.level))
      .replace('{x}', String(job.x))
      .replace('{y}', String(job.y));

    try {
      const response = await fetch(url, {
        signal: job.controller.signal,
        cache: 'force-cache',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`Tile HTTP ${response.status}: ${url}`);
      const image = await this.decode(await response.blob());
      if (
        job.controller.signal.aborted
        || job.generation !== this.generation
        || !this.desired.has(job.key)
      ) {
        this.releaseImage(image);
        return;
      }
      this.decoded.push({ address: job, generation: job.generation, image });
    } catch (error) {
      if (!job.controller.signal.aborted) {
        this.failedUntil.set(job.key, performance.now() + 10_000);
        console.warn('[EquirectangularTilesAdapter] Không tải được tile', url, error);
      }
    } finally {
      this.loading.delete(job.key);
      this.pumpQueue();
    }
  }

  private async decode(blob: Blob): Promise<TileImage> {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(blob, {
          imageOrientation: 'flipY',
          premultiplyAlpha: 'none',
        });
      } catch {
        // Some older Safari/WebView builds expose createImageBitmap but reject
        // imageOrientation. Fall through to the DOM decoder for compatibility.
      }
    }

    const objectUrl = URL.createObjectURL(blob);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Không thể decode tile panorama.'));
        image.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  private uploadDecodedTiles(now: number): void {
    const config = this.config;
    if (!config) return;
    let uploaded = 0;
    while (uploaded < this.options.maxUploadsPerFrame && this.decoded.length) {
      const decoded = this.decoded.shift()!;
      if (decoded.generation !== this.generation || !this.desired.has(decoded.address.key)) {
        this.releaseImage(decoded.image);
        continue;
      }
      if (this.records.has(decoded.address.key)) {
        this.releaseImage(decoded.image);
        continue;
      }

      const texture = new THREE.Texture(decoded.image);
      texture.flipY = !(typeof ImageBitmap !== 'undefined' && decoded.image instanceof ImageBitmap);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;

      const geometry = this.makeTileGeometry(decoded.address, decoded.image, config);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: texture },
          brightness: { value: this.brightness },
          highlightCompression: { value: this.highlightCompression },
        },
        vertexShader: TILE_VERTEX_SHADER,
        fragmentShader: TILE_FRAGMENT_SHADER,
        // Tile winding is generated in panorama-local UV order. DoubleSide
        // avoids driver-dependent culling at the longitude seam and poles.
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: true,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 2 + decoded.address.level / 100;
      this.group.add(mesh);
      this.renderer.initTexture(texture);

      const width = this.imageWidth(decoded.image);
      const height = this.imageHeight(decoded.image);
      const bytes = width * height * 4;
      // initTexture uploads synchronously. Keep only the GPU allocation; if a
      // WebGL context is restored, the adapter clears and streams tiles again.
      this.releaseImage(decoded.image);
      texture.image = null;
      this.records.set(decoded.address.key, {
        address: decoded.address,
        mesh,
        texture,
        bytes,
        lastUsedAt: now,
      });
      uploaded++;
    }
  }

  private evictTiles(now: number): void {
    const candidates = [...this.records.entries()]
      .filter(([key]) => !this.desired.has(key))
      .sort(([, a], [, b]) => a.lastUsedAt - b.lastUsedAt);

    for (const [key, record] of candidates) {
      const overBudget = this.records.totalBytes > this.options.maxCacheBytes;
      const stale = now - record.lastUsedAt >= this.options.evictionGraceMs;
      if (!overBudget && !stale) continue;
      this.disposeRecord(key, record);
    }
  }

  private makeTileGeometry(
    address: TileAddress,
    image: TileImage,
    config: MultiResolutionPanorama,
  ): THREE.BufferGeometry {
    const tileSize = config.tileSize ?? 1024;
    const bounds = this.tileBounds(address.x, address.y, address.levelWidth, address.levelHeight, tileSize);
    const overlap = Math.max(0, config.overlap ?? 0);
    const imageWidth = this.imageWidth(image);
    const imageHeight = this.imageHeight(image);
    const leftGutter = address.x > 0 ? overlap : 0;
    const rightGutter = address.x < address.cols - 1 ? overlap : 0;
    const topGutter = address.y > 0 ? overlap : 0;
    const bottomGutter = address.y < address.rows - 1 ? overlap : 0;
    const texU0 = leftGutter / imageWidth;
    const texU1 = 1 - rightGutter / imageWidth;
    // ImageBitmap is decoded with flipY, hence top lies at the high V edge.
    const texVTop = 1 - topGutter / imageHeight;
    const texVBottom = bottomGutter / imageHeight;
    const segmentsX = 12;
    const segmentsY = 8;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const radius = this.radiusForLevel(address.level, config);

    for (let iy = 0; iy <= segmentsY; iy++) {
      const fy = iy / segmentsY;
      const v = THREE.MathUtils.lerp(bounds.vTop, bounds.vBottom, fy);
      const texV = THREE.MathUtils.lerp(texVTop, texVBottom, fy);
      for (let ix = 0; ix <= segmentsX; ix++) {
        const fx = ix / segmentsX;
        const u = THREE.MathUtils.lerp(bounds.u0, bounds.u1, fx);
        const point = this.pointOnSphere(u, v, radius);
        positions.push(point.x, point.y, point.z);
        uvs.push(THREE.MathUtils.lerp(texU0, texU1, fx), texV);
      }
    }
    const stride = segmentsX + 1;
    for (let iy = 0; iy < segmentsY; iy++) {
      for (let ix = 0; ix < segmentsX; ix++) {
        const a = iy * stride + ix;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
  }

  private tileBounds(x: number, y: number, width: number, height: number, tileSize: number) {
    const actualWidth = Math.min(tileSize, width - x * tileSize);
    const actualHeight = Math.min(tileSize, height - y * tileSize);
    const u0 = (x * tileSize) / width;
    const u1 = (x * tileSize + actualWidth) / width;
    const imageV0 = (y * tileSize) / height;
    const imageV1 = (y * tileSize + actualHeight) / height;
    return { u0, u1, vTop: 1 - imageV0, vBottom: 1 - imageV1 };
  }

  private pointOnSphere(u: number, v: number, radius: number): THREE.Vector3 {
    const lon = (u - 0.5) * Math.PI * 2;
    const lat = (v - 0.5) * Math.PI;
    const cosLat = Math.cos(lat);
    return new THREE.Vector3(
      -Math.sin(lon) * cosLat * radius,
      Math.sin(lat) * radius,
      Math.cos(lon) * cosLat * radius,
    );
  }

  private radiusForLevel(level: number, config: MultiResolutionPanorama): number {
    const min = this.minimumStreamingLevel(config);
    const range = Math.max(1, config.maxLevel - min);
    const detail = THREE.MathUtils.clamp((level - min) / range, 0, 1);
    // Higher-detail children sit marginally closer to the camera and cleanly
    // occlude their parent without polygon flicker.
    return this.sphereRadius - 0.22 - detail * 0.22;
  }

  private minimumStreamingLevel(config: MultiResolutionPanorama): number {
    return THREE.MathUtils.clamp(
      config.minLevel ?? Math.ceil(Math.log2(2048)) + 1,
      1,
      config.maxLevel,
    );
  }

  private levelDimensions(level: number, config: MultiResolutionPanorama) {
    const divisor = 2 ** (config.maxLevel - level);
    const sourceHeight = config.sourceHeight ?? Math.round(config.sourceWidth / 2);
    return {
      width: Math.max(1, Math.ceil(config.sourceWidth / divisor)),
      height: Math.max(1, Math.ceil(sourceHeight / divisor)),
    };
  }

  private tileKey(level: number, x: number, y: number): string {
    return `${level}/${x}/${y}`;
  }

  private imageWidth(image: TileImage): number {
    return image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  }

  private imageHeight(image: TileImage): number {
    return image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  }

  private cancelAllJobs(): void {
    this.queued.clear();
    for (const job of this.loading.values()) job.controller.abort();
    this.loading.clear();
    for (const tile of this.decoded) this.releaseImage(tile.image);
    this.decoded = [];
    this.desired.clear();
    this.failedUntil.clear();
  }

  private clearRecords(): void {
    for (const [key, record] of this.records.entries()) this.disposeRecord(key, record);
    this.records.clear();
  }

  private disposeRecord(key: string, record: TileRecord): void {
    this.group.remove(record.mesh);
    record.mesh.geometry.dispose();
    record.mesh.material.dispose();
    record.texture.dispose();
    this.releaseImage(record.texture.image as TileImage);
    record.texture.image = null;
    this.records.delete(key);
  }

  private releaseImage(image: TileImage | null | undefined): void {
    if (!image) return;
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
    else if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) image.src = '';
  }
}
