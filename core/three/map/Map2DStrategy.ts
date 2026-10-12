/**
 * ─────────────────────────────────────────────────────────────────
 * Map2DStrategy — Canvas-based 2D floorplan map with multi-floor
 *
 * Renders:
 *   - Floor tabs at top
 *   - Floorplan background image
 *   - Connection lines between nodes
 *   - Node dots (current = amber, others = white)
 *   - Camera heading arrow on current node
 *   - Hover tooltips
 *   - Exit links (dashed lines to cross-floor nodes)
 * ─────────────────────────────────────────────────────────────────
 */

import type { Camera } from 'three';
import type { IMapStrategy, MapConfig, MapFloor, MapNode } from './IMapStrategy';

// ── Constants ────────────────────────────────────────────────────

const TAB_HEIGHT = 32;
const NODE_RADIUS = 6;
const NODE_RADIUS_CURRENT = 9;
const ARROW_LENGTH = 20;
const TOOLTIP_FONT = '600 11px "Be Vietnam Pro", sans-serif';
const TAB_FONT = '600 11px "Be Vietnam Pro", sans-serif';
const COLORS = {
  bg: '#14151f',
  tabBg: 'rgba(255,255,255,0.06)',
  tabActive: 'rgba(59,130,246,0.25)',
  tabBorder: 'rgba(59,130,246,0.6)',
  tabText: 'rgba(255,255,255,0.5)',
  tabTextActive: '#93c5fd',
  node: 'rgba(255,255,255,0.65)',
  nodeHover: '#fff',
  nodeCurrent: '#f59e0b',
  nodeCurrentBorder: '#fff',
  connection: 'rgba(255,255,255,0.18)',
  connectionExit: 'rgba(59,130,246,0.35)',
  arrow: 'rgba(245,158,11,0.85)',
  tooltipBg: 'rgba(10,10,20,0.88)',
  tooltipText: '#fff',
  tooltipBorder: 'rgba(255,255,255,0.15)',
};

export class Map2DStrategy implements IMapStrategy {
  private canvas!: HTMLCanvasElement;
  private ctx2d!: CanvasRenderingContext2D;
  private config!: MapConfig;
  private currentFloorId: string | null = null;
  private currentNodeId: string | null = null;
  private hoveredNodeId: string | null = null;
  private heading = { yaw: 0, pitch: 0, fov: 75 };
  private images = new Map<string, HTMLImageElement>();
  private dpr = 1;
  private displayW = 0;
  private displayH = 0;

  onNodeClick?: (nodeId: string) => void;
  onFloorChange?: (floorId: string) => void;

  // ── Init ──────────────────────────────────────────────────────

  async init(config: MapConfig, container: HTMLElement): Promise<void> {
    this.config = config;
    this.dpr = Math.min(window.devicePixelRatio, 2);

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:default';
    this.ctx2d = this.canvas.getContext('2d')!;
    container.appendChild(this.canvas);

    // Set initial floor
    this.currentFloorId = config.defaultFloorId ?? config.floors[0]?.id ?? null;

    // Load all floor images in parallel
    await Promise.all(
      config.floors.map((floor) => this.loadImage(floor.id, floor.imageUrl)),
    );

    // Bind events
    this.canvas.addEventListener('click', this.handleClick);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave);

