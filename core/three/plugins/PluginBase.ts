/**
 * ─────────────────────────────────────────────────────────────────
 * PluginBase — Abstract base class for all engine plugins
 *
 * Plugins hook into the engine lifecycle:
 *   init()    → called once after engine is ready
 *   update()  → called every frame (before renderer.render)
 *   destroy() → called when engine is destroyed or plugin removed
 * ─────────────────────────────────────────────────────────────────
 */

import type * as THREE from 'three';
import type { EventBus } from '../engine/EventBus';
import type { CameraController } from '../engine/CameraController';
import type { TourScene } from '#view360/types/tour';

/** Context passed to every plugin */
export interface PluginContext {
  scene: THREE.Scene;
  camera: CameraController;
  renderer: THREE.WebGLRenderer;
  bus: EventBus;
  container: HTMLElement;
}

export abstract class PluginBase {
  /** Unique identifier for this plugin */
  abstract readonly id: string;

  /** Display name (for debugging / devtools) */
  abstract readonly name: string;

  protected ctx!: PluginContext;
  private _initialized = false;

  /** Internal initializer called by engine — do not override */
  _init(ctx: PluginContext): void {
    this.ctx = ctx;
    this._initialized = true;
    this.onInit();
  }

  /** Called each animation frame with delta time in seconds */
  _update(delta: number): void {
    if (this._initialized) this.onUpdate(delta);
  }

  /** Called when engine disposes */
  _destroy(): void {
    this.onDestroy();
    this._initialized = false;
  }

  // ── Lifecycle hooks to override ──────────────────────────────

  /** Called once after plugin is registered to the engine */
  protected onInit(): void {}

  /** Called every animation frame. `delta` is seconds since last frame */
  protected onUpdate(_delta: number): void {}

  /** Called when plugin or engine is destroyed. Clean up event listeners etc. */
  protected onDestroy(): void {}

  // ── Optional scene lifecycle hooks ──────────────────────────

  /** Called when a new scene starts loading */
  onSceneLoad?(_scene: TourScene): void;

  /** Called after scene is fully loaded and visible */
  onSceneReady?(_scene: TourScene): void;
}
