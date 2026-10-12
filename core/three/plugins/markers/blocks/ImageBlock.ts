import { BlockBase } from './BlockBase';
import type { ImagePanelBlock } from '#view360/types/tour';

/** Static 2D image content. It deliberately has no rotation/3D interaction. */
export class ImageBlock extends BlockBase<ImagePanelBlock> {
  readonly blockType = 'image' as const;

  createElement(block: ImagePanelBlock): HTMLElement {
    const figure = document.createElement('figure');
    figure.style.cssText = 'margin:0;display:flex;flex-direction:column;gap:8px;min-width:0';

    if (block.src) {
      const image = document.createElement('img');
      image.src = block.src;
      image.alt = block.alt?.trim() || block.caption?.trim() || 'Ảnh minh họa';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.style.cssText = 'display:block;width:100%;height:auto;max-height:55vh;object-fit:contain;border-radius:10px;background:#111';
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
