import * as THREE from 'three';
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { PluginBase } from './PluginBase';
import { NavigationMarker } from './markers/NavigationMarker';
import { ArrowNavigationMarker } from './markers/ArrowNavigationMarker';
import { LocalNavigationMarker } from './markers/LocalNavigationMarker';
import { DroneNavigationMarker } from './markers/DroneNavigationMarker';
import { VideoMarker } from './markers/VideoMarker';
import type { MarkerBase } from './markers/MarkerBase';
import { PanelMarker } from './markers/PanelMarker';
import type { TourMarker, TourScene } from '#view360/types/tour';

export interface MarkerPluginOptions {
  pulseSpeed?: number;
  pulseAmplitude?: number;
  hoverScale?: number;
  /** Enable drag-to-reposition markers in the designer. */
  draggable?: boolean;
  /** Replace or extend the marker types managed by this plugin. */
  markerTypes?: MarkerBase[];
}

/** Engine plugin that manages all registered MarkerBase implementations. */
export class MarkerPlugin extends PluginBase {
  readonly id: string = 'marker';
  readonly name: string = 'Marker Plugin';

  protected readonly group = new THREE.Group();
  /** Pre-created container passed to CSS3DRenderer to avoid its internal
   *  viewElement which hard-codes `pointer-events: none` and blocks iframe
   *  interaction. Mirrors PSV's CSS3DContainer pattern. */
  protected readonly cssContainer = document.createElement('div');
  protected readonly cssRenderer = new CSS3DRenderer({ element: this.cssContainer });
  protected readonly raycaster = new THREE.Raycaster();
  protected readonly pointer = new THREE.Vector2();
  /** Registered MarkerBase implementations, indexed by the YAML discriminator. */
  protected readonly markerTypes = new Map<TourMarker['plugin'], MarkerBase>();
  protected readonly unsubs: Array<() => void> = [];
  private hovered: THREE.Object3D | null = null;
  private draggingObject: THREE.Object3D | null = null;
  private dragStarted = false;
  private pointerDown = { x: 0, y: 0 };
  private navigationPending = false;

  private readonly pulseSpeed: number;
  private readonly pulseAmplitude: number;
  private readonly hoverScale: number;
  private readonly draggable: boolean;

  constructor(options: MarkerPluginOptions = {}) {
    super();
    this.pulseSpeed = options.pulseSpeed ?? 0.004;
    this.pulseAmplitude = options.pulseAmplitude ?? 0.06;
    this.hoverScale = options.hoverScale ?? 1.15;
    this.draggable = options.draggable ?? false;

    const panelMarker = new PanelMarker();
    const builtIns: MarkerBase[] = [
      // View và Admin dùng cùng một hình thức hiển thị để thiết kế WYSIWYG.
      // Title không raycast nên vẫn không cản thao tác chọn/kéo chính icon.
      new NavigationMarker(undefined, true, [
        new ArrowNavigationMarker(true),
        new LocalNavigationMarker(true),
        new DroneNavigationMarker(true),
      ]),
      panelMarker,
      new VideoMarker(),
    ];
    builtIns.forEach((markerType) => {
      this.registerMarkerType(markerType);
    });
    // Legacy discriminators are aliases of the same composite PanelMarker.
    (['info', 'audio', 'model3d', 'ai-chat'] as const).forEach((legacyType) => {
      this.markerTypes.set(legacyType, panelMarker);
    });
    (options.markerTypes ?? []).forEach((markerType) => {
      this.registerMarkerType(markerType);
    });
  }

