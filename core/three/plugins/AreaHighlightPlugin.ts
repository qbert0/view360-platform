import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { PluginBase } from './PluginBase';
import type { AreaHighlight, AreaHighlightPoint, TourScene } from '#view360/types/tour';

export interface AreaHighlightPluginOptions {
  /** Designer keeps areas visible; viewer plays the one-shot animation. */
  preview?: boolean;
}

interface AreaVisual {
  object: THREE.Group;
  line: Line2;
  lineGeometry: LineGeometry;
  fill: THREE.MeshBasicMaterial;
  outline: LineMaterial;
  outlineSegmentCount: number;
  mode: NonNullable<AreaHighlight['mode']>;
  elapsedMs: number;
  delayMs: number;
  traceDurationMs: number;
  fillDurationMs: number;
  maxOpacity: number;
}

const DEFAULT_RADIUS = 585;
const HIGHLIGHT_RENDER_ORDER = 100;
const EDITOR_VERTEX_RENDER_ORDER = 1100;
const DEFAULT_FILL_DURATION_MS = 3000;
const EDITOR_VERTEX_RADIUS = 14;
const EDITOR_VERTEX_HIT_RADIUS = 22;

/** One-shot spherical polygon highlight for land/zone introductions. */
export class AreaHighlightPlugin extends PluginBase {
  readonly id = 'area-highlight';
  readonly name = 'Area Highlight Plugin';

  private readonly root = new THREE.Group();
  private readonly visuals: AreaVisual[] = [];
  private readonly preview: boolean;
  private unsubscribeRotation?: () => void;
  private readonly pointer = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private currentAreas: AreaHighlight[] = [];
  private editingEnabled = false;
  private selectedPoint: { areaId: string; pointIndex: number } | null = null;
  private draggingVertex: { areaId: string; pointIndex: number; pointerId: number } | null = null;
  private pointerCleanups: Array<() => void> = [];

  constructor(options: AreaHighlightPluginOptions = {}) {
    super();
    this.preview = options.preview ?? false;
  }

  protected override onInit(): void {
    // Marker objects use renderOrder 998–1000. The highlight must always stay
    // underneath them, even though both layers use transparent materials.
    this.root.renderOrder = HIGHLIGHT_RENDER_ORDER;
    this.ctx.scene.add(this.root);
    this.unsubscribeRotation = this.ctx.bus.on('scene:rotation', ({ rotation }) => {
      this.root.rotation.y = rotation;
      this.root.updateMatrixWorld(true);
    });
    if (this.preview) this.bindVertexDragging();
  }

  override onSceneLoad(): void {
    this.clear();
  }

  override onSceneReady(scene: TourScene): void {
    this.setAreas(scene.areaHighlights ?? [], scene.panoramaRotation ?? 0);
  }

  /** Replace current areas; used by the designer while vertices are drawn. */
  setAreas(areas: AreaHighlight[], panoramaRotation = this.root.rotation.y): void {
    this.currentAreas = areas;
    this.clear();
    this.root.rotation.y = panoramaRotation;
    for (const area of areas) {
      const visual = this.createArea(area);
      if (!visual) continue;
      this.visuals.push(visual);
      this.root.add(visual.object);
    }
  }

  /** Admin-only: vertices are draggable only in the explicit edit mode. */
  setEditingEnabled(enabled: boolean): void {
    this.editingEnabled = enabled;
    if (!enabled) this.draggingVertex = null;
  }

  selectPoint(areaId: string | null, pointIndex: number | null): void {
    this.selectedPoint = areaId !== null && pointIndex !== null ? { areaId, pointIndex } : null;
    if (this.currentAreas.length) this.setAreas(this.currentAreas, this.root.rotation.y);
  }

