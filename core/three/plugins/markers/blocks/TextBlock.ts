import * as THREE from 'three';
import { BlockBase } from './BlockBase';
import type { BlockRenderContext } from './BlockBase';
import type { TextPanelBlock } from '#view360/types/tour';

interface ActiveSpeech {
  utterance: SpeechSynthesisUtterance;
  button: HTMLButtonElement;
  status: HTMLElement;
  fill: HTMLElement;
  fullText: string;
  startIndex: number;
  durationMs: number;
  startedAt: number;
  animationFrame: number;
}

export class TextBlock extends BlockBase<TextPanelBlock> {
  readonly blockType = 'text' as const;
  private activeSpeech?: ActiveSpeech;

  createElement(block: TextPanelBlock, context?: BlockRenderContext): HTMLElement {
    this.ensureScrollbarStyle();
    const presentation = block.presentation ?? 'text-only';
    const hasText = presentation !== 'audio-only';
    const hasNarration = presentation !== 'text-only';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:16px;min-width:0';

    let control: ReturnType<TextBlock['createSpeechControl']> | undefined;
    if (hasNarration) control = this.createSpeechControl(block);
    if (hasText) {
      const text = document.createElement('p');
      text.className = 'panel-content view360-text-block-content';
      text.style.cssText = 'max-height:180px;overflow-y:auto;scrollbar-width:none;margin:0;padding-right:4px;color:#ccc;font:400 13px/1.65 Inter,"Be Vietnam Pro",sans-serif;white-space:pre-wrap;text-align:left;mask-image:linear-gradient(to bottom,#000 76%,transparent 100%);-webkit-mask-image:linear-gradient(to bottom,#000 76%,transparent 100%)';
      if (context?.isFirst) {
        const title = document.createElement('strong');
        title.textContent = `${context.panelLabel || 'Thông tin'} `;
        title.style.cssText = 'color:#e67e22;font-weight:600;text-transform:uppercase;letter-spacing:1px';
        text.appendChild(title);
      }
      text.append(document.createTextNode(block.content?.trim() || 'Thông tin chưa được cập nhật.'));
      wrapper.appendChild(text);
    } else if (context?.isFirst) {
      const title = document.createElement('p');
      title.textContent = context.panelLabel || 'Thông tin';
      title.style.cssText = 'margin:0;color:#e67e22;font:600 13px/1.4 Inter,"Be Vietnam Pro",sans-serif;text-transform:uppercase;letter-spacing:1px';
      wrapper.appendChild(title);
    }
    if (control) wrapper.appendChild(control.footer);
    return wrapper;
  }

