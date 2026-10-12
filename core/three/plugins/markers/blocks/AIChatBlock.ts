import { BlockBase } from './BlockBase';
import type { AIChatPanelBlock } from '#view360/types/tour';

export class AIChatBlock extends BlockBase<AIChatPanelBlock> {
  readonly blockType = 'ai-chat' as const;

  createElement(block: AIChatPanelBlock): HTMLElement {
    const element = document.createElement('div');
    element.textContent = block.context?.trim() || 'Trợ lý AI cho nội dung này đang được phát triển.';
    element.style.cssText = 'padding:10px 12px;border:1px solid rgba(168,85,247,.3);border-radius:9px;color:#d8b4fe;background:rgba(168,85,247,.1);font:400 13px/1.6 "Be Vietnam Pro",sans-serif';
    return element;
  }
}