  protected override onInit(): void {
    // The container is already the CSS3DRenderer's domElement (we passed it
    // via `{ element }` in the constructor). Style it as an overlay.
    const cssElement = this.cssContainer;
    cssElement.style.position = 'absolute';
    cssElement.style.inset = '0';
    cssElement.style.overflow = 'hidden';
    cssElement.style.pointerEvents = 'none';
    cssElement.style.zIndex = '2';

    // CSS3DRenderer v0.186 creates an internal viewElement with hard-coded
    // `pointer-events: none`. Combined with the parent's `pointer-events: none`
    // and `transform-style: preserve-3d` on the cameraElement, this double-none
    // chain prevents browser hit-testing from reaching CSS3DObject children
    // (even if they set `pointer-events: auto`).
    //
    // Fix: set viewElement to `pointer-events: inherit` — it still inherits
    // `none` from the parent, but avoids the explicit re-declaration that can
    // confuse browser hit-test in 3D transform contexts. The CSS3DObject
    // elements themselves opt in with `pointer-events: auto` per CSS spec.
    const viewElement = cssElement.children[0] as HTMLElement | undefined;
    if (viewElement) {
      viewElement.style.pointerEvents = 'inherit';
    }

    this.ctx.container.appendChild(cssElement);
    this.ctx.scene.add(this.group);
    this.unsubs.push(this.ctx.bus.on('scene:rotation', ({ rotation }) => {
      this.applySceneRotation(rotation);
    }));
    this.unsubs.push(this.ctx.bus.on('scene:roll', ({ roll }) => {
      this.applySceneRoll(roll);
    }));
    this.bindPointerEvents();
  }

  protected override onUpdate(delta: number): void {
    const pulse = 1 + Math.sin(performance.now() * this.pulseSpeed) * this.pulseAmplitude;
    this.group.children.forEach((object) => {
      const markerType = this.markerTypeForObject(object);
      markerType?.updateObject(
        object,
        delta,
        object === this.hovered,
        pulse,
        this.hoverScale,
        this.ctx.camera.camera,
      );
      markerType?.updateProjection(object, this.ctx.camera.camera);
    });
    const width = this.ctx.container.clientWidth;
    const height = this.ctx.container.clientHeight;
    const size = this.cssRenderer.getSize();
    if (size.width !== width || size.height !== height) {
      this.cssRenderer.setSize(width, height);
    }
    this.cssRenderer.render(this.ctx.scene, this.ctx.camera.camera);
    this.panelMarkerTypes().forEach((markerType) => markerType.updatePanels(this.ctx.camera.camera));
  }

  protected override onDestroy(): void {
    this.unsubs.forEach((unsubscribe) => unsubscribe());
    this.clearMarkers();
    this.ctx.scene.remove(this.group);
    this.closeAllPanels();
    this.cssRenderer.domElement.remove();
  }

  override onSceneLoad(_scene: TourScene): void {
    this.fadeAll(0, 200);
  }

  override onSceneReady(scene: TourScene): void {
    this.clearMarkers();
    // Markers are authored in panorama-local yaw/pitch. Rotate their common
    // parent with the image so they remain attached to the same visual spots.
    this.applySceneRotation(scene.panoramaRotation ?? 0);
    this.applySceneRoll(scene.panoramaRoll ?? 0);
    for (const marker of scene.markers ?? []) {
      const markerType = this.markerTypes.get(marker.plugin);
      if (!markerType?.supports(marker)) {
        console.warn(`[MarkerPlugin] No MarkerBase registered for type "${marker.plugin}".`);
        continue;
      }
      this.group.add(markerType.createObject(marker));
    }
    this.fadeAll(1, 350);
  }

  private markerTypeForObject(object: THREE.Object3D): MarkerBase | undefined {
    return object.userData.markerType as MarkerBase | undefined;
  }

  private setPointer(event: MouseEvent | PointerEvent): void {
    const rect = this.ctx.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private hitTest(event: MouseEvent | PointerEvent): THREE.Object3D | null {
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.ctx.camera.camera);
    const hit = this.raycaster.intersectObjects(this.group.children, true)[0]?.object ?? null;
    if (!hit) return null;
    let root = hit;
    while (root.parent && root.parent !== this.group) root = root.parent;
    return root.parent === this.group ? root : null;
  }

