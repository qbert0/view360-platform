import * as THREE from 'three';
import { PlaneObject3DMarker } from './PlaneObject3DMarker';
import type { NavigationMarker as NavigationMarkerData } from '#view360/types/tour';

const _navigationWorldPosition = new THREE.Vector3();
const _navigationCameraPosition = new THREE.Vector3();

type MarkerMode = 'arrow' | 'location-1' | 'location-2';

interface NavigationMeshData {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  time: number;
  baseQuaternion: THREE.Quaternion;
  basePosition: THREE.Vector3;
  /** Arrow mặc định hoặc một trong hai dáng ghim vị trí. */
  mode: MarkerMode;
  /** Loaded inset image for pin / pin-top mode */
  pinImage?: HTMLImageElement;
  /** Label text cho pin-top */
  label: string;
}

export class NavigationMarker extends PlaneObject3DMarker<NavigationMarkerData> {
  readonly markerType = 'navigation' as const;
  protected readonly style = { color: '#1d6fa8', icon: '↑', label: 'Điểm đến' };

  protected meshes = new Map<THREE.Mesh, NavigationMeshData>();
  /** Cache loaded images by URL to avoid re-downloading */
  private imageCache = new Map<string, HTMLImageElement>();
  private readonly fixedMode?: MarkerMode;
  private readonly variants: NavigationMarker[];
  protected readonly showLeaderLine: boolean;
  protected readonly navigationColor: string = '#2388e8';
  protected readonly titleFontSize: number = 86;
  protected readonly iconHitMargin: number = 5;
  protected readonly canvasWidth: number = 256;
  protected readonly canvasHeight: number = 256;
  protected readonly defaultIconWidth: number = 62;
  protected readonly defaultIconHeight: number = 65;

