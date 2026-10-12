import * as THREE from 'three';
import { MarkerBase } from './MarkerBase';
import type {
  TourMarker,
  PanelMarkerData,
  PanelBlock,
  InfoMarker,
  AudioMarker,
  AIChatMarker,
  Model3DMarker,
  MapMarkerData,
} from '#view360/types/tour';
import { AIChatBlock, AudioBlock, ImageBlock, Image3DBlock, TextBlock } from './blocks';
import type { BlockBase } from './blocks';

const DEFAULT_PANEL_MIN_WIDTH = 220;
const DEFAULT_PANEL_MAX_WIDTH = 380;
const PANEL_RESPONSIVE_STYLE_ID = 'view360-marker-panel-responsive-style';

/**
 * Common base for markers whose action is showing an anchored information panel.
 *
 * This class owns only the panel shell, lifecycle and positioning. It does not
 * render any native content; registered BlockBase implementations own all UI.
 */
type LegacyPanelMarker = InfoMarker | AudioMarker | AIChatMarker | Model3DMarker;
type CompatiblePanelMarker = PanelMarkerData | LegacyPanelMarker | MapMarkerData;

export class PanelMarker extends MarkerBase<CompatiblePanelMarker> {
  readonly markerType = 'panel' as const;
  protected readonly style = { color: '#b85c2e', icon: 'i', label: 'Thông tin' };

  private readonly blockTypes = new Map<PanelBlock['type'], BlockBase>();

  private readonly panels = new Map<THREE.Object3D, {
    element: HTMLElement;
    container: HTMLElement;
  }>();
  private readonly projectedPosition = new THREE.Vector3();

  constructor(blockTypes: BlockBase[] = [new TextBlock(), new ImageBlock(), new Image3DBlock(), new AudioBlock(), new AIChatBlock()]) {
    super();
    blockTypes.forEach((blockType) => this.blockTypes.set(blockType.blockType, blockType));
  }

  /** Toggle only the panel belonging to the clicked world object. */
  override supports(marker: TourMarker): marker is CompatiblePanelMarker {
    return ['panel', 'info', 'audio', 'model3d', 'ai-chat'].includes(marker.plugin);
  }

  togglePanel(marker: TourMarker, anchor: THREE.Object3D, container: HTMLElement, camera: THREE.Camera): void {
    if (this.panels.has(anchor)) {
      this.hidePanel(anchor);
      return;
    }
    this.ensureResponsiveStyle();
    const panel = document.createElement('section');
    panel.className = 'view360-marker-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', marker.label || 'Nội dung điểm tương tác');
    panel.style.cssText = [
      'position:absolute', 'left:0', 'top:0', 'z-index:40',
      'width:max-content', `min-width:min(${DEFAULT_PANEL_MIN_WIDTH}px,calc(100% - 32px))`,
      `max-width:min(${DEFAULT_PANEL_MAX_WIDTH}px,calc(100% - 32px))`,
      'height:auto', 'max-height:none', 'overflow:visible',
      'display:flex', 'flex-direction:column', 'gap:12px',
      'pointer-events:auto', 'padding:16px', 'box-sizing:border-box',
      'color:#e0e0e0', 'background:rgba(32,32,32,.96)',
      'border:1px solid rgba(255,255,255,.08)', 'border-radius:12px',
      'box-shadow:0 10px 30px rgba(0,0,0,.6)', 'backdrop-filter:blur(14px)',
      'transform:translate(-50%,calc(-100% - 18px))',
      'transform-origin:bottom center', 'transition:opacity .16s ease,transform .16s ease',
    ].join(';');

    // Blocks are direct children. PanelMarker contributes no title, body or
    // fallback message that could conflict with a block's presentation.
    const renderedBlockCount = this.appendBlocks(marker, panel);
    if (renderedBlockCount === 0) return;

    const arrow = document.createElement('span');
    arrow.dataset.markerPanelArrow = '';
    arrow.style.cssText = 'position:absolute;left:50%;bottom:-7px;width:14px;height:14px;background:rgba(32,32,32,.96);border-right:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08);transform:translateX(-50%) rotate(45deg);pointer-events:none';
    panel.appendChild(arrow);
    ['pointerdown', 'pointerup', 'click', 'wheel'].forEach((name) => {
      panel.addEventListener(name, (event) => event.stopPropagation());
    });