  private bindPointerEvents(): void {
    const element = this.ctx.renderer.domElement;
    const setHovered = (hit: THREE.Object3D | null) => {
      if (hit === this.hovered) return;
      this.hovered = hit;
      this.ctx.container.style.cursor = hit ? (this.draggable ? 'grab' : 'pointer') : 'grab';
      this.ctx.bus.emit('marker:hover', {
        marker: (hit?.userData.marker as TourMarker | undefined) ?? null,
      });
    };
    const onPointerMove = (event: PointerEvent) => {
      if (this.draggingObject) return;
      setHovered(this.hitTest(event));
    };
    const onPointerLeave = () => setHovered(null);
    const onClick = async (event: MouseEvent) => {
      if (this.draggingObject || this.dragStarted) return;
      const object = this.hitTest(event);
      const marker = object?.userData.marker as TourMarker | undefined;
      if (!marker || !object) {
        // Clicking empty panorama must not dismiss a panel. Panels close only
        // when toggled from their marker, replaced, or camera motion begins.
        return;
      }
      if (this.navigationPending) return;
      this.ctx.bus.emit('marker:click', { marker });
      if (marker.plugin === 'navigation' && marker.targetScene) {
        this.closeAllPanels();
        this.navigationPending = true;
        this.ctx.bus.emit('interaction:lock');
        try {
          // Khởi động animation marker nhưng không chờ nó kết thúc. Việc tải
          // texture và transition panorama bắt đầu ngay trong cùng frame.
          const markerAnimation = this.markerTypeForObject(object)
            ?.playActivationAnimation(object) ?? Promise.resolve();
          // Marker coordinates are panorama-local. Convert yaw to the canonical
          // world/map direction before handing it to the transition engine.
          this.ctx.bus.emit('navigate', {
            sceneId: marker.targetScene,
            yaw: marker.yaw + this.group.rotation.y,
            pitch: marker.pitch,
          });
          await markerAnimation;
        } finally {
          this.navigationPending = false;
          this.ctx.bus.emit('interaction:unlock');
        }
      } else {
        this.openPanel(marker, object);
      }
    };
    element.addEventListener('pointermove', onPointerMove, { passive: true });
    element.addEventListener('pointerleave', onPointerLeave);
    element.addEventListener('click', onClick);
    this.unsubs.push(
      () => element.removeEventListener('pointermove', onPointerMove),
      () => element.removeEventListener('pointerleave', onPointerLeave),
      () => element.removeEventListener('click', onClick),
    );
    if (this.draggable) this.bindDragEvents();
  }

  protected openPanel(marker: TourMarker, object: THREE.Object3D): void {
    const markerType = this.markerTypes.get(marker.plugin);
    if (!(markerType instanceof PanelMarker)) return;
    markerType.togglePanel(
      marker,
      object,
      this.ctx.container,
      this.ctx.camera.camera,
    );
  }

  protected panelMarkerTypes(): PanelMarker[] {
    return [...new Set(this.markerTypes.values())].filter(
      (markerType): markerType is PanelMarker => markerType instanceof PanelMarker,
    );
  }

  protected closeAllPanels(): void {
    this.panelMarkerTypes().forEach((markerType) => markerType.hideAllPanels());
  }

  /** Register a marker type — subclasses use this to add custom marker types. */
  protected registerMarkerType(markerType: MarkerBase): void {
    this.markerTypes.set(markerType.markerType, markerType);
  }

  /** One transform for every current and future MarkerBase implementation. */
  private applySceneRotation(rotation: number): void {
    this.group.rotation.y = rotation;
    // PanelMarker projects anchors into DOM coordinates before WebGL render in
    // the engine loop, so ensure its world matrix reflects the new rotation in
    // this same frame rather than one frame later.
    this.group.updateMatrixWorld(true);
  }

  private applySceneRoll(roll: number): void {
    this.group.rotation.z = -roll;
    this.group.updateMatrixWorld(true);
  }

