/**
 * ─────────────────────────────────────────────────────────────────
 * AutorotatePlugin — Auto-rotation after idle timeout
 *
 * Features:
 *   - Configurable idle delay (default 2 min)
 *   - Speed & direction configurable
 *   - Automatically pauses on drag
 *   - Smooth ramp-up from idle
 * ─────────────────────────────────────────────────────────────────
 */

import { PluginBase } from './PluginBase';

export interface AutorotatePluginOptions {
  speed?: number;        // rad/sec. Default 0.3
  idleDelayMs?: number;  // ms before starting. Default 120000 (2 min)
  direction?: 1 | -1;   // 1 = counterclockwise, -1 = clockwise
}

export class AutorotatePlugin extends PluginBase {
  readonly id = 'autorotate';
  readonly name = 'Autorotate Plugin';

  private speed: number;
  private idleDelayMs: number;
  private direction: 1 | -1;

  private isActive = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private rampProgress = 0; // 0–1, ramp-up factor

  private unsubs: Array<() => void> = [];

  constructor(opts: AutorotatePluginOptions = {}) {
    super();
    this.speed = opts.speed ?? 0.3;
    this.idleDelayMs = opts.idleDelayMs ?? 120_000;
    this.direction = opts.direction ?? 1;
  }

  protected override onInit(): void {
    this.scheduleStart();

    // Pause on any drag interaction
    const stopOnDrag = () => {
      this.isActive = false;
      this.rampProgress = 0;
      this.scheduleStart();
    };

    const unsub1 = this.ctx.bus.on('interaction:dragstart', stopOnDrag);
    const unsub2 = this.ctx.bus.on('scene:transition:start', stopOnDrag);

    this.unsubs.push(unsub1, unsub2);
  }

  protected override onUpdate(delta: number): void {
    if (!this.isActive) return;

    // Smooth ramp-up over 2 seconds
    this.rampProgress = Math.min(1, this.rampProgress + delta * 0.5);
    const ease = this.rampProgress * this.rampProgress; // quadratic ease-in

    const yaw = this.ctx.camera.getTargetYaw() + this.direction * this.speed * delta * ease;
    this.ctx.camera.setTarget(yaw, this.ctx.camera.getTargetPitch());
  }

  protected override onDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.unsubs.forEach((fn) => fn());
  }

  private scheduleStart(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.isActive = true;
      this.rampProgress = 0;
    }, this.idleDelayMs);
  }
}
