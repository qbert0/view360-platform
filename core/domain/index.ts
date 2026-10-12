/**
 * core/domain/index.ts
 * ─────────────────────────────────────────────────────────────────
 * Domain model — pure TypeScript types, zero Vue/PSV/framework deps.
 * Per docs/01-kien-truc-tong-the.md §4:
 *   "Domain/schema: không import Vue component, filesystem, thư viện render"
 *
 * Re-exports from types/ for backward compatibility while we migrate.
 * New code should import from '#view360/core/domain' directly.
 * ─────────────────────────────────────────────────────────────────
 */

// ── Tour domain ───────────────────────────────────────────────────────────────
export type {
  NavigationMarker,
  InfoMarker,
  AudioMarker,
  AIChatMarker,
  TourMarker,
  TourScene,
  TourConfig,
  TourEntry,
} from '#view360/types/tour';

// ── Destination / Place domain ────────────────────────────────────────────────
export type {
  PlaceHotspot,
  PlaceScene,
  PlaceExperience,
} from '#view360/types/place';

// ── Shared value types ────────────────────────────────────────────────────────

/** Unique key for a scene: "tourId#sceneId" — matches docs §5 */
export type SceneKey = `${string}#${string}`;

/** Lightweight ref used in navigation links */
export interface SceneRef {
  tourId: string;
  sceneId: string;
}

/** Route params for /experience/:entryTourId/:ownerTourId/:sceneId */
export interface ExperienceRouteParams {
  entryTourId: string;
  ownerTourId: string;
  sceneId: string;
}
