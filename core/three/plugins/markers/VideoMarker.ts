import * as THREE from 'three';
import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { PlaneObject3DMarker } from './PlaneObject3DMarker';
import type { VideoMarker as VideoMarkerData } from '#view360/types/tour';

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 360;
/**
 * Desired world-unit width for the default video panel.
 * The DOM element is created at this size directly — NO CSS3DObject scaling.
 *
 * Previous approach used `cssObject.scale.setScalar(150/640)` which put a
 * scale factor into the CSS `matrix3d()` transform. Browsers cannot reliably
 * map pointer coordinates through a scaled matrix3d into iframe content,
 * making YouTube/Vimeo play buttons unclickable.
 *
 * By creating the element at the final display size (world-unit = CSS-pixel)
 * and keeping CSS3DObject scale = 1, the matrix3d only contains rotation and
 * translation — pointer mapping works correctly.
 */
const WORLD_WIDTH = 150;
const WORLD_HEIGHT = WORLD_WIDTH * (DEFAULT_HEIGHT / DEFAULT_WIDTH); // ~84.375
const cameraDirection = new THREE.Vector3();
const cameraToMarker = new THREE.Vector3();

interface VideoObjectData {
  element: HTMLVideoElement | HTMLIFrameElement;
  cssObject: CSS3DObject;
  baseScale: THREE.Vector3;
}

/**
 * Interactive CSS3D video anchored to a yaw/pitch inside the panorama.
 * Mirrors Photo Sphere Viewer's `elementLayer` approach: the media stays a
 * real DOM element while CSS3DRenderer applies the Three.js camera transform.
 */
export class VideoMarker extends PlaneObject3DMarker<VideoMarkerData> {
  readonly markerType = 'video' as const;
  protected readonly style = { color: '#dc2626', icon: '▶', label: 'Video' };

  private readonly objects = new Map<THREE.Group, VideoObjectData>();

