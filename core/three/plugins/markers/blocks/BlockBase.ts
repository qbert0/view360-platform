import type { PanelBlock } from '#view360/types/tour';

export interface BlockRenderContext {
  panelLabel: string;
  isFirst: boolean;
}

/** A renderable unit of content owned by PanelMarker. */
export abstract class BlockBase<TBlock extends PanelBlock = PanelBlock> {
  abstract readonly blockType: TBlock['type'];

  supports(block: PanelBlock): block is TBlock {
    return block.type === this.blockType;
  }

  abstract createElement(block: TBlock, context?: BlockRenderContext): HTMLElement;

  /** Release media or browser resources belonging to a removed panel. */
  disposeElement(_panel: HTMLElement): void {}
}
