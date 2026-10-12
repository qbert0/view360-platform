import * as THREE from 'three';
import { NavigationMarker } from './NavigationMarker';
import type { NavigationMarker as NavigationMarkerData, TourMarker } from '#view360/types/tour';

interface LocalExitAnimation {
  startedAt: number;
  duration: number;
  titlePosition?: THREE.Vector3;
  promise: Promise<void>;
}

const cameraRight = new THREE.Vector3();
const cameraQuaternion = new THREE.Quaternion();

export class LocalNavigationMarker extends NavigationMarker {
  protected override readonly canvasWidth = 300;
  protected override readonly canvasHeight = 300;
  protected override readonly defaultIconWidth = 65;
  protected override readonly defaultIconHeight = 65;
  protected override readonly navigationColor = '#2388e8';
  protected override readonly titleFontSize = 64;
  protected readonly exitDuration = 280;
  protected readonly exitDistance = 46;
  private readonly exitAnimations = new WeakMap<THREE.Object3D, LocalExitAnimation>();

  constructor(showLeaderLine = true) { super('location-1', showLeaderLine); }

  protected override getScale(marker: NavigationMarkerData): THREE.Vector3 {
    return new THREE.Vector3(
      this.normalizeScale(marker.scaleX ?? 1),
      this.normalizeScale(marker.scaleY ?? 0.8),
      1,
    );
  }

  protected override resolveColor(): string { return this.navigationColor; }

  protected override getIconHitBounds() {
    return { left: 86, top: 32, right: 214, bottom: 252 };
  }

  protected override drawIcon(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    color: string,
    time: number,
    hovered: boolean,
  ): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pulse = 1 + Math.sin(time * 3) * 0.018;
    ctx.save();
    ctx.translate(150, 132); ctx.scale(pulse, pulse); ctx.translate(-150, -132);
    ctx.fillStyle = color;
    ctx.shadowColor = hovered ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.45)';
    ctx.shadowBlur = hovered ? 24 : 12;
    ctx.beginPath();
    ctx.moveTo(150, 250);
    ctx.bezierCurveTo(130, 215, 86, 167, 86, 98);
    ctx.arc(150, 98, 64, Math.PI, 0);
    ctx.bezierCurveTo(214, 167, 170, 215, 150, 250);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.arc(150, 98, 27, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
  }

  override playActivationAnimation(object: THREE.Object3D): Promise<void> {
    const current = this.exitAnimations.get(object);
    if (current) return current.promise;

    const title = object.children.find(child => child.userData.navigationTitle);
    let resolveAnimation!: () => void;
    const promise = new Promise<void>((resolve) => { resolveAnimation = resolve; });
    const animation: LocalExitAnimation = {
      startedAt: performance.now(),
      duration: this.exitDuration,
      titlePosition: title?.position.clone(),
      promise,
    };
    this.exitAnimations.set(object, animation);
    window.setTimeout(resolveAnimation, this.exitDuration);
    return promise;
  }

  override updateObject(
    object: THREE.Object3D,
    delta: number,
    hovered: boolean,
    _pulse: number,
    _hoverScale: number,
    camera: THREE.Camera,
  ): void {
    if (!(object instanceof THREE.Mesh)) return;
    const data = this.meshes.get(object);
    if (!data) return;
    data.time += delta;
    const marker = object.userData.marker as NavigationMarkerData;
    this.drawIcon(data.context, data.canvas, this.navigationColor, data.time, hovered);
    data.texture.needsUpdate = true;
    this.applyHoverScale(object, new THREE.Vector3(1, 1, 1), marker, false, 1);
    this.faceCamera(object, camera);
    this.syncTitleOpacity(object);

    const exit = this.exitAnimations.get(object);
    if (!exit) return;

    const progress = THREE.MathUtils.clamp(
      (performance.now() - exit.startedAt) / exit.duration,
      0,
      1,
    );
    const eased = 1 - Math.pow(1 - progress, 3);
    const distance = this.exitDistance * eased;

    // Root chính là icon: dịch nó sang trái theo phương ngang của camera.
    camera.getWorldQuaternion(cameraQuaternion);
    cameraRight.set(1, 0, 0).applyQuaternion(cameraQuaternion).normalize();
    object.position.copy(data.basePosition).addScaledVector(cameraRight, -distance);

    // Title là child nên trước hết phải bù quãng root đi trái, sau đó mới cộng
    // thêm quãng đi phải. Kết quả trên màn hình: icon trái, title phải.
    const title = object.children.find(child => child.userData.navigationTitle);
    if (title && exit.titlePosition) {
      title.position.copy(exit.titlePosition);
      title.position.x += (distance * 2) / this.getScale(marker).x;
    }
  }

  override supports(marker: TourMarker): marker is NavigationMarkerData {
    return marker.plugin === 'navigation' && ['local', 'location-1', 'pin'].includes(marker.icon ?? '');
  }
}