  override createObject(marker: VideoMarkerData): THREE.Object3D {
    if (!marker.src.trim()) return super.createObject(marker);

    // Compute display dimensions in world units (= CSS pixels for CSS3DObject).
    // If the marker specifies custom width/height, scale proportionally
    // relative to the default 640×360 → WORLD_WIDTH×WORLD_HEIGHT mapping.
    const scale = WORLD_WIDTH / DEFAULT_WIDTH;
    // Bake X/Y resizing into the DOM dimensions rather than CSS3DObject.scale;
    // scaled iframe matrix3d transforms break pointer mapping in some browsers.
    const displayWidth = Math.max(1, Math.round((marker.width ?? DEFAULT_WIDTH) * scale * this.normalizeScale(marker.scaleX)));
    const displayHeight = Math.max(1, Math.round((marker.height ?? DEFAULT_HEIGHT) * scale * this.normalizeScale(marker.scaleY)));
    const media = this.createMediaElement(marker, displayWidth, displayHeight);

    const wrapper = document.createElement('div');
    wrapper.className = 'view360-video-marker';
    wrapper.style.width = `${displayWidth}px`;
    wrapper.style.height = `${displayHeight}px`;
    wrapper.style.background = '#000';
    wrapper.style.overflow = 'hidden';
    wrapper.style.borderRadius = '8px';
    wrapper.style.boxShadow = '0 12px 38px rgba(0,0,0,.42)';
    wrapper.style.pointerEvents = 'auto';
    wrapper.style.touchAction = 'auto';
    wrapper.style.userSelect = 'auto';

    // Do not add `backface-visibility: hidden` or `transform-style:
    // preserve-3d` here. The CSS3DObject itself already receives Three.js'
    // matrix3d transform; adding another 3D context around native media can
    // make browser/iframe controls visible but fail their pointer hit-test.

    // Keep media interaction inside the CSS3D object. In particular, a click
    // on native controls must not bubble to any viewer-level click/drag logic.
    const stopViewerInteraction = (event: Event) => event.stopPropagation();
    const interactiveEvents = ['pointerdown', 'pointerup', 'click', 'dblclick', 'touchstart', 'touchend', 'wheel'] as const;
    interactiveEvents.forEach((eventName) => {
      wrapper.addEventListener(eventName, stopViewerInteraction, { passive: eventName === 'wheel' });
    });

    const loading = document.createElement('div');
    loading.textContent = 'Đang tải video…';
    loading.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:#080808;color:#aaa;font:500 14px sans-serif;pointer-events:none';
    wrapper.style.position = 'relative';
    wrapper.appendChild(loading);
    wrapper.appendChild(media);
    media.addEventListener('load', () => loading.remove(), { once: true });
    media.addEventListener('loadeddata', () => loading.remove(), { once: true });
    media.addEventListener('error', () => {
      loading.textContent = 'Không thể tải video';
      loading.style.color = '#fca5a5';
    }, { once: true });

    const cssObject = new CSS3DObject(wrapper);
    // ⚠️  DO NOT scale the CSS3DObject!
    // Scaling embeds a scale factor into the CSS `matrix3d()` transform which
    // breaks pointer-coordinate mapping inside iframes (YouTube play button
    // becomes unclickable). The element is already sized at display dimensions.

    // Invisible WebGL plane gives MarkerPlugin a raycast/drag target while the
    // visible and interactive content is rendered by CSS3DRenderer.
    const hitArea = new THREE.Mesh(
      new THREE.PlaneGeometry(displayWidth, displayHeight),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hitArea.userData = { marker, markerType: this };

    const group = new THREE.Group();
    group.add(cssObject, hitArea);
    group.userData = { marker, markerType: this, isCss3dVideo: true };
    group.renderOrder = 998;
    this.repositionObject(group, marker.yaw, marker.pitch);
    this.objects.set(group, {
      element: media,
      cssObject,
      baseScale: new THREE.Vector3(1, 1, 1),
    });
    return group;
  }

  override updateObject(
    object: THREE.Object3D,
    delta: number,
    hovered: boolean,
    pulse: number,
    hoverScale: number,
    camera: THREE.Camera,
  ): void {
    if (!(object instanceof THREE.Group) || !this.objects.has(object)) {
      super.updateObject(object, delta, hovered, pulse, hoverScale, camera);
      return;
    }

    const data = this.objects.get(object)!;
    const marker = object.userData.marker as VideoMarkerData;
    this.applyHoverScale(object, data.baseScale, marker, hovered, hoverScale);

    // CSS3DRenderer also renders objects behind the camera. PSV explicitly
    // hides them; apply the same front-facing test here.
    camera.getWorldDirection(cameraDirection);
    cameraToMarker.copy(object.position).sub(camera.position).normalize();
    object.visible = cameraDirection.dot(cameraToMarker) > 0;
  }

  override repositionObject(object: THREE.Object3D, yaw: number, pitch: number): void {
    if (object.userData.isCss3dVideo) super.repositionObject(object, yaw, pitch);
    else this.positionOnSphere(object, yaw, pitch);
  }

  protected override getRotation(marker: VideoMarkerData): THREE.Euler {
    return new THREE.Euler(
      marker.rotX ?? 0,
      marker.rotY ?? (marker.rotationYaw ? -marker.rotationYaw : 0),
      marker.rotZ ?? 0,
      'ZXY',
    );
  }

  /** Video scale is baked into DOM dimensions to preserve iframe controls. */
  protected override getScale(_marker: VideoMarkerData): THREE.Vector3 {
    return new THREE.Vector3(1, 1, 1);
  }

  override disposeObject(object: THREE.Object3D): void {
    if (!(object instanceof THREE.Group)) {
      super.disposeObject(object);
      return;
    }
    const data = this.objects.get(object);
    if (!data) return;

    if (data.element instanceof HTMLVideoElement) {
      data.element.pause();
      data.element.removeAttribute('src');
      data.element.load();
    } else {
      data.element.src = 'about:blank';
    }
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    data.cssObject.element.remove();
    this.objects.delete(object);
  }

  private createMediaElement(
    marker: VideoMarkerData,
    width: number,
    height: number,
  ): HTMLVideoElement | HTMLIFrameElement {
    if (this.isDirectVideo(marker.src)) {
      const video = document.createElement('video');
      video.src = marker.src;
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.tabIndex = 0;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.display = 'block';
      video.style.pointerEvents = 'auto';
      video.style.touchAction = 'auto';
      return video;
    }

    const iframe = document.createElement('iframe');
    iframe.src = this.toEmbedUrl(marker.src);
    iframe.width = String(width);
    iframe.height = String(height);
    iframe.title = marker.label || 'Video';
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.tabIndex = 0;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.display = 'block';
    iframe.style.border = '0';
    iframe.style.pointerEvents = 'auto';
    iframe.style.touchAction = 'auto';
    return iframe;
  }

  private isDirectVideo(src: string): boolean {
    return /\.(mp4|webm|ogg)(?:[?#].*)?$/i.test(src.trim());
  }

  private toEmbedUrl(src: string): string {
    const youtube = src.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/))([^?&/]+)/i);
    if (youtube) {
      const origin = typeof window !== 'undefined' && /^https?:/.test(window.location.origin)
        ? `&origin=${encodeURIComponent(window.location.origin)}`
        : '';
      return `https://www.youtube.com/embed/${youtube[1]}?feature=oembed&playsinline=1&rel=0${origin}`;
    }
    const vimeo = src.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
    return src;
  }
}
