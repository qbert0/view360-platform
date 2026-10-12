import * as THREE from 'three';
import type { TourMarker } from '#view360/types/tour';

export const MARKER_SPHERE_RADIUS = 520;
export const MIN_MARKER_SPHERE_RADIUS = 120;
export const MAX_MARKER_SPHERE_RADIUS = 580;
const MARKER_CANVAS_SIZE = 256;
const MARKER_BASE_SIZE = 52;
const MARKER_REFERENCE_FOV = 75;
const MARKER_REFERENCE_TAN = Math.tan(THREE.MathUtils.degToRad(MARKER_REFERENCE_FOV) / 2);

export interface MarkerStyle {
  color: string;
  icon: string;
  label: string;
}

/**
 * Abstract definition of one marker type.
 * MarkerPlugin owns lifecycle and interaction; each MarkerBase owns visuals.
 */
export abstract class MarkerBase<TMarker extends TourMarker = TourMarker> {
  /** Discriminator used in tour YAML (`marker.plugin`). */
  abstract readonly markerType: TMarker['plugin'];
  protected abstract readonly style: MarkerStyle;

  supports(marker: TourMarker): marker is TMarker {
    return marker.plugin === this.markerType;
  }

  createObject(marker: TMarker): THREE.Object3D {
    const canvas = document.createElement('canvas');
    canvas.width = MARKER_CANVAS_SIZE;
    canvas.height = MARKER_CANVAS_SIZE;
    const context = canvas.getContext('2d')!;
    this.drawSprite(context, marker.label || this.style.label);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(material);
    this.repositionObject(sprite, marker.yaw, marker.pitch);
    sprite.scale.set(MARKER_BASE_SIZE, MARKER_BASE_SIZE, 1);
    sprite.renderOrder = 999;
    sprite.userData = { marker, baseScale: MARKER_BASE_SIZE, markerType: this };
    return sprite;
  }

  updateObject(
    object: THREE.Object3D,
    _delta: number,
    hovered: boolean,
    pulse: number,
    hoverScale: number,
    _camera: THREE.Camera,
  ): void {
    const base = object.userData.baseScale ?? MARKER_BASE_SIZE;
    const scale = base * (hovered ? hoverScale : 1) * pulse;
    object.scale.set(scale, scale, 1);
  }

  repositionObject(object: THREE.Object3D, yaw: number, pitch: number): void {
    this.positionOnSphere(object, yaw, pitch);
  }

  protected positionOnSphere(object: THREE.Object3D, yaw: number, pitch: number, requestedRadius?: number): void {
    const radius = THREE.MathUtils.clamp(
      Number.isFinite(requestedRadius) ? requestedRadius! : MARKER_SPHERE_RADIUS,
      MIN_MARKER_SPHERE_RADIUS,
      MAX_MARKER_SPHERE_RADIUS,
    );
    object.position.set(
      -radius * Math.sin(yaw) * Math.cos(pitch),
       radius * Math.sin(pitch),
      -radius * Math.cos(yaw) * Math.cos(pitch),
    );
  }

  /**
   * Giữ kích thước hiển thị của marker ổn định khi FOV thay đổi.
   *
   * Perspective projection makes apparent height proportional to
   * `1 / tan(fov / 2)`. Multiplying world scale by the inverse relationship
   * cancels that effect while retaining the marker's world-space anchor.
   * FOV 75° is the authored/reference size used throughout the designer.
   */
  updateProjection(object: THREE.Object3D, camera: THREE.Camera): void {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const fovCompensation = THREE.MathUtils.clamp(
      Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / MARKER_REFERENCE_TAN,
      0.25,
      5,
    );
    object.scale.multiplyScalar(fovCompensation);
  }

  /** Optional animation played after click and before navigation is emitted. */
  playActivationAnimation(_object: THREE.Object3D): Promise<void> {
    return Promise.resolve();
  }

  disposeObject(object: THREE.Object3D): void {
    if (object instanceof THREE.Sprite) {
      object.material.map?.dispose();
      object.material.dispose();
    }
  }

  private drawSprite(context: CanvasRenderingContext2D, label: string): void {
    context.save();
    context.shadowColor = 'rgba(0,0,0,0.5)';
    context.shadowBlur = 14;
    context.shadowOffsetY = 5;
    context.beginPath();
    context.arc(128, 88, 50, 0, Math.PI * 2);
    context.fillStyle = this.style.color;
    context.fill();
    context.shadowColor = 'transparent';
    context.lineWidth = 5;
    context.strokeStyle = 'rgba(255,255,255,0.9)';
    context.stroke();
    context.restore();

    context.save();
    context.fillStyle = '#fff';
    context.font = '900 36px "Outfit", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(this.style.icon, 128, 88);
    context.restore();

    context.save();
    context.font = '600 20px "Be Vietnam Pro", sans-serif';
    const width = Math.max(110, context.measureText(label).width + 28);
    const height = 34;
    const x = 128 - width / 2;
    const y = 170 - height / 2;
    const radius = 8;
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
    context.fillStyle = 'rgba(12,12,12,0.88)';
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = 'rgba(255,255,255,0.2)';
    context.stroke();
    context.fillStyle = '#fff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, 128, 170);
    context.restore();
  }
}
