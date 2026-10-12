import * as THREE from 'three';
import { NavigationMarker } from './NavigationMarker';
import type { NavigationMarker as NavigationMarkerData, TourMarker } from '#view360/types/tour';

/** Navigation dạng mũi tên: title đứng yên, riêng icon lặp chuyển động theo local Z. */
export class ArrowNavigationMarker extends NavigationMarker {
  protected override readonly canvasWidth = 256;
  protected override readonly canvasHeight = 256;
  protected override readonly defaultIconWidth = 62;
  protected override readonly defaultIconHeight = 65;
  protected override readonly titleFontSize = 124;
  protected readonly titleOffsetY: number = 70;
  /** Tọa độ neo của icon trong không gian local của marker. */
  protected readonly arrowAnchor = new THREE.Vector3(0, 0, 0);
  /** Quy đổi khoảng cách dọc giữa hai neo sang quãng chạy theo chiều sâu. */
  protected readonly depthTravelPerVerticalUnit: number = 0.22;

  constructor(showLeaderLine = true) { super('arrow', showLeaderLine); }

  override createObject(marker: NavigationMarkerData): THREE.Object3D {
    const icon = super.createObject(marker);
    if (!(icon instanceof THREE.Mesh)) return icon;

    const title = icon.children.find(child => child.userData.navigationTitle);
    if (title) icon.remove(title);

    // Group giữ tọa độ panorama. Icon và title là hai object ngang hàng để
    // animation của icon không thể làm thay đổi transform của title.
    const group = new THREE.Group();
    group.position.copy(icon.position);
    group.quaternion.copy(icon.quaternion);
    group.userData = { ...icon.userData, arrowIcon: icon, navigationTitle: title };

    icon.position.copy(this.arrowAnchor);
    icon.quaternion.identity();
    group.add(icon);
    if (title) group.add(title);

    const titleAnchor = title?.userData.fixedLocalPosition;
    if (titleAnchor instanceof THREE.Vector3) {
      const verticalDistance = Math.max(0, titleAnchor.y - this.arrowAnchor.y);
      group.userData.animationAmplitude = verticalDistance * this.depthTravelPerVerticalUnit;
    } else {
      group.userData.animationAmplitude = 0;
    }

    return group;
  }

  protected override getScale(marker: NavigationMarkerData): THREE.Vector3 {
    return new THREE.Vector3(
      this.normalizeScale(marker.scaleX ?? 1.6),
      this.normalizeScale(marker.scaleY ?? 1),
      1,
    );
  }

  protected override drawIcon(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    _color: string,
    _time: number,
    hovered: boolean,
  ): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.lineWidth = hovered ? 42 : 40;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fff';
    ctx.shadowColor = hovered ? 'rgba(220,240,255,.95)' : 'rgba(220,240,255,.78)';
    ctx.shadowBlur = hovered ? 22 : 17;
    ctx.beginPath();
    ctx.moveTo(37, 173);
    ctx.lineTo(128, 106);
    ctx.lineTo(219, 173);
    ctx.stroke();
    ctx.restore();
  }

  protected override createTitleObject(
    marker: NavigationMarkerData,
    label: string,
    labelFont: string,
    _iconWidth: number,
    iconHeight: number,
  ): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 220;
    const context = canvas.getContext('2d')!;
    const titleText = label.trim() || 'Điểm đến';
    context.font = `700 ${this.titleFontSize}px ${labelFont}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(0,0,0,.82)';
    context.shadowBlur = 10;
    context.fillStyle = '#fff';
    context.fillText(titleText, canvas.width / 2, canvas.height / 2, canvas.width - 40);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const scale = this.getScale(marker);
    const displayHeight = 28;
    const displayWidth = displayHeight * canvas.width / canvas.height;
    const title = new THREE.Mesh(
      new THREE.PlaneGeometry(displayWidth / scale.x, displayHeight / scale.y),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        side: THREE.DoubleSide,
        opacity: 0,
      }),
    );
    const titleAnchor = new THREE.Vector3(
      this.arrowAnchor.x,
      this.arrowAnchor.y + iconHeight / 2 + this.titleOffsetY / scale.y,
      1,
    );
    title.position.copy(titleAnchor);
    title.renderOrder = 1000;
    title.userData.navigationTitle = true;
    // Lưu riêng tọa độ neo để animation của arrow không làm trôi title.
    title.userData.fixedLocalPosition = titleAnchor.clone();
    title.raycast = () => {};
    return title;
  }

  override updateObject(
    object: THREE.Object3D,
    delta: number,
    hovered: boolean,
    _pulse: number,
    hoverScale: number,
    camera: THREE.Camera,
  ): void {
    const icon = object.userData.arrowIcon;
    if (!(icon instanceof THREE.Mesh)) return;
    const data = this.meshes.get(icon);
    if (!data) return;

    data.time += delta;
    const marker = object.userData.marker as NavigationMarkerData;
    this.drawIcon(data.context, data.canvas, this.resolveColor(marker), data.time, hovered);
    data.texture.needsUpdate = true;
    // updateProjection nhân scale của group, vì vậy reset trước mỗi frame.
    object.scale.set(1, 1, 1);
    this.applyHoverScale(icon, new THREE.Vector3(1, 1, 1), marker, false, hoverScale);

    const rootOpacity = (icon.material as THREE.MeshBasicMaterial).opacity;
    const title = object.userData.navigationTitle;
    if (title instanceof THREE.Mesh) {
      (title.material as THREE.MeshBasicMaterial).opacity = rootOpacity;
      // Chỉ quaternion thay đổi để mặt chữ song song camera; position không đổi.
      this.faceCamera(title, camera);
    }

    const loopProgress = (data.time * 0.72) % 1;
    const zProgress = loopProgress * loopProgress * (3 - 2 * loopProgress);
    const animationAmplitude = Number(object.userData.animationAmplitude) || 0;
    const zDistance = zProgress * animationAmplitude;
    // Group nhìn vào tâm panorama nên local +Z hướng về phía camera.
    // Dùng -Z để mũi tên trượt ra xa người xem.
    icon.position.copy(this.arrowAnchor);
    icon.position.z -= zDistance;
    icon.quaternion.identity();
  }

  override disposeObject(object: THREE.Object3D): void {
    const icon = object.userData.arrowIcon;
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = child.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
      child.geometry.dispose();
    });
    if (icon instanceof THREE.Mesh) this.meshes.delete(icon);
  }

  override supports(marker: TourMarker): marker is NavigationMarkerData {
    return marker.plugin === 'navigation'
      && !['local', 'drone', 'location-1', 'location-2', 'pin', 'pin-top', 'anchor'].includes(marker.icon ?? 'arrow');
  }
}