    this.resize(container.clientWidth, container.clientHeight);
  }

  // ── API ───────────────────────────────────────────────────────

  update(_dt: number, _camera?: Camera): void {
    this.draw();
  }

  setCurrentNode(nodeId: string): void {
    this.currentNodeId = nodeId;
    // Auto-switch floor if needed
    if (this.config.autoSwitchFloor !== false) {
      const floor = this.findFloorForNode(nodeId);
      if (floor && floor.id !== this.currentFloorId) {
        this.currentFloorId = floor.id;
        this.onFloorChange?.(floor.id);
      }
    }
    this.draw();
  }

  setCameraHeading(yaw: number, pitch: number, fov?: number): void {
    this.heading = { yaw, pitch, fov: fov ?? 75 };
    this.draw();
  }

  setFloor(floorId: string): void {
    if (this.config.floors.some((f) => f.id === floorId)) {
      this.currentFloorId = floorId;
      this.draw();
    }
  }

  setVisible(visible: boolean): void {
    this.canvas.style.display = visible ? 'block' : 'none';
  }

  resize(width: number, height: number): void {
    this.displayW = width;
    this.displayH = height;
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.draw();
  }

  dispose(): void {
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    this.canvas.remove();
  }

  // ── Drawing ───────────────────────────────────────────────────

  private draw(): void {
    const ctx = this.ctx2d;
    const w = this.displayW;
    const h = this.displayH;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    const showTabs = this.config.showFloorTabs !== false && this.config.floors.length > 1;
    const tabH = showTabs ? TAB_HEIGHT : 0;
    const mapY = tabH;
    const mapH = h - tabH;

    // Floor tabs
    if (showTabs) this.drawTabs(ctx, w);

    // Current floor
    const floor = this.currentFloor();
    if (!floor) return;

    // Clip to map area
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, mapY, w, mapH);
    ctx.clip();

    // Floor image or grid pattern fallback
    const img = this.images.get(floor.id);
    const mapRect = this.contentRect(floor, w, mapH, mapY, img);
    if (img?.complete && img.naturalWidth > 0) {
      ctx.globalAlpha = 0.82;
      ctx.drawImage(img, mapRect.x, mapRect.y, mapRect.width, mapRect.height);
      ctx.globalAlpha = 1;
    } else {
      // No image → draw dot grid pattern
      this.drawGridPattern(ctx, w, mapH, mapY);
    }

    // Connections
    if (this.config.showConnections !== false) {
      this.drawConnections(ctx, floor, w, mapH, mapY);
    }

    // Nodes
    this.drawNodes(ctx, floor, w, mapH, mapY);

    // Camera arrow
    if (this.config.showCameraArrow !== false && this.currentNodeId) {
      this.drawCameraArrow(ctx, floor, w, mapH, mapY);
    }

    // Tooltip
    if (this.hoveredNodeId) {
      this.drawTooltip(ctx, floor, w, mapH, mapY);
    }

    ctx.restore();
  }

  private drawTabs(ctx: CanvasRenderingContext2D, w: number): void {
    const floors = this.config.floors;
    const tabW = w / floors.length;

    ctx.fillStyle = COLORS.tabBg;
    ctx.fillRect(0, 0, w, TAB_HEIGHT);

    // Bottom border
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, TAB_HEIGHT);
    ctx.lineTo(w, TAB_HEIGHT);
    ctx.stroke();

    floors.forEach((floor, i) => {
      const x = i * tabW;
      const isActive = floor.id === this.currentFloorId;

      if (isActive) {
        ctx.fillStyle = COLORS.tabActive;
        ctx.fillRect(x, 0, tabW, TAB_HEIGHT);
        // Bottom highlight
        ctx.fillStyle = COLORS.tabBorder;
        ctx.fillRect(x, TAB_HEIGHT - 2.5, tabW, 2.5);
      }

      // Has current node indicator
      const hasCurrentNode = floor.nodes.some((n) => n.id === this.currentNodeId);

      ctx.font = TAB_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isActive ? COLORS.tabTextActive : COLORS.tabText;
      const label = floor.shortName ?? floor.name;
      ctx.fillText(label, x + tabW / 2, TAB_HEIGHT / 2);

      // Dot indicator if current scene is on this floor (but tab isn't active)
      if (hasCurrentNode && !isActive) {
        const textW = ctx.measureText(label).width;
        ctx.beginPath();
        ctx.arc(x + tabW / 2 + textW / 2 + 6, TAB_HEIGHT / 2, 3, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.nodeCurrent;
        ctx.fill();
      }
    });
  }

  private drawConnections(
    ctx: CanvasRenderingContext2D,
    floor: MapFloor,
    w: number, h: number, offsetY: number,
  ): void {
    floor.nodes.forEach((node) => {
      if (!this.isNodeVisible(node)) return;
      const pos = this.nodeScreen(node, floor, w, h, offsetY);
      node.neighbors.forEach((nId) => {
        const neighbor = floor.nodes.find((n) => n.id === nId);
        if (!neighbor || !this.isNodeVisible(neighbor)) return;
        const nPos = this.nodeScreen(neighbor, floor, w, h, offsetY);

        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(nPos.x, nPos.y);
        ctx.strokeStyle = COLORS.connection;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.stroke();
      });

      // Exit links (dashed)
      if (node.exitTo) {
        const pos2 = this.nodeScreen(node, floor, w, h, offsetY);
        ctx.beginPath();
        ctx.arc(pos2.x, pos2.y, NODE_RADIUS + 5, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS.connectionExit;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }

  private drawNodes(
    ctx: CanvasRenderingContext2D,
    floor: MapFloor,
    w: number, h: number, offsetY: number,
  ): void {
    floor.nodes.forEach((node) => {
      if (!this.isNodeVisible(node)) return;
      const pos = this.nodeScreen(node, floor, w, h, offsetY);
      const isCurrent = node.id === this.currentNodeId;
      const isHovered = node.id === this.hoveredNodeId;
      const r = isCurrent ? NODE_RADIUS_CURRENT : (isHovered ? NODE_RADIUS + 1 : NODE_RADIUS);

      // Glow for current
      if (isCurrent) {
        ctx.save();
        ctx.shadowColor = COLORS.nodeCurrent;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.nodeCurrent;
        ctx.fill();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isCurrent ? COLORS.nodeCurrent : (isHovered ? COLORS.nodeHover : COLORS.node);
      ctx.fill();

      if (isCurrent) {
        ctx.strokeStyle = COLORS.nodeCurrentBorder;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (isHovered) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  }

  private drawCameraArrow(
    ctx: CanvasRenderingContext2D,
    floor: MapFloor,
    w: number, h: number, offsetY: number,
  ): void {
    const curNode = floor.nodes.find((n) => n.id === this.currentNodeId);
    if (!curNode) return;
    const pos = this.nodeScreen(curNode, floor, w, h, offsetY);

    // Three camera positive yaw is counter-clockwise on a north-up map.
    const angle = -this.heading.yaw;
    const tipX = pos.x + Math.sin(angle) * ARROW_LENGTH;
    const tipY = pos.y - Math.cos(angle) * ARROW_LENGTH;

    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-5, 4);
    ctx.lineTo(5, 4);
    ctx.closePath();
    ctx.fillStyle = COLORS.arrow;
    ctx.fill();
    ctx.restore();
  }

  private drawTooltip(
    ctx: CanvasRenderingContext2D,
    floor: MapFloor,
    w: number, h: number, offsetY: number,
  ): void {
    const node = floor.nodes.find((n) => n.id === this.hoveredNodeId);
    if (!node) return;
    const pos = this.nodeScreen(node, floor, w, h, offsetY);

    ctx.font = TOOLTIP_FONT;
    const text = node.name;
    const textW = ctx.measureText(text).width;
    const padX = 8;
    const padY = 5;
    const tipW = textW + padX * 2;
    const tipH = 22;
    let tx = pos.x - tipW / 2;
    let ty = pos.y - NODE_RADIUS_CURRENT - tipH - 6;

    // Clamp to canvas
    tx = Math.max(4, Math.min(w - tipW - 4, tx));
    if (ty < offsetY + 4) ty = pos.y + NODE_RADIUS_CURRENT + 6;

    // Background
    ctx.fillStyle = COLORS.tooltipBg;
    ctx.strokeStyle = COLORS.tooltipBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tipW, tipH, 5);
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = COLORS.tooltipText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, tx + tipW / 2, ty + tipH / 2);
  }

  private drawGridPattern(
    ctx: CanvasRenderingContext2D,
    w: number, h: number, offsetY: number,
  ): void {
    const spacing = 24;

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let x = spacing; x < w; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, offsetY + h);
      ctx.stroke();
    }
    for (let y = offsetY + spacing; y < offsetY + h; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Dot grid overlay
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let x = spacing; x < w; x += spacing) {
      for (let y = offsetY + spacing; y < offsetY + h; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Subtle border around map area
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, offsetY + 4, w - 16, h - 8);
  }

  // ── Coordinate helpers ────────────────────────────────────────

  private nodeScreen(
    node: MapNode,
    floor: MapFloor,
    w: number, h: number, offsetY: number,
  ): { x: number; y: number } {
    const rect = this.contentRect(floor, w, h, offsetY, this.images.get(floor.id));
    return {
      x: rect.x + (node.x / floor.imageWidth) * rect.width,
      y: rect.y + (node.y / floor.imageHeight) * rect.height,
    };
  }

  private contentRect(
    floor: MapFloor,
    w: number,
    h: number,
    offsetY: number,
    image?: HTMLImageElement,
  ): { x: number; y: number; width: number; height: number } {
    const padding = 12;
    const availableW = Math.max(1, w - padding * 2);
    const availableH = Math.max(1, h - padding * 2);
    const sourceW = image?.naturalWidth || floor.imageWidth || 1;
    const sourceH = image?.naturalHeight || floor.imageHeight || 1;
    const scale = Math.min(availableW / sourceW, availableH / sourceH);
    const width = sourceW * scale;
    const height = sourceH * scale;
    return { x: (w - width) / 2, y: offsetY + (h - height) / 2, width, height };
  }

  private currentFloor(): MapFloor | undefined {
    return this.config.floors.find((f) => f.id === this.currentFloorId);
  }

  private findFloorForNode(nodeId: string): MapFloor | undefined {
    return this.config.floors.find((f) => f.nodes.some((n) => n.id === nodeId));
  }

  private isNodeVisible(node: MapNode): boolean {
    return node.visible === true || node.id === this.currentNodeId;
  }

  // ── Hit testing ───────────────────────────────────────────────

  private hitTestNode(mx: number, my: number): MapNode | null {
    const floor = this.currentFloor();
    if (!floor) return null;
    const showTabs = this.config.showFloorTabs !== false && this.config.floors.length > 1;
    const tabH = showTabs ? TAB_HEIGHT : 0;
    const mapH = this.displayH - tabH;

    let closest: MapNode | null = null;
    let minDist = 18;
    for (const node of floor.nodes) {
      if (!this.isNodeVisible(node)) continue;
      const pos = this.nodeScreen(node, floor, this.displayW, mapH, tabH);
      const dist = Math.hypot(mx - pos.x, my - pos.y);
      if (dist < minDist) {
        minDist = dist;
        closest = node;
      }
    }
    return closest;
  }

  private hitTestTab(mx: number, my: number): MapFloor | null {
    const showTabs = this.config.showFloorTabs !== false && this.config.floors.length > 1;
    if (!showTabs || my > TAB_HEIGHT) return null;
    const tabW = this.displayW / this.config.floors.length;
    const index = Math.floor(mx / tabW);
    return this.config.floors[index] ?? null;
  }

  // ── Event handlers ────────────────────────────────────────────

  private handleClick = (e: MouseEvent): void => {
    const { x, y } = this.canvasCoords(e);

    // Tab click
    const tab = this.hitTestTab(x, y);
    if (tab) {
      this.currentFloorId = tab.id;
      this.onFloorChange?.(tab.id);
      this.draw();
      return;
    }

    // Node click
    const node = this.hitTestNode(x, y);
    if (node) this.onNodeClick?.(node.id);
  };

  private handleMouseMove = (e: MouseEvent): void => {
    const { x, y } = this.canvasCoords(e);
    const node = this.hitTestNode(x, y);
    const tab = this.hitTestTab(x, y);
    const newHovered = node?.id ?? null;

    if (newHovered !== this.hoveredNodeId) {
      this.hoveredNodeId = newHovered;
      this.draw();
    }

    this.canvas.style.cursor = (node || tab) ? 'pointer' : 'default';
  };

  private handleMouseLeave = (): void => {
    if (this.hoveredNodeId) {
      this.hoveredNodeId = null;
      this.draw();
    }
    this.canvas.style.cursor = 'default';
  };

  private canvasCoords(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ── Image loading ─────────────────────────────────────────────

  private async loadImage(key: string, url: string): Promise<void> {
    if (!url) return;
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { this.images.set(key, img); resolve(); };
      img.onerror = () => resolve(); // graceful
      img.src = url;
    });
  }
}