    container.appendChild(panel);
    this.panels.set(anchor, { element: panel, container });
    this.updatePanels(camera);
  }

  hidePanel(anchor: THREE.Object3D): void {
    const panel = this.panels.get(anchor)?.element;
    if (panel) this.blockTypes.forEach((blockType) => blockType.disposeElement(panel));
    panel?.remove();
    this.panels.delete(anchor);
  }

  hideAllPanels(): void {
    this.panels.forEach(({ element }) => {
      this.blockTypes.forEach((blockType) => blockType.disposeElement(element));
      element.remove();
    });
    this.panels.clear();
  }

  /** Re-project every open world-anchored panel after camera movement/zoom. */
  updatePanels(camera: THREE.Camera): void {
    [...this.panels.entries()].forEach(([anchor, { element: panel, container }]) => {
      anchor.getWorldPosition(this.projectedPosition);
      this.projectedPosition.project(camera);
      const { x: ndcX, y: ndcY, z: ndcZ } = this.projectedPosition;
      // A panel is destroyed only after its marker leaves the camera frustum.
      if (ndcZ < -1 || ndcZ > 1 || Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1) {
        this.hidePanel(anchor);
        return;
      }

      const width = container.clientWidth;
      const height = container.clientHeight;
      const panelWidth = panel.offsetWidth;
      const panelHeight = panel.offsetHeight;
      const markerX = (ndcX * 0.5 + 0.5) * width;
      const markerY = (-ndcY * 0.5 + 0.5) * height;
      const marker = anchor.userData.marker as TourMarker | undefined;

      // On a narrow touch viewport, keep the panel as a compact floating card
      // instead of a full-width bottom sheet. Long content scrolls inside the
      // card while enough panorama remains visible around it.
      if (width <= 640) {
        panel.style.left = '50%';
        panel.style.right = 'auto';
        panel.style.top = 'auto';
        panel.style.bottom = 'max(12px, env(safe-area-inset-bottom, 0px))';
        panel.style.width = 'calc(100% - 24px)';
        panel.style.minWidth = '0';
        panel.style.maxWidth = '360px';
        panel.style.maxHeight = '55dvh';
        panel.style.overflowY = 'auto';
        panel.style.padding = '12px';
        panel.style.borderRadius = '14px';
        panel.style.transform = 'translateX(-50%)';
        panel.style.transformOrigin = 'bottom center';
        const arrow = panel.querySelector<HTMLElement>('[data-marker-panel-arrow]');
        if (arrow) arrow.style.display = 'none';
        return;
      }

      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.width = 'max-content';
      panel.style.minWidth = `min(${DEFAULT_PANEL_MIN_WIDTH}px,calc(100% - 32px))`;
      panel.style.maxWidth = `min(${DEFAULT_PANEL_MAX_WIDTH}px,calc(100% - 32px))`;
      panel.style.maxHeight = 'none';
      panel.style.overflowY = 'visible';
      panel.style.padding = '16px';
      panel.style.paddingBottom = '16px';
      panel.style.borderRadius = '12px';
      const requestedPlacement = marker?.plugin === 'panel' ? (marker.placement ?? 'vertical') : 'vertical';
      const placement = requestedPlacement === 'horizontal'
        ? (markerX + panelWidth + 28 <= width ? 'right' : 'left')
        : (markerY < panelHeight + 28 ? 'bottom' : 'top');
      let x = markerX;
      let y = markerY;

      if (placement === 'top' || placement === 'bottom') {
        x = THREE.MathUtils.clamp(markerX, panelWidth / 2 + 10, width - panelWidth / 2 - 10);
      } else {
        y = THREE.MathUtils.clamp(markerY, panelHeight / 2 + 10, height - panelHeight / 2 - 10);
        x = placement === 'left'
          ? Math.max(markerX, panelWidth + 28)
          : Math.min(markerX, width - panelWidth - 28);
      }
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      panel.style.transform = placement === 'bottom'
        ? 'translate(-50%, 18px)'
        : placement === 'left'
          ? 'translate(calc(-100% - 18px), -50%)'
          : placement === 'right'
            ? 'translate(18px, -50%)'
            : 'translate(-50%, calc(-100% - 18px))';
      panel.style.transformOrigin = placement === 'bottom'
        ? 'top center'
        : placement === 'left'
          ? 'center right'
          : placement === 'right'
            ? 'center left'
            : 'bottom center';

      const arrow = panel.querySelector<HTMLElement>('[data-marker-panel-arrow]');
      if (arrow) {
        arrow.style.display = '';
        arrow.style.left = placement === 'right' ? '-7px' : placement === 'left' ? 'auto' : '50%';
        arrow.style.right = placement === 'left' ? '-7px' : 'auto';
        arrow.style.top = placement === 'bottom' ? '-7px' : placement === 'left' || placement === 'right' ? '50%' : 'auto';
        arrow.style.bottom = placement === 'top' ? '-7px' : 'auto';
        arrow.style.transform = placement === 'left'
          ? 'translateY(-50%) rotate(-45deg)'
          : placement === 'right'
            ? 'translateY(-50%) rotate(135deg)'
            : `translateX(-50%) rotate(${placement === 'bottom' ? '225deg' : '45deg'})`;
      }
    });
  }

  private ensureResponsiveStyle(): void {
    if (document.getElementById(PANEL_RESPONSIVE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PANEL_RESPONSIVE_STYLE_ID;
    style.textContent = `
      @media (max-width:640px) {
        .view360-marker-panel {
          overscroll-behavior:contain;
          scrollbar-width:thin;
        }
        .view360-marker-panel img {
          max-height:32dvh !important;
        }
      }
      @media (max-width:900px) and (orientation:landscape) {
        .view360-marker-panel { max-height:60dvh !important; }
      }
    `;
    document.head.appendChild(style);
  }

  protected appendBlocks(marker: TourMarker, panel: HTMLElement): number {
    let renderedCount = 0;
    this.getBlocks(marker).forEach((block) => {
      const blockType = this.blockTypes.get(block.type);
      if (blockType?.supports(block)) {
        panel.appendChild(blockType.createElement(block, {
          panelLabel: marker.label || 'Điểm tương tác',
          isFirst: renderedCount === 0,
        }));
        renderedCount++;
      }
    });
    return renderedCount;
  }

  private getBlocks(marker: TourMarker): PanelBlock[] {
    if (marker.plugin === 'panel') return marker.contents ?? [];
    if (marker.plugin === 'info') {
      return [{ id: `${marker.id}-text`, type: 'text', content: marker.content }];
    }
    if (marker.plugin === 'audio') {
      return [{ id: `${marker.id}-audio`, type: 'audio', src: marker.src }];
    }
    if (marker.plugin === 'model3d') {
      const blocks: PanelBlock[] = [{ id: `${marker.id}-image`, type: 'image3d', image: marker.image }];
      if (marker.content) blocks.push({ id: `${marker.id}-text`, type: 'text', content: marker.content });
      return blocks;
    }
    if (marker.plugin === 'ai-chat') {
      return [{ id: `${marker.id}-ai`, type: 'ai-chat', context: marker.context }];
    }
    return [];
  }
}