  override disposeElement(panel: HTMLElement): void {
    if (this.activeSpeech && panel.contains(this.activeSpeech.button)) this.stopSpeech();
    panel.querySelectorAll<HTMLAudioElement>('audio[data-text-narration]').forEach((audio) => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    });
  }

  private createSpeechControl(block: TextPanelBlock): { button: HTMLButtonElement; footer: HTMLElement } {
    if (block.speech?.src?.trim()) return this.createRecordedSpeechControl(block.speech.src.trim());
    return this.createBrowserSpeechControl(block);
  }

  private createRecordedSpeechControl(src: string): { button: HTMLButtonElement; footer: HTMLElement } {
    const { button, footer, track, fill, status } = this.createPlayerShell();
    const audio = document.createElement('audio');
    audio.dataset.textNarration = 'true';
    audio.src = src;
    audio.preload = 'metadata';
    audio.style.display = 'none';
    footer.appendChild(audio);

    const updateProgress = () => {
      const ratio = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
      fill.style.width = `${THREE.MathUtils.clamp(ratio, 0, 1) * 100}%`;
      track.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    };
    const setPlayingState = (playing: boolean) => {
      button.textContent = playing ? 'Ⅱ' : '▶';
      button.setAttribute('aria-label', playing ? 'Tạm dừng bản đọc' : 'Phát bản đọc');
      status.textContent = playing ? 'Đang đọc...' : '';
      status.style.display = playing ? '' : 'none';
    };
    button.addEventListener('click', async () => {
      if (audio.paused) {
        try { await audio.play(); } catch {
          status.textContent = 'Không phát được file';
          status.style.display = '';
        }
      } else {
        audio.pause();
      }
    });
    audio.addEventListener('play', () => setPlayingState(true));
    audio.addEventListener('pause', () => setPlayingState(false));
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('durationchange', updateProgress);
    audio.addEventListener('ended', () => {
      setPlayingState(false);
      fill.style.width = '100%';
    });
    audio.addEventListener('error', () => {
      setPlayingState(false);
      status.textContent = 'Lỗi tải bản đọc';
      status.style.display = '';
    });
    const seek = (ratio: number) => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      audio.currentTime = THREE.MathUtils.clamp(ratio, 0, 1) * audio.duration;
      updateProgress();
    };
    track.addEventListener('click', (event) => {
      const rect = track.getBoundingClientRect();
      seek((event.clientX - rect.left) / rect.width);
    });
    track.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const ratio = audio.duration > 0 ? audio.currentTime / audio.duration : 0;
      seek(ratio + (event.key === 'ArrowRight' ? 0.05 : -0.05));
    });
    return { button, footer };
  }

  private createPlayerShell(): {
    button: HTMLButtonElement;
    footer: HTMLElement;
    track: HTMLElement;
    fill: HTMLElement;
    status: HTMLElement;
  } {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '▶';
    button.setAttribute('aria-label', 'Đọc văn bản');
    button.style.cssText = 'display:flex;align-items:center;justify-content:center;flex:0 0 28px;width:28px;height:28px;margin-top:1px;padding:0;border:0;border-radius:50%;cursor:pointer;color:#fff;background:#e67e22;font-size:11px;box-shadow:0 2px 8px rgba(230,126,34,.28);transition:transform .2s ease,background .2s ease';
    button.addEventListener('mouseenter', () => { button.style.transform = 'scale(1.06)'; button.style.background = '#d35400'; });
    button.addEventListener('mouseleave', () => { button.style.transform = ''; button.style.background = '#e67e22'; });

    const footer = document.createElement('div');
    footer.className = 'audio-control';
    footer.style.cssText = 'display:flex;align-items:center;gap:12px';
    const track = document.createElement('div');
    track.className = 'progress-container';
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-label', 'Chọn vị trí bắt đầu đọc');
    track.tabIndex = 0;
    track.style.cssText = 'position:relative;flex:1;height:8px;overflow:hidden;border-radius:4px;background:#333;cursor:pointer';
    const fill = document.createElement('div');
    fill.style.cssText = 'width:0;height:100%;border-radius:2px;background:#e67e22';
    track.appendChild(fill);
    const status = document.createElement('span');
    status.className = 'status-text';
    status.textContent = '';
    status.style.cssText = 'display:none;color:#888;font:500 12px/1.3 Inter,"Be Vietnam Pro",sans-serif;white-space:nowrap';
    footer.append(button, track, status);

    return { button, footer, track, fill, status };
  }

  private createBrowserSpeechControl(block: TextPanelBlock): { button: HTMLButtonElement; footer: HTMLElement } {
    const { button, footer, track, fill, status } = this.createPlayerShell();

    if (!('speechSynthesis' in window)) {
      button.disabled = true;
      button.style.opacity = '.45';
      button.style.cursor = 'not-allowed';
      status.textContent = 'Không hỗ trợ';
      status.style.display = '';
      return { button, footer };
    }
    button.addEventListener('click', () => {
      if (this.activeSpeech?.button === button) {
        this.stopSpeech();
        return;
      }
      const content = block.content?.trim();
      if (!content) {
        status.textContent = 'Chưa có nội dung';
        status.style.display = '';
        return;
      }
      this.stopSpeech();
      this.startSpeech(block, content, 0, button, status, fill);
    });
    const seek = (clientX: number) => {
      const content = block.content?.trim();
      if (!content || !('speechSynthesis' in window)) return;
      const rect = track.getBoundingClientRect();
      const ratio = THREE.MathUtils.clamp((clientX - rect.left) / rect.width, 0, 1);
      let startIndex = Math.min(content.length - 1, Math.floor(ratio * content.length));
      while (startIndex > 0 && !/\s/.test(content[startIndex - 1] ?? '')) startIndex--;
      this.stopSpeech();
      fill.style.width = `${(startIndex / content.length) * 100}%`;
      this.startSpeech(block, content, startIndex, button, status, fill);
    };
    track.addEventListener('click', (event) => seek(event.clientX));
    track.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const current = Number.parseFloat(fill.style.width) || 0;
      const next = THREE.MathUtils.clamp(current + (event.key === 'ArrowRight' ? 5 : -5), 0, 100);
      const rect = track.getBoundingClientRect();
      seek(rect.left + (next / 100) * rect.width);
    });
    return { button, footer };
  }

  private startSpeech(
    block: TextPanelBlock,
    fullText: string,
    startIndex: number,
    button: HTMLButtonElement,
    status: HTMLElement,
    fill: HTMLElement,
  ): void {
      const spokenText = fullText.slice(startIndex);
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.lang = block.speech?.lang || 'vi-VN';
      utterance.rate = THREE.MathUtils.clamp(block.speech?.rate ?? 1, 0.5, 2);
      utterance.pitch = THREE.MathUtils.clamp(block.speech?.pitch ?? 1, 0.5, 2);
      const language = utterance.lang.toLowerCase();
      const voices = window.speechSynthesis.getVoices();
      utterance.voice = voices.find((item) => item.lang.toLowerCase() === language)
        ?? voices.find((item) => item.lang.toLowerCase().startsWith(language.split('-')[0]))
        ?? null;
      button.textContent = '■';
      button.setAttribute('aria-label', 'Dừng đọc văn bản');
      status.textContent = 'Đang đọc...';
      status.style.display = '';
      fill.style.width = `${(startIndex / fullText.length) * 100}%`;
      utterance.addEventListener('boundary', (event) => {
        const position = Math.min(fullText.length, startIndex + event.charIndex);
        const boundaryProgress = (position / fullText.length) * 100;
        const currentProgress = Number.parseFloat(fill.style.width) || 0;
        fill.style.width = `${Math.max(currentProgress, boundaryProgress)}%`;
        trackAriaValue(fill, position, fullText.length);
      });
      const finish = () => {
        if (this.activeSpeech?.utterance !== utterance) return;
        fill.style.width = '100%';
        this.resetControl(this.activeSpeech);
        this.activeSpeech = undefined;
      };
      utterance.addEventListener('end', finish);
      utterance.addEventListener('error', finish);
      const active: ActiveSpeech = {
        utterance,
        button,
        status,
        fill,
        fullText,
        startIndex,
        durationMs: this.estimateSpeechDuration(spokenText, utterance.rate),
        startedAt: 0,
        animationFrame: 0,
      };
      utterance.addEventListener('start', () => {
        if (this.activeSpeech !== active) return;
        active.startedAt = performance.now();
        this.updateEstimatedProgress(active);
      });
      this.activeSpeech = active;
      window.speechSynthesis.speak(utterance);
  }

  private stopSpeech(): void {
    if (!this.activeSpeech || !('speechSynthesis' in window)) return;
    const active = this.activeSpeech;
    this.activeSpeech = undefined;
    window.speechSynthesis.cancel();
    this.resetControl(active);
  }

  private resetControl(active: ActiveSpeech): void {
    cancelAnimationFrame(active.animationFrame);
    active.button.textContent = '▶';
    active.button.setAttribute('aria-label', 'Đọc văn bản');
    active.status.textContent = '';
    active.status.style.display = 'none';
  }

  private updateEstimatedProgress(active: ActiveSpeech): void {
    if (this.activeSpeech !== active || active.startedAt === 0) return;
    const elapsedRatio = THREE.MathUtils.clamp((performance.now() - active.startedAt) / active.durationMs, 0, 1);
    const position = active.startIndex + elapsedRatio * (active.fullText.length - active.startIndex);
    const estimatedProgress = Math.min(98, (position / active.fullText.length) * 100);
    const currentProgress = Number.parseFloat(active.fill.style.width) || 0;
    active.fill.style.width = `${Math.max(currentProgress, estimatedProgress)}%`;
    trackAriaValue(active.fill, position, active.fullText.length);
    active.animationFrame = requestAnimationFrame(() => this.updateEstimatedProgress(active));
  }

  private estimateSpeechDuration(text: string, rate: number): number {
    const wordCount = text.trim().split(/\s+/u).filter(Boolean).length;
    const punctuationCount = (text.match(/[,.!?;:\n]/gu) ?? []).length;
    const speakingMs = (wordCount / (165 * rate)) * 60_000;
    const pauseMs = (punctuationCount * 110) / rate;
    return Math.max(800, speakingMs + pauseMs);
  }

  private ensureScrollbarStyle(): void {
    if (document.getElementById('view360-text-block-scrollbar-style')) return;
    const style = document.createElement('style');
    style.id = 'view360-text-block-scrollbar-style';
    style.textContent = '.view360-text-block-content::-webkit-scrollbar{display:none;width:0;height:0}';
    document.head.appendChild(style);
  }
}

function trackAriaValue(fill: HTMLElement, position: number, length: number): void {
  fill.parentElement?.setAttribute('aria-valuenow', String(Math.round((position / length) * 100)));
}