  protected override onUpdate(delta: number): void {
    if (this.preview) return;

    for (const visual of this.visuals) {
      visual.elapsedMs += delta * 1000;
      const localTime = visual.elapsedMs - visual.delayMs;
      if (localTime < 0) {
        visual.object.visible = false;
        continue;
      }

      const totalDuration = visual.traceDurationMs + visual.fillDurationMs;
      if (localTime >= totalDuration) {
        visual.object.visible = false;
        continue;
      }

      visual.object.visible = true;
      if (localTime < visual.traceDurationMs) {
        const traceProgress = THREE.MathUtils.clamp(localTime / visual.traceDurationMs, 0, 1);
        const visibleSegments = Math.max(1, Math.ceil(traceProgress * visual.outlineSegmentCount));
        visual.line.visible = true;
        visual.lineGeometry.instanceCount = visibleSegments;
        visual.outline.opacity = Math.min(1, visual.maxOpacity + 0.5);
        visual.fill.opacity = 0;
        continue;
      }

      // Once the outline has finished drawing, hold the selected result for
      // exactly three seconds and then remove the complete visual.
      const fillTime = localTime - visual.traceDurationMs;
      const fillProgress = THREE.MathUtils.clamp(fillTime / visual.fillDurationMs, 0, 1);
      const fadeIn = THREE.MathUtils.smoothstep(fillProgress, 0, 0.06);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(fillProgress, 0.92, 1);
      const strength = fadeIn * fadeOut;
      visual.lineGeometry.instanceCount = visual.outlineSegmentCount;
      visual.line.visible = visual.mode !== 'fill';
      visual.outline.opacity = Math.min(1, visual.maxOpacity + 0.38) * strength;
      visual.fill.opacity = visual.mode === 'outline' ? 0 : visual.maxOpacity * strength;
    }
  }

  protected override onDestroy(): void {
    this.unsubscribeRotation?.();
    this.pointerCleanups.forEach(cleanup => cleanup());
    this.pointerCleanups = [];
    this.clear();
    this.ctx.scene.remove(this.root);
  }

