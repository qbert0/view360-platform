import * as THREE from 'three';
import { NavigationMarker } from './NavigationMarker';
import type { NavigationMarker as NavigationMarkerData, TourMarker } from '#view360/types/tour';

interface DroneExitAnimation {
  startedAt: number;
  duration: number;
  titlePosition?: THREE.Vector3;
  promise: Promise<void>;
}

const cameraRight = new THREE.Vector3();
const cameraQuaternion = new THREE.Quaternion();

export class DroneNavigationMarker extends NavigationMarker {
  protected override readonly canvasWidth = 300;
  protected override readonly canvasHeight = 300;
  protected override readonly defaultIconWidth = 65;
  protected override readonly defaultIconHeight = 65;
  protected override readonly navigationColor = '#2388e8';
  protected override readonly titleFontSize = 64;
  protected readonly exitDuration = 280;
  protected readonly exitDistance = 46;
  private readonly exitAnimations = new WeakMap<THREE.Object3D, DroneExitAnimation>();

  constructor(showLeaderLine = true) { super('location-2', showLeaderLine); }

  protected override resolveColor(): string { return this.navigationColor; }

  protected override getIconHitBounds() {
    return { left: 38, top: 22, right: 278, bottom: 202 };
  }

  protected override drawIcon(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    color: string,
    time: number,
    hovered: boolean,
  ): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pulse = 1 + Math.sin(time * 3) * 0.015;
    ctx.save();
    ctx.translate(150, 90); ctx.scale(pulse, pulse); ctx.translate(-150, -90);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = hovered ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.4)';
    ctx.shadowBlur = hovered ? 22 : 10;
    ctx.lineWidth = 17;
    ctx.beginPath(); ctx.moveTo(116, 100); ctx.lineTo(66, 75); ctx.moveTo(184, 100); ctx.lineTo(234, 75); ctx.stroke();
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(66, 75); ctx.lineTo(66, 42); ctx.moveTo(234, 75); ctx.lineTo(234, 42); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(66, 37, 43, 10, 0, 0, Math.PI * 2); ctx.ellipse(234, 37, 43, 10, 0, 0, Math.PI * 2); ctx.fill();
    this.drawDroneRoundRect(ctx, 108, 68, 84, 70, 18); ctx.fill();
    ctx.beginPath(); ctx.arc(150, 105, 20, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(150, 105, 13, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 13;
    ctx.beginPath(); ctx.moveTo(129, 134); ctx.lineTo(102, 190); ctx.moveTo(171, 134); ctx.lineTo(198, 190); ctx.stroke();
    ctx.restore();
  }

  override playActivationAnimation(object: THREE.Object3D): Promise<void> {
    const current = this.exitAnimations.get(object);
    if (current) return current.promise;

    const title = object.children.find(child => child.userData.navigationTitle);
    let resolveAnimation!: () => void;
    const promise = new Promise<void>((resolve) => { resolveAnimation = resolve; });
    const animation: DroneExitAnimation = {
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

    camera.getWorldQuaternion(cameraQuaternion);
    cameraRight.set(1, 0, 0).applyQuaternion(cameraQuaternion).normalize();
    object.position.copy(data.basePosition).addScaledVector(cameraRight, -distance);

    const title = object.children.find(child => child.userData.navigationTitle);
    if (title && exit.titlePosition) {
      title.position.copy(exit.titlePosition);
      title.position.x += (distance * 2) / this.getScale(marker).x;
    }
  }

  private drawDroneRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number): void {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  override supports(marker: TourMarker): marker is NavigationMarkerData {
    return marker.plugin === 'navigation' && ['drone', 'location-2', 'pin-top', 'anchor'].includes(marker.icon ?? '');
  }
}
