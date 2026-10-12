import type { Camera } from 'three';
import type { Map as LeafletMap, Marker } from 'leaflet';
import type { IMapStrategy, MapConfig, MapNode } from './IMapStrategy';

/** Real-world viewer map. Leaflet is imported lazily to remain SSR-safe. */
export class LeafletMapStrategy implements IMapStrategy {
  private map: LeafletMap | null = null;
  private leaflet: typeof import('leaflet') | null = null;
  private markers = new Map<string, Marker>();
  private nodes = new Map<string, MapNode>();
  private currentNodeId: string | null = null;
  private headingYaw = 0;
  private container: HTMLElement | null = null;
  onNodeClick?: (nodeId: string) => void;
  onFloorChange?: (floorId: string) => void;

  async init(config: MapConfig, container: HTMLElement): Promise<void> {
    this.container = container;
    this.leaflet = await import('leaflet');
    const geoNodes = config.floors.flatMap(floor => floor.nodes)
      .filter(node => Number.isFinite(node.latitude) && Number.isFinite(node.longitude));
    geoNodes.forEach(node => this.nodes.set(node.id, node));
    const center: [number, number] = geoNodes.length ? [geoNodes[0].latitude!, geoNodes[0].longitude!] : [16.0544, 108.2022];
    this.map = this.leaflet.map(container, { center, zoom: 18, minZoom: 3, maxZoom: 22, zoomControl: true });

    const satellite = this.leaflet.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Imagery &copy; Esri', maxNativeZoom: 19, maxZoom: 22,
    }).addTo(this.map);
    const streets = this.leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxNativeZoom: 19, maxZoom: 22,
    });
    const labels = this.leaflet.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri', maxNativeZoom: 19, maxZoom: 22,
    }).addTo(this.map);
    this.leaflet.control.layers({ 'Vệ tinh': satellite, 'Đường phố': streets }, { 'Tên địa điểm': labels }, { position: 'topright' }).addTo(this.map);

    const bounds: [number, number][] = [];
    for (const node of geoNodes) {
      const point: [number, number] = [node.latitude!, node.longitude!];
      if (node.visible === true) bounds.push(point);
      const marker = this.leaflet.marker(point, { icon: this.makeIcon(node.id) }).addTo(this.map);
      marker.bindTooltip(node.name, { direction: 'top', offset: [0, -15] });
      marker.on('click', () => this.onNodeClick?.(node.id));
      this.markers.set(node.id, marker);
    }
    this.refreshIcons();
    if (bounds.length > 1) this.map.fitBounds(bounds, { padding: [35, 35], maxZoom: 20 });
    requestAnimationFrame(() => this.map?.invalidateSize());
  }

  update(_dt: number, _camera?: Camera): void {}
  setCurrentNode(nodeId: string): void {
    this.currentNodeId = nodeId;
    this.refreshIcons();
    const node = this.nodes.get(nodeId);
    if (node && this.map) this.map.panTo([node.latitude!, node.longitude!], { animate: true });
  }
  setCameraHeading(yaw: number, _pitch: number, _fov?: number): void {
    // Three.js camera convention in this viewer:
    //   yaw = 0 looks toward -Z (map north)
    //   positive yaw turns toward -X (counter-clockwise on a north-up map)
    // CSS rotate() uses the opposite sign (positive = clockwise), therefore
    // negate yaw at this rendering boundary so the map arrow follows camera.
    this.headingYaw = -yaw;
    if (this.currentNodeId) this.markers.get(this.currentNodeId)?.setIcon(this.makeIcon(this.currentNodeId));
  }
  setFloor(_floorId: string): void {}
  setVisible(visible: boolean): void {
    if (this.container) this.container.style.display = visible ? 'block' : 'none';
    if (visible) requestAnimationFrame(() => this.map?.invalidateSize());
  }
  resize(_width: number, _height: number): void { this.map?.invalidateSize(); }
  dispose(): void {
    this.markers.clear(); this.nodes.clear(); this.map?.remove();
    this.map = null; this.leaflet = null; this.container = null;
  }
  private refreshIcons(): void {
    for (const [id, marker] of this.markers) {
      marker.setIcon(this.makeIcon(id));
      const shown = id === this.currentNodeId || this.nodes.get(id)?.visible === true;
      marker.setOpacity(shown ? 1 : 0);
      const element = marker.getElement();
      if (element) element.style.pointerEvents = shown ? 'auto' : 'none';
    }
  }
  private makeIcon(nodeId: string) {
    if (!this.leaflet) throw new Error('Leaflet chưa được khởi tạo.');
    const active = nodeId === this.currentNodeId;
    const arrow = active ? `<span class="v360-map-heading" style="transform:translateX(-50%) rotate(${this.headingYaw}rad)"></span>` : '';
    return this.leaflet.divIcon({
      className: 'v360-map-marker-wrap',
      html: `<span class="v360-map-dot${active ? ' is-active' : ''}"></span>${arrow}`,
      iconSize: active ? [34, 42] : [24, 24], iconAnchor: active ? [17, 21] : [12, 12],
    });
  }
}
