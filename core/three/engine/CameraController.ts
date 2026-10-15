/**
 * ─────────────────────────────────────────────────────────────────
 * CameraController — Smooth camera with damping, FOV zoom, pitch clamp
 * ─────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import type { EventBus } from './EventBus';

export interface CameraConfig {
  fov?: number;
  minFov?: number;
  maxFov?: number;
  dampingFactor?: number;    // 0–1, lower = smoother. Default 0.12
  pitchLimit?: number;       // radians. Default PI/2.2
  dragSensitivity?: number;  // Default 0.003
  zoomSensitivity?: number;  // Default 0.04
}

export class CameraController {
  readonly camera: THREE.PerspectiveCamera;

  // Current state (interpolated)
  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private fov: number;

  // Target state (set by input)
  private targetYaw = 0;
  private targetPitch = 0;
  private targetFov: number;

  // Config
  private readonly minFov: number;
  private readonly maxFov: number;
  private readonly damping: number;
  private readonly pitchLimit: number;
  private readonly dragSensitivity: number;
  private readonly usesDefaultDragSensitivity: boolean;
  private readonly zoomSensitivity: number;

  // Pointer state
  private isPointerDown = false;
  private activePointerId: number | null = null;
  private readonly touchPointers = new Map<number, { x: number; y: number }>();
  private pinchStartDistance: number | null = null;
  private pinchStartFov = 0;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private startYaw = 0;
  private startPitch = 0;

  private bus: EventBus;
  private container: HTMLElement;
  private domElement: HTMLElement;

  // Unsubscribe callbacks
  private disposers: Array<() => void> = [];
  // When true, all pointer/wheel input is ignored (e.g. during marker drag)
  private inputLocked = false;

  constructor(container: HTMLElement, domElement: HTMLElement, bus: EventBus, config: CameraConfig = {}) {
    this.container = container;
    this.domElement = domElement;
    this.bus = bus;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.fov = config.fov ?? 75;
    this.targetFov = this.fov;
    this.minFov = config.minFov ?? 30;
    // Keep this aligned with the designer's zoom range and tour schema.
    this.maxFov = config.maxFov ?? 150;
    this.damping = config.dampingFactor ?? 0.12;
    this.pitchLimit = config.pitchLimit ?? Math.PI / 2.2;
    this.usesDefaultDragSensitivity = config.dragSensitivity === undefined;
    this.dragSensitivity = config.dragSensitivity ?? 0.003;
    this.zoomSensitivity = config.zoomSensitivity ?? 0.04;

    this.camera = new THREE.PerspectiveCamera(this.fov, width / height, 0.1, 3000);
    this.camera.position.set(0, 0, 0);

    this.bindPointerEvents();

    // Lock/unlock camera input when marker drag starts/stops
    this.disposers.push(
      bus.on('interaction:lock',   () => { this.inputLocked = true; }),
      bus.on('interaction:unlock', () => { this.inputLocked = false; }),
    );
  }

  // ── Public API ─────────────────────────────────────────────────

  /** Set camera orientation instantly (no lerp) */
  setOrientation(yaw: number, pitch: number, fov?: number): void {
    const safeYaw = Number.isFinite(yaw) ? yaw : 0;
    const safePitch = THREE.MathUtils.clamp(
      Number.isFinite(pitch) ? pitch : 0,
      -this.pitchLimit,
      this.pitchLimit,
    );
    this.yaw = safeYaw;
    this.pitch = safePitch;
    this.targetYaw = safeYaw;
    this.targetPitch = safePitch;
    if (fov !== undefined) {
      const safeFov = THREE.MathUtils.clamp(
        Number.isFinite(fov) ? fov : this.fov,
        this.minFov,
        this.maxFov,
      );
      this.fov = safeFov;
      this.targetFov = safeFov;
      this.camera.fov = safeFov;
      this.camera.updateProjectionMatrix();
    }
    this.applyRotation();
  }

  /**
   * Set camera roll (Z-axis rotation) to correct tilted panoramas.
   * Positive roll = clockwise from viewer's perspective.
   * This value persists across frames — it is not interpolated.
   */
  setRoll(roll: number): void {
    this.roll = Number.isFinite(roll) ? roll : 0;
    this.applyRotation();
  }

  getRoll(): number { return this.roll; }

  /** Set camera target orientation (lerp to it) */
  setTarget(yaw: number, pitch: number, fov?: number): void {
    if (Number.isFinite(yaw)) this.targetYaw = yaw;
    if (Number.isFinite(pitch)) {
      this.targetPitch = THREE.MathUtils.clamp(pitch, -this.pitchLimit, this.pitchLimit);
    }
    if (fov !== undefined && Number.isFinite(fov)) {
      this.targetFov = THREE.MathUtils.clamp(fov, this.minFov, this.maxFov);
    }
  }

  /** Override current + target yaw/pitch/fov directly (for animations) */
  setRaw(yaw: number, pitch: number, fov?: number): void {
    const safeYaw = Number.isFinite(yaw) ? yaw : this.yaw;
    const safePitch = THREE.MathUtils.clamp(
      Number.isFinite(pitch) ? pitch : this.pitch,
      -this.pitchLimit,
      this.pitchLimit,
    );
    this.yaw = safeYaw;
    this.pitch = safePitch;
    this.targetYaw = safeYaw;
    this.targetPitch = safePitch;
    if (fov !== undefined) {
      const safeFov = THREE.MathUtils.clamp(
        Number.isFinite(fov) ? fov : this.fov,
        this.minFov,
        this.maxFov,
      );
      this.fov = safeFov;
      this.targetFov = safeFov;
      this.camera.fov = safeFov;
      this.camera.updateProjectionMatrix();
    }
    this.applyRotation();
  }

  getYaw(): number { return this.yaw; }
  getPitch(): number { return this.pitch; }
  getFov(): number { return this.fov; }
  getTargetYaw(): number { return this.targetYaw; }
  getTargetPitch(): number { return this.targetPitch; }

  /** Called each frame by the engine render loop */
  update(): void {
    let moved = false;

    const dyaw = this.targetYaw - this.yaw;
    const dpitch = this.targetPitch - this.pitch;

    if (Math.abs(dyaw) > 0.0001 || Math.abs(dpitch) > 0.0001) {
      this.yaw += dyaw * this.damping;
      this.pitch += dpitch * this.damping;
      this.applyRotation();
      moved = true;
    }

    if (Math.abs(this.targetFov - this.fov) > 0.05) {
      this.fov += (this.targetFov - this.fov) * this.damping;
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
      moved = true;
    }

    if (moved) {
      this.bus.emit('camera:move', { yaw: this.yaw, pitch: this.pitch });
    }
  }

  onResize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.disposers.forEach((fn) => fn());
    this.disposers = [];
  }

  // ── Private ────────────────────────────────────────────────────

  private applyRotation(): void {
    const euler = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  private bindPointerEvents(): void {
    const el = this.domElement;

    // Pointer events alone do not disable the browser's native pan/zoom
    // recognizer. On touch screens that recognizer can cancel a panorama drag
    // midway through the gesture, making swiping feel intermittent.
    el.style.touchAction = 'none';
    el.style.userSelect = 'none';
    el.style.webkitUserSelect = 'none';

    const onDown = (e: PointerEvent) => {
      if (this.inputLocked) return;
      // Only capture camera drag from the WebGL canvas itself — don't
      // steal pointer events destined for interactive CSS3D elements
      // (video/iframe play buttons, controls, etc.).
      if (e.target !== el) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'touch') {
        if (this.touchPointers.size >= 2) return;
        this.touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        el.setPointerCapture(e.pointerId);
        if (this.touchPointers.size === 2) {
          const points = [...this.touchPointers.values()];
          const first = points[0]!;
          const second = points[1]!;
          this.pinchStartDistance = Math.hypot(second.x - first.x, second.y - first.y);
          this.pinchStartFov = this.targetFov;
          this.isPointerDown = false;
          e.preventDefault();
          return;
        }
      }
      if (this.activePointerId !== null) return;
      e.preventDefault();
      this.isPointerDown = true;
      this.activePointerId = e.pointerId;
      this.pointerStartX = e.clientX;
      this.pointerStartY = e.clientY;
      this.startYaw = this.targetYaw;
      this.startPitch = this.targetPitch;
      el.setPointerCapture(e.pointerId);
      this.bus.emit('interaction:dragstart', { x: e.clientX, y: e.clientY });
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && this.touchPointers.has(e.pointerId)) {
        this.touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touchPointers.size >= 2 && this.pinchStartDistance) {
          e.preventDefault();
          const points = [...this.touchPointers.values()];
          const first = points[0]!;
          const second = points[1]!;
          const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
          this.targetFov = THREE.MathUtils.clamp(
            this.pinchStartFov * (this.pinchStartDistance / distance),
            this.minFov,
            this.maxFov,
          );
          this.bus.emit('camera:fov', { fov: this.targetFov });
          return;
        }
      }
      if (!this.isPointerDown || this.inputLocked || e.pointerId !== this.activePointerId) return;
      e.preventDefault();
      const dx = e.clientX - this.pointerStartX;
      const dy = e.clientY - this.pointerStartY;

      // Keep a full-width swipe perceptually similar on phones and desktops.
      // The FOV factor also makes zoomed-in views more precise instead of
      // rotating by the same large angle as a wide view.
      const isTouchLikePointer = e.pointerType === 'touch' || e.pointerType === 'pen';
      const viewportWidth = Math.max(320, this.container.clientWidth || window.innerWidth);
      const viewportHeight = Math.max(320, this.container.clientHeight || window.innerHeight);
      const fovFactor = THREE.MathUtils.clamp(this.targetFov / 75, 0.45, 1.35);
      // A mouse has effectively unlimited travel because it can be lifted and
      // repositioned, so retain the original tuned sensitivity on desktop.
      // Touch/pen travel is limited by the physical screen and therefore uses
      // viewport-relative sensitivity.
      const sensitivityX = this.usesDefaultDragSensitivity && isTouchLikePointer
        ? (Math.PI / viewportWidth) * 0.72 * fovFactor
        : this.dragSensitivity;
      const sensitivityY = this.usesDefaultDragSensitivity && isTouchLikePointer
        ? (Math.PI / viewportHeight) * 0.62 * fovFactor
        : this.dragSensitivity;

      // Content-drag convention:
      //   Kéo phải (dx > 0) → camera quay trái → yaw tăng (+dx)
      //   Kéo lên  (dy < 0) → camera nhìn xuống → pitch giảm (+dy vì dy âm)
      this.targetYaw = this.startYaw + dx * sensitivityX;
      this.targetPitch = Math.max(
        -this.pitchLimit,
        Math.min(this.pitchLimit, this.startPitch + dy * sensitivityY)
      );
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        this.touchPointers.delete(e.pointerId);
        if (this.pinchStartDistance !== null) {
          this.pinchStartDistance = null;
          if (this.touchPointers.size === 1) {
            const [pointerId, point] = [...this.touchPointers.entries()][0]!;
            this.activePointerId = pointerId;
            this.isPointerDown = true;
            this.pointerStartX = point.x;
            this.pointerStartY = point.y;
            this.startYaw = this.targetYaw;
            this.startPitch = this.targetPitch;
          } else {
            this.activePointerId = null;
            this.isPointerDown = false;
            this.bus.emit('interaction:dragend');
          }
          if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
          return;
        }
      }
      if (!this.isPointerDown || e.pointerId !== this.activePointerId) return;
      this.isPointerDown = false;
      this.activePointerId = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      this.bus.emit('interaction:dragend');
    };

    const onWheel = (e: WheelEvent) => {
      if (this.inputLocked) return;
      e.preventDefault();
      this.targetFov = Math.max(this.minFov, Math.min(this.maxFov, this.targetFov + e.deltaY * this.zoomSensitivity));
      this.bus.emit('camera:fov', { fov: this.targetFov });
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('lostpointercapture', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    this.disposers.push(
      () => el.removeEventListener('pointerdown', onDown),
      () => el.removeEventListener('pointermove', onMove),
      () => el.removeEventListener('pointerup', onUp),
      () => el.removeEventListener('pointercancel', onUp),
      () => el.removeEventListener('lostpointercapture', onUp),
      () => el.removeEventListener('wheel', onWheel),
    );
  }
}