  private createArea(area: AreaHighlight): AreaVisual | null {
    if (!area.points || area.points.length < (this.preview ? 1 : 3)) return null;
    const radius = THREE.MathUtils.clamp(area.radius ?? DEFAULT_RADIUS, 100, 595);
    const points = this.unwrapYaw(area.points);
    const shape = new THREE.Shape();
    shape.moveTo(points[0]!.yaw, points[0]!.pitch);
    for (let index = 1; index < points.length; index += 1) shape.lineTo(points[index]!.yaw, points[index]!.pitch);
    if (points.length >= 3) shape.closePath();

    const geometry = points.length >= 3
      ? new THREE.ShapeGeometry(shape)
      : new THREE.BufferGeometry();
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (positions) {
      for (let index = 0; index < positions.count; index += 1) {
        const position = this.sphericalPosition(positions.getX(index), positions.getY(index), radius);
        positions.setXYZ(index, position.x, position.y, position.z);
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    }

    const maxOpacity = THREE.MathUtils.clamp(area.opacity ?? 0.34, 0.05, 0.9);
    const fill = new THREE.MeshBasicMaterial({
      color: area.color ?? '#22c55e',
      transparent: true,
      opacity: this.preview ? maxOpacity : 0,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geometry, fill);
    mesh.renderOrder = HIGHLIGHT_RENDER_ORDER;
    mesh.visible = (area.mode ?? 'fill-outline') !== 'outline';

    const outlinePoints = this.createOutlinePoints(points, radius + 0.4, points.length >= 3);
    const outlineGeometry = new LineGeometry();
    outlineGeometry.setPositions(outlinePoints.flatMap(point => [point.x, point.y, point.z]));
    const outline = new LineMaterial({
      color: area.outlineColor ?? '#ffffff',
      transparent: true,
      opacity: this.preview ? Math.min(1, maxOpacity + 0.38) : 0,
      depthTest: false,
      depthWrite: false,
      linewidth: THREE.MathUtils.clamp(area.lineWidth ?? 5, 1, 24),
      worldUnits: false,
      blending: THREE.AdditiveBlending,
    });
    const canvas = this.ctx.renderer.domElement;
    outline.resolution.set(canvas.clientWidth || 1, canvas.clientHeight || 1);
    const line = new Line2(outlineGeometry, outline);
    line.computeLineDistances();
    line.renderOrder = HIGHLIGHT_RENDER_ORDER + 1;
    line.visible = (area.mode ?? 'fill-outline') !== 'fill';

    const object = new THREE.Group();
    object.name = `area-highlight:${area.id}`;
    object.add(mesh, line);
    if (this.preview) {
      points.forEach((point, pointIndex) => {
        const selected = this.selectedPoint?.areaId === area.id
          && this.selectedPoint.pointIndex === pointIndex;
        const vertex = new THREE.Mesh(
          new THREE.SphereGeometry(selected ? EDITOR_VERTEX_RADIUS * 1.35 : EDITOR_VERTEX_RADIUS, 20, 14),
          new THREE.MeshBasicMaterial({
            color: selected ? '#ff8a00' : (area.outlineColor ?? '#ffffff'),
            depthTest: false,
            depthWrite: false,
          }),
        );
        vertex.position.copy(this.sphericalPosition(point.yaw, point.pitch, radius + 1));
        // Editor handles must stay visible above markers; only the actual
        // highlight fill/line belongs below marker content.
        vertex.renderOrder = EDITOR_VERTEX_RENDER_ORDER;
        vertex.userData.areaVertex = true;
        vertex.userData.areaVertexVisual = true;
        vertex.userData.areaId = area.id;
        vertex.userData.pointIndex = pointIndex;
        object.add(vertex);

        // A larger invisible hit target makes dragging comfortable without
        // visually turning the editor node into an oversized marker.
        const hitTarget = new THREE.Mesh(
          new THREE.SphereGeometry(EDITOR_VERTEX_HIT_RADIUS, 12, 8),
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
          }),
        );
        hitTarget.position.copy(vertex.position);
        hitTarget.userData.areaVertex = true;
        hitTarget.userData.areaId = area.id;
        hitTarget.userData.pointIndex = pointIndex;
        object.add(hitTarget);
      });
    }
    object.visible = this.preview;

    return {
      object,
      line,
      lineGeometry: outlineGeometry,
      fill,
      outline,
      outlineSegmentCount: Math.max(1, outlinePoints.length - 1),
      mode: area.mode ?? 'fill-outline',
      elapsedMs: 0,
      delayMs: Math.max(0, area.delayMs ?? 120),
      traceDurationMs: Math.max(250, area.durationMs ?? 1400),
      fillDurationMs: DEFAULT_FILL_DURATION_MS,
      maxOpacity,
    };
  }

  private unwrapYaw(points: AreaHighlightPoint[]): AreaHighlightPoint[] {
    const result: AreaHighlightPoint[] = [{ ...points[0]! }];
    for (let index = 1; index < points.length; index += 1) {
      let yaw = points[index]!.yaw;
      const previous = result[index - 1]!.yaw;
      while (yaw - previous > Math.PI) yaw -= Math.PI * 2;
      while (yaw - previous < -Math.PI) yaw += Math.PI * 2;
      result.push({ yaw, pitch: points[index]!.pitch });
    }
    return result;
  }

  private createOutlinePoints(points: AreaHighlightPoint[], radius: number, closed: boolean): THREE.Vector3[] {
    const result: THREE.Vector3[] = [];
    const edgeCount = closed ? points.length : Math.max(0, points.length - 1);
    for (let index = 0; index < edgeCount; index += 1) {
      const from = points[index]!;
      const to = points[(index + 1) % points.length]!;
      let targetYaw = to.yaw;
      while (targetYaw - from.yaw > Math.PI) targetYaw -= Math.PI * 2;
      while (targetYaw - from.yaw < -Math.PI) targetYaw += Math.PI * 2;
      const steps = Math.max(2, Math.ceil(Math.hypot(targetYaw - from.yaw, to.pitch - from.pitch) / 0.025));
      for (let step = 0; step < steps; step += 1) {
        const progress = step / steps;
        result.push(this.sphericalPosition(
          THREE.MathUtils.lerp(from.yaw, targetYaw, progress),
          THREE.MathUtils.lerp(from.pitch, to.pitch, progress),
          radius,
        ));
      }
    }
    if (closed && points.length > 0) {
      result.push(this.sphericalPosition(points[0]!.yaw, points[0]!.pitch, radius));
    }
    return result;
  }

