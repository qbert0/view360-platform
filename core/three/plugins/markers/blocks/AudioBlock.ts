import { BlockBase } from './BlockBase';
import type { BlockRenderContext } from './BlockBase';
import type { AudioPanelBlock } from '#view360/types/tour';

export class AudioBlock extends BlockBase<AudioPanelBlock> {
  readonly blockType = 'audio' as const;

  createElement(block: AudioPanelBlock, context?: BlockRenderContext): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:12px;min-width:0';
    if (context?.isFirst) {
      const title = document.createElement('p');
      title.textContent = context.panelLabel || 'Âm thanh';
      title.style.cssText = 'margin:0;color:#e67e22;font:600 13px/1.35 Inter,"Be Vietnam Pro",sans-serif;text-transform:uppercase;letter-spacing:1px';
      wrapper.appendChild(title);
    }
    const content = document.createElement('div');
    content.style.cssText = 'display:flex;flex-direction:column;gap:12px;min-width:0';
    const row = document.createElement('div');
    row.className = 'panel-header-row';
    row.style.cssText = 'display:flex;align-items:center;gap:12px';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '▶';
    button.setAttribute('aria-label', 'Phát âm thanh');
    button.style.cssText = 'display:flex;align-items:center;justify-content:center;flex:0 0 28px;width:28px;height:28px;padding:0;border:0;border-radius:50%;cursor:pointer;color:#fff;background:#e67e22;font-size:11px;box-shadow:0 2px 8px rgba(230,126,34,.28);transition:transform .2s ease';
    const label = document.createElement('span');
    label.textContent = block.src ? 'Bản ghi âm' : 'Chưa có tệp âm thanh';
    label.style.cssText = 'overflow:hidden;color:#ccc;font:500 13px/1.4 Inter,"Be Vietnam Pro",sans-serif;white-space:nowrap;text-overflow:ellipsis';
    row.append(button, label);

    const footer = document.createElement('div');
    footer.className = 'audio-control';
    footer.style.cssText = 'display:flex;align-items:center;gap:12px';
    const progress = document.createElement('input');
    progress.className = 'progress-container';
    progress.type = 'range';
    progress.min = '0';
    progress.max = '1000';
    progress.value = '0';
    progress.setAttribute('aria-label', 'Vị trí phát âm thanh');
    progress.style.cssText = 'flex:1;height:4px;margin:0;cursor:pointer;accent-color:#e67e22';
    const status = document.createElement('span');
    status.className = 'status-text';
    status.textContent = '0:00';
    status.style.cssText = 'min-width:34px;color:#888;font:500 12px/1.3 Inter,"Be Vietnam Pro",sans-serif;text-align:right;white-space:nowrap';
    footer.append(progress, status);

    const audio = document.createElement('audio');
    audio.src = block.src;
    audio.preload = 'metadata';
    audio.style.display = 'none';
    content.append(row, footer, audio);
    wrapper.appendChild(content);

    button.disabled = !block.src;
    if (!block.src) {
      button.style.opacity = '.45';
      button.style.cursor = 'not-allowed';
    }
    button.addEventListener('mouseenter', () => { if (!button.disabled) button.style.transform = 'scale(1.06)'; });
    button.addEventListener('mouseleave', () => { button.style.transform = ''; });
    button.addEventListener('click', () => {
      if (audio.paused) void audio.play();
      else audio.pause();
    });
    audio.addEventListener('play', () => {
      button.textContent = 'Ⅱ';
      button.setAttribute('aria-label', 'Tạm dừng âm thanh');
      label.textContent = 'Đang phát...';
    });
    audio.addEventListener('pause', () => {
      button.textContent = '▶';
      button.setAttribute('aria-label', 'Phát âm thanh');
      label.textContent = audio.ended ? 'Đã phát xong' : 'Bản ghi âm';
    });
    audio.addEventListener('timeupdate', () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      progress.value = duration ? String(Math.round((audio.currentTime / duration) * 1000)) : '0';
      status.textContent = this.formatTime(audio.currentTime);
    });
    audio.addEventListener('loadedmetadata', () => { status.textContent = this.formatTime(audio.duration); });
    audio.addEventListener('error', () => { label.textContent = 'Không tải được âm thanh'; });
    progress.addEventListener('input', () => {
      if (Number.isFinite(audio.duration)) audio.currentTime = (Number(progress.value) / 1000) * audio.duration;
    });
    return wrapper;
  }

  override disposeElement(panel: HTMLElement): void {
    panel.querySelectorAll('audio').forEach((audio) => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    });
  }

  private formatTime(value: number): string {
    if (!Number.isFinite(value)) return '0:00';
    const seconds = Math.max(0, Math.floor(value));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
}