  constructor(
    fixedMode?: MarkerMode,
    showLeaderLine = true,
    variants: NavigationMarker[] = [],
  ) {
    super();
    this.fixedMode = fixedMode;
    this.showLeaderLine = showLeaderLine;
    this.variants = variants;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CREATE
  // ═══════════════════════════════════════════════════════════════

  override createObject(marker: NavigationMarkerData): THREE.Object3D {
    if (this.variants.length) {
      return (this.variants.find(variant => variant.supports(marker)) ?? this.variants[0]!).createObject(marker);
    }

    const mode = this.resolveMode(marker);
    const canvas = document.createElement('canvas');
    // Plane gốc chỉ chứa icon. Title/leader là child riêng để không mở rộng hitbox.
    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;
    const context = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    // ── Chọn mode ──
    // Ưu tiên marker.icon nếu có; nếu không thì auto dựa vào pitch.
    const color = this.resolveColor(marker);
    const label = (marker as any).label ?? (marker as any).name ?? '';
    const labelFont = this.resolveLabelFont(marker.labelFont);

    // Kích thước mesh theo mode
    const sizeY = (marker as any).iconSize ?? this.defaultIconHeight;
    const size = (marker as any).iconSize ?? this.defaultIconWidth;
    this.drawIcon(context, canvas, color, 0, false);

    const geometry = new THREE.PlaneGeometry(size, sizeY);

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        side: THREE.DoubleSide,
        opacity: 0,
      }),
    );
    mesh.renderOrder = 999;
    mesh.userData = { marker, markerType: this };
    this.restrictRaycastToIcon(mesh, canvas);
    if (this.showLeaderLine && label.trim()) {
      mesh.add(this.createTitleObject(marker, label, labelFont, size, sizeY));
    }
    this.repositionObject(mesh, marker.yaw, marker.pitch);

    const data: NavigationMeshData = {
      canvas,
      context,
      texture,
      time: 0,
      baseQuaternion: mesh.quaternion.clone(),
      basePosition: mesh.position.clone(),
      mode,
      label,
    };
    this.meshes.set(mesh, data);

    return mesh;
  }

  /**
   * Title là plane con chỉ để hiển thị. Nó không raycast nên hover/click luôn
   * được quyết định bởi đúng icon gốc, kể cả khi title rất dài.
   */
  protected createTitleObject(
    marker: NavigationMarkerData,
    label: string,
    labelFont: string,
    iconWidth: number,
    iconHeight: number,
  ): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 300;
    const context = canvas.getContext('2d')!;
    this.drawLeaderLabel(context, label, labelFont, 18, 238, this.navigationColor);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const scale = this.getScale(marker);
    const displayHeight = iconHeight;
    const displayWidth = displayHeight * canvas.width / canvas.height;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(displayWidth / scale.x, displayHeight / scale.y),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        side: THREE.DoubleSide,
        opacity: 0,
      }),
    );
    // Chồng nhẹ plane label lên icon để chấm đầu leader không bị hở xa.
    mesh.position.set(iconWidth / 2 + displayWidth / (2 * scale.x) - 22 / scale.x, 0, 1);
    mesh.renderOrder = 1000;
    mesh.userData.navigationTitle = true;
    mesh.raycast = () => {};
    return mesh;
  }

  /**
   * A transparent Mesh still raycasts as its complete rectangular geometry.
   * Navigation labels make that rectangle very wide, so constrain hits to one
   * explicit rectangular hitbox around the icon. Leader/title stay excluded.
   */
  private restrictRaycastToIcon(
    mesh: THREE.Mesh,
    canvas: HTMLCanvasElement,
  ): void {
    const bounds = this.getIconHitBounds();
    if (!bounds) return;
    const baseRaycast = mesh.raycast.bind(mesh);

    mesh.raycast = (raycaster, intersections) => {
      const candidates: THREE.Intersection[] = [];
      baseRaycast(raycaster, candidates);
      for (const hit of candidates) {
        if (!hit.uv) continue;
        const x = Math.floor(hit.uv.x * canvas.width);
        const y = Math.floor((1 - hit.uv.y) * canvas.height);
        const insideIconHitbox = !(
          x < bounds.left - this.iconHitMargin
          || x > bounds.right + this.iconHitMargin
          || y < bounds.top - this.iconHitMargin
          || y > bounds.bottom + this.iconHitMargin
        );
        if (insideIconHitbox) intersections.push(hit);
      }
    };
  }

  protected getIconHitBounds(): { left: number; top: number; right: number; bottom: number } | null {
    return null;
  }

  protected resolveColor(marker: NavigationMarkerData): string {
    return (marker as any).pinColor ?? '#171717';
  }

  protected drawIcon(
    _ctx: CanvasRenderingContext2D,
    _canvas: HTMLCanvasElement,
    _color: string,
    _time: number,
    _hovered: boolean,
  ): void {}

  /**
   * Cả Arrow, Local và Drone đều bám mặt cầu. Bù projection theo cos góc nhìn
   * để marker không phình to khi đi từ chính diện ra mép camera.
   */
  override updateProjection(object: THREE.Object3D, camera: THREE.Camera): void {
    // First cancel camera FOV scaling so icon/title retain their authored
    // screen size, then apply the existing off-axis sphere compensation.
    super.updateProjection(object, camera);
    object.getWorldPosition(_navigationWorldPosition);
    _navigationCameraPosition.copy(_navigationWorldPosition).applyMatrix4(camera.matrixWorldInverse);
    const distance = _navigationWorldPosition.distanceTo(camera.position);
    if (distance <= 0) return;
    const perspectiveCompensation = THREE.MathUtils.clamp(
      -_navigationCameraPosition.z / distance,
      0.2,
      1,
    );
    object.scale.multiplyScalar(perspectiveCompensation);

    // Title and icon share the exact same FOV compensation on the root.
    // Keep title-local scale neutral: zoom must never introduce a second,
    // independent text scaling curve.
    for (const child of object.children) {
      if (child.userData.navigationTitle) child.scale.setScalar(1);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  UPDATE
  // ═══════════════════════════════════════════════════════════════

  override updateObject(
    object: THREE.Object3D,
    delta: number,
    hovered: boolean,
    _pulse: number,
    hoverScale: number,
    _camera: THREE.Camera,
  ): void {
    if (!(object instanceof THREE.Mesh)) return;
    const data = this.meshes.get(object);
    if (!data) return;

    data.time += delta;
    const marker = object.userData.marker as NavigationMarkerData;
    const color = this.resolveColor(marker);

    this.syncTitleOpacity(object);

    this.drawIcon(data.context, data.canvas, color, data.time, hovered);
    data.texture.needsUpdate = true;
    this.applyHoverScale(object, new THREE.Vector3(1, 1, 1), marker, false, hoverScale);
  }

  protected syncTitleOpacity(object: THREE.Mesh): void {
    const rootOpacity = (object.material as THREE.MeshBasicMaterial).opacity;
    for (const child of object.children) {
      if (child instanceof THREE.Mesh && child.userData.navigationTitle) {
        (child.material as THREE.MeshBasicMaterial).opacity = rootOpacity;
      }
    }
  }

  override repositionObject(object: THREE.Object3D, yaw: number, pitch: number): void {
    super.repositionObject(object, yaw, pitch);
    if (object instanceof THREE.Mesh) {
      const data = this.meshes.get(object);
      data?.baseQuaternion.copy(object.quaternion);
      data?.basePosition.copy(object.position);
    }
  }

  protected override getRotation(marker: NavigationMarkerData): THREE.Euler {
    const isArrow = this.resolveMode(marker) === 'arrow';
    return new THREE.Euler(
      marker.rotX ?? (isArrow ? Math.PI / 3 : 0),
      marker.rotY ?? 0,
      marker.rotZ ?? marker.rotation ?? 0,
      'ZXY',
    );
  }

  protected override getScale(marker: NavigationMarkerData): THREE.Vector3 {
    const isArrow = this.resolveMode(marker) === 'arrow';
    return new THREE.Vector3(
      this.normalizeScale(marker.scaleX ?? (isArrow ? 1.6 : 1)),
      this.normalizeScale(marker.scaleY ?? 1),
      1,
    );
  }

  override disposeObject(object: THREE.Object3D): void {
    if (!(object instanceof THREE.Mesh)) return;
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = child.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
      child.geometry.dispose();
    });
    this.meshes.delete(object);
  }

  // ═══════════════════════════════════════════════════════════════
  //  MODE RESOLUTION
  // ═══════════════════════════════════════════════════════════════

  protected resolveMode(marker: NavigationMarkerData): MarkerMode {
    if (this.fixedMode) return this.fixedMode;
    const icon = (marker as any).icon;
    if (icon === 'local' || icon === 'location-1' || icon === 'pin') return 'location-1';
    if (icon === 'drone' || icon === 'location-2' || icon === 'pin-top' || icon === 'anchor') return 'location-2';
    // Giá trị arrow-1/arrow-2 từng được ghi bởi bản editor trước vẫn là mũi tên.
    return 'arrow';
  }

  private drawLeaderLabel(ctx: CanvasRenderingContext2D, label: string, fontFamily: string, jointX: number, jointY: number, color: string): void {
    const title = label.trim() || 'Điểm đến';
    ctx.font = `700 ${this.titleFontSize}px ${fontFamily}`;
    const textWidth = Math.min(ctx.measureText(title).width, 1250);
    const underlineY = 145;
    const leaderAngle = THREE.MathUtils.degToRad(65);
    const elbowX = jointX + Math.abs(jointY - underlineY) / Math.tan(leaderAngle);
    const textX = elbowX + 28;
    const baseline = underlineY - 18;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(jointX, jointY, 9, 0, Math.PI * 2); ctx.fill();
    // Chấm neo -> đoạn chéo đi lên -> đoạn ngang làm chân title.
    ctx.beginPath();
    ctx.moveTo(jointX + 7, jointY - 5);
    ctx.lineTo(elbowX, underlineY);
    ctx.lineTo(textX + textWidth, underlineY);
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 7;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${this.titleFontSize}px ${fontFamily}`;
    ctx.fillText(title, textX, baseline, 1250);
    ctx.restore();
  }

  protected resolveLabelFont(font: NavigationMarkerData['labelFont']): string {
    switch (font) {
      case 'outfit': return '"Outfit", system-ui, sans-serif';
      case 'montserrat': return '"Montserrat", "Be Vietnam Pro", sans-serif';
      case 'serif': return 'Georgia, "Times New Roman", serif';
      case 'be-vietnam-pro':
      default: return '"Be Vietnam Pro", system-ui, sans-serif';
    }
  }

  private drawLocation2Path(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    tipY: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.bezierCurveTo(cx + radius * 0.9, cy - radius, cx + radius, cy - 4, cx + radius * 0.72, cy + 30);
    ctx.bezierCurveTo(cx + radius * 0.38, cy + 67, cx + 13, cy + 75, cx, tipY);
    ctx.bezierCurveTo(cx - 13, cy + 75, cx - radius * 0.38, cy + 67, cx - radius * 0.72, cy + 30);
    ctx.bezierCurveTo(cx - radius, cy - 4, cx - radius * 0.9, cy - radius, cx, cy - radius);
    ctx.closePath();
  }

  // ═══════════════════════════════════════════════════════════════
  //  PIN-TOP MODE (trên cao) — hình 2
  //  Label nền xám bo góc + oval pin + đuôi nhọn ngắn, viền trắng
  // ═══════════════════════════════════════════════════════════════

  private drawPinTop(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    color: string,
    label: string,
    time: number,
    hovered: boolean,
    insetImage?: HTMLImageElement,
  ): void {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;

    // ── Bố cục ──
    const labelH = 36;
    const labelY = 4;
    const labelGap = 8;

    const pinW = 130;
    const pinH = 150;
    const pinX = cx - pinW / 2;
    const pinY = labelY + labelH + labelGap;
    const tipY = pinY + pinH + 30;

    // ── 1. LABEL ──
    if (label) {
      ctx.save();
      const fontSize = 22;
      ctx.font = `bold ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const metrics = ctx.measureText(label);
      const padX = 18;
      const maxW = w - 12;
      const boxW = Math.min(metrics.width + padX * 2, maxW);
      const boxX = cx - boxW / 2;
      const boxY = labelY;

      // nền xám bo góc
      this.roundRect(ctx, boxX, boxY, boxW, labelH, 9);
      ctx.fillStyle = hovered
        ? 'rgba(70, 90, 110, 0.98)'
        : 'rgba(90, 110, 130, 0.88)';
      ctx.fill();

      // chữ trắng
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, cx, boxY + labelH / 2 + 1, boxW - padX * 2);
      ctx.restore();
    }

    // ── 2. PIN (oval + đuôi nhọn ngắn) ──
    const pulse = 1 + Math.sin(time * 3) * 0.015;
    const pinCx = cx;
    const pinCy = pinY + pinH / 2;

    ctx.save();
    ctx.translate(pinCx, pinCy);
    ctx.scale(pulse, pulse);
    ctx.translate(-pinCx, -pinCy);

    // shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    this.drawOvalPinPath(ctx, pinX, pinY, pinW, pinH, tipY);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // hover glow
    if (hovered) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.7)';
      ctx.shadowBlur = 22;
      this.drawOvalPinPath(ctx, pinX, pinY, pinW, pinH, tipY);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }

    // thân trắng
    this.drawOvalPinPath(ctx, pinX, pinY, pinW, pinH, tipY);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // viền nhẹ
    this.drawOvalPinPath(ctx, pinX, pinY, pinW, pinH, tipY);
    ctx.strokeStyle = hovered
      ? 'rgba(170, 195, 220, 1)'
      : 'rgba(200, 210, 220, 0.9)';
    ctx.lineWidth = hovered ? 3 : 2;
    ctx.stroke();

    // ── 3. ẢNH INSET oval (chừa viền trắng đều) ──
    const pad = 8;
    const innerX = pinX + pad;
    const innerY = pinY + pad;
    const innerW = pinW - pad * 2;
    const innerH = pinH - pad * 2;

    ctx.save();
    this.ovalPath(ctx, innerX, innerY, innerW, innerH);
    ctx.clip();

    if (insetImage && insetImage.complete && insetImage.naturalWidth > 0) {
      this.drawCoverImage(ctx, insetImage, innerX + innerW / 2, innerY + innerH / 2, innerW, innerH);
    } else {
      // fallback: gradient xanh trời
      const g = ctx.createLinearGradient(innerX, innerY, innerX, innerY + innerH);
      g.addColorStop(0, '#4a90c4');
      g.addColorStop(0.55, '#7fb8dd');
      g.addColorStop(1, '#2a5a7a');
      ctx.fillStyle = g;
      ctx.fillRect(innerX, innerY, innerW, innerH);
    }
    ctx.restore();

    ctx.restore(); // pulse
  }

  /** Path oval + đuôi nhọn ngắn (hình 2). */
  private drawOvalPinPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    tipY: number,
  ): void {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;

    // Đuôi nhọn hẹp
    const tailHalf = 16;
    const tailBaseY = y + h - 6;

    ctx.beginPath();
    // Vẽ ellipse từ điểm dưới-phải, vòng qua trên, xuống dưới-trái
    // rồi tới tip và quay lại điểm bắt đầu.
    const startAngle = Math.PI / 2 - Math.asin(Math.min(tailHalf / rx, 1));
    const endAngle = Math.PI / 2 + Math.asin(Math.min(tailHalf / rx, 1));

    ctx.ellipse(cx, cy, rx, ry, 0, startAngle, endAngle, false);
    ctx.lineTo(cx, tipY);
    ctx.lineTo(cx + rx * Math.sin(Math.asin(Math.min(tailHalf / rx, 1))), tailBaseY);
    ctx.closePath();
  }

  /** Path oval thuần (dùng để clip ảnh inset). */
  private ovalPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
  }

  /** Bo góc chữ nhật. */
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /** Vẽ ảnh theo kiểu "cover" vào 1 khung (đã clip trước đó). */
  private drawCoverImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    centerX: number,
    centerY: number,
    boxW: number,
    boxH: number,
  ): void {
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const boxAspect = boxW / boxH;
    let dw: number;
    let dh: number;
    if (imgAspect > boxAspect) {
      dh = boxH;
      dw = dh * imgAspect;
    } else {
      dw = boxW;
      dh = dw / imgAspect;
    }
    ctx.drawImage(img, centerX - dw / 2, centerY - dh / 2, dw, dh);
  }

  // ═══════════════════════════════════════════════════════════════
  //  IMAGE LOADING
  // ═══════════════════════════════════════════════════════════════

  private async loadIcon(url: string): Promise<HTMLImageElement> {
    const cached = this.imageCache.get(url);
    if (cached) return cached;

    return new Promise<HTMLImageElement>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imageCache.set(url, img);
        resolve(img);
      };
      img.onerror = () => {
        const fallback = new Image();
        fallback.src =
          'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        fallback.onload = () => resolve(fallback);
      };
      img.src = url;
    });
  }
}
