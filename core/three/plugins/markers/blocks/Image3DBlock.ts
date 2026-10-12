import { BlockBase } from './BlockBase';
import type { Image3DPanelBlock } from '#view360/types/tour';

export class Image3DBlock extends BlockBase<Image3DPanelBlock> {
  readonly blockType = 'image3d' as const;

  createElement(block: Image3DPanelBlock): HTMLElement {
    const figure = document.createElement('figure');
    figure.style.cssText = 'margin:0;display:flex;flex-direction:column;gap:8px';
    if (block.image) {
      const image = document.createElement('img');
      image.src = block.image;
      image.alt = block.caption || 'Ảnh vật thể';
      image.style.cssText = 'display:block;width:100%;max-height:55vh;object-fit:contain;border-radius:10px;background:#050505';
      figure.appendChild(image);
    }
    if (block.caption) {
      const caption = document.createElement('figcaption');
      caption.textContent = block.caption;
      caption.style.cssText = 'color:rgba(255,255,255,.65);font:400 12px/1.5 "Be Vietnam Pro",sans-serif';
      figure.appendChild(caption);
    }
    return figure;
  }
}