  /** Add a marker object to the group — subclasses use this for programmatic markers. */
  protected addMarkerObject(object: THREE.Object3D): void {
    this.group.add(object);
  }

  private bindDragEvents(): void {
    const element = this.ctx.renderer.domElement;
    const onPointerDown = (event: PointerEvent) => {
      const hit = this.hitTest(event);
      if (!hit) return;
      this.draggingObject = hit;
      this.pointerDown = { x: event.clientX, y: event.clientY };
      this.dragStarted = false;
      element.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!this.draggingObject) return;
      const distance = Math.hypot(
        event.clientX - this.pointerDown.x,
        event.clientY - this.pointerDown.y,
      );
      if (!this.dragStarted && distance > 4) {
        this.dragStarted = true;
        this.ctx.bus.emit('interaction:lock');
        this.ctx.container.style.cursor = 'grabbing';
      }
      if (!this.dragStarted) return;

      this.setPointer(event);
      this.raycaster.setFromCamera(this.pointer, this.ctx.camera.camera);
      const direction = this.raycaster.ray.direction.clone().normalize();
      // Marker yaw is stored in panorama-local coordinates. Convert the
      // world-space ray back through the scene rotation before persisting it.
      direction.applyQuaternion(this.group.quaternion.clone().invert());
      const yaw = Math.atan2(-direction.x, -direction.z);
      const pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
      this.markerTypeForObject(this.draggingObject)?.repositionObject(this.draggingObject, yaw, pitch);
      this.draggingObject.userData.dragYaw = yaw;
      this.draggingObject.userData.dragPitch = pitch;
    };
    const onPointerUp = () => {
      const object = this.draggingObject;
      if (!object) return;
      if (this.dragStarted) {
        const marker = object.userData.marker as TourMarker | undefined;
        const yaw = object.userData.dragYaw as number | undefined;
        const pitch = object.userData.dragPitch as number | undefined;
        if (marker && yaw !== undefined && pitch !== undefined) {
          this.ctx.bus.emit('marker:moved', {
            markerId: marker.id,
            yaw: +yaw.toFixed(4),
            pitch: +pitch.toFixed(4),
          });
        }
        this.ctx.bus.emit('interaction:unlock');
        this.ctx.container.style.cursor = 'grab';
      }
      this.draggingObject = null;
      // Keep dragStarted true until the browser's following click event is handled.
      requestAnimationFrame(() => { this.dragStarted = false; });
    };
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
    this.unsubs.push(
      () => element.removeEventListener('pointerdown', onPointerDown),
      () => element.removeEventListener('pointermove', onPointerMove),
      () => element.removeEventListener('pointerup', onPointerUp),
      () => element.removeEventListener('pointercancel', onPointerUp),
    );
  }

  protected fadeAll(target: number, duration: number): void {
    const start = performance.now();
    const initial = this.group.children.map((object) => this.materialOf(object)?.opacity ?? 0);
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      this.group.children.forEach((object, index) => {
        const material = this.materialOf(object);
        if (material) material.opacity = (initial[index] ?? 0) + (target - (initial[index] ?? 0)) * progress;
      });
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  protected materialOf(object: THREE.Object3D): THREE.SpriteMaterial | THREE.MeshBasicMaterial | null {
    if (object instanceof THREE.Sprite) return object.material;
    if (object instanceof THREE.Mesh) return object.material as THREE.MeshBasicMaterial;
    // Một marker có thể là Group gồm nhiều object độc lập (ví dụ arrow + title).
    // Fade theo material tương tác chính; marker tự đồng bộ opacity cho phần phụ.
    for (const child of object.children) {
      const material = this.materialOf(child);
      if (material) return material;
    }
    return null;
  }

  protected clearMarkers(): void {
    this.closeAllPanels();
    while (this.group.children.length) {
      const object = this.group.children[0];
      this.group.remove(object);
      this.markerTypeForObject(object)?.disposeObject(object);
    }
    this.hovered = null;
    this.draggingObject = null;
  }
}