  private sphericalPosition(yaw: number, pitch: number, radius: number): THREE.Vector3 {
    return new THREE.Vector3(
      -radius * Math.sin(yaw) * Math.cos(pitch),
      radius * Math.sin(pitch),
      -radius * Math.cos(yaw) * Math.cos(pitch),
    );
  }

  private bindVertexDragging(): void {
    const canvas = this.ctx.renderer.domElement;
    const updatePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(this.pointer, this.ctx.camera.camera);
    };
    const findVertexByScreenDistance = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const camera = this.ctx.camera.camera;
      camera.updateMatrixWorld(true);
      this.root.updateMatrixWorld(true);
      const world = new THREE.Vector3();
      const projected = new THREE.Vector3();
      let closest: THREE.Object3D | null = null;
      let closestDistance = 44;
      this.root.traverse((object) => {
        if (!object.userData.areaVertexVisual) return;
        object.getWorldPosition(world);
        projected.copy(world).project(camera);
        if (projected.z < -1 || projected.z > 1) return;
        const screenX = rect.left + (projected.x + 1) * rect.width * 0.5;
        const screenY = rect.top + (1 - projected.y) * rect.height * 0.5;
        const distance = Math.hypot(event.clientX - screenX, event.clientY - screenY);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = object;
        }
      });
      return closest;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!this.editingEnabled) return;
      updatePointer(event);
      const screenVertex = findVertexByScreenDistance(event);
      const hitObject = screenVertex ?? this.raycaster.intersectObjects(this.root.children, true)
        .find(intersection => intersection.object.userData.areaVertex)?.object;
      if (!hitObject) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.draggingVertex = {
        areaId: String(hitObject.userData.areaId),
        pointIndex: Number(hitObject.userData.pointIndex),
        pointerId: event.pointerId,
      };
      this.selectPoint(this.draggingVertex.areaId, this.draggingVertex.pointIndex);
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
      this.ctx.bus.emit('area:selected', { areaId: this.draggingVertex.areaId });
      this.ctx.bus.emit('area:point-selected', {
        areaId: this.draggingVertex.areaId,
        pointIndex: this.draggingVertex.pointIndex,
      });
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!this.draggingVertex || event.pointerId !== this.draggingVertex.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      updatePointer(event);
      const direction = this.raycaster.ray.direction.clone().normalize();
      direction.applyQuaternion(this.root.quaternion.clone().invert());
      const yaw = Math.atan2(-direction.x, -direction.z);
      const pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
      const area = this.currentAreas.find(item => item.id === this.draggingVertex!.areaId);
      const point = area?.points[this.draggingVertex.pointIndex];
      if (!area || !point) return;
      point.yaw = yaw;
      point.pitch = pitch;
      const rotation = this.root.rotation.y;
      const drag = { ...this.draggingVertex };
      this.setAreas(this.currentAreas, rotation);
      this.ctx.bus.emit('area:point-moved', {
        areaId: drag.areaId,
        pointIndex: drag.pointIndex,
        yaw,
        pitch,
      });
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!this.draggingVertex || event.pointerId !== this.draggingVertex.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.draggingVertex = null;
      canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerdown', onPointerDown, true);
    canvas.addEventListener('pointermove', onPointerMove, true);
    canvas.addEventListener('pointerup', onPointerUp, true);
    canvas.addEventListener('pointercancel', onPointerUp, true);
    this.pointerCleanups.push(
      () => canvas.removeEventListener('pointerdown', onPointerDown, true),
      () => canvas.removeEventListener('pointermove', onPointerMove, true),
      () => canvas.removeEventListener('pointerup', onPointerUp, true),
      () => canvas.removeEventListener('pointercancel', onPointerUp, true),
    );
  }

  private clear(): void {
    for (const visual of this.visuals) {
      visual.object.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      this.root.remove(visual.object);
    }
    this.visuals.length = 0;
  }
}
