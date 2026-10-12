/**
 * server/content/resolver.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer 3: Resolve media URLs (panorama / thumbnail) to absolute URLs.
 * Supports: local dev (relative), MinIO (env prefix), CDN (absolute passthrough).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { TourConfig } from '#view360/types/tour';

/**
 * Resolve all media URLs in a TourConfig to absolute URLs.
 * If baseUrl is empty, returns the tour unchanged (local dev mode).
 */
export function resolveMediaUrls(tour: TourConfig, baseUrl: string): TourConfig {
  if (!baseUrl) return tour;

  const prefix = baseUrl.replace(/\/$/, '');
  const resolve = (url: string): string => {
    if (!url || url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${prefix}/${url.replace(/^\/+/, '')}`;
  };

  return {
    ...tour,
    scenes: tour.scenes.map(scene => ({
      ...scene,
      panorama:  resolve(scene.panorama),
      sourcePanorama: scene.sourcePanorama ? resolve(scene.sourcePanorama) : undefined,
      previewPanorama: scene.previewPanorama ? resolve(scene.previewPanorama) : undefined,
      mobilePanorama: scene.mobilePanorama ? resolve(scene.mobilePanorama) : undefined,
      ktx2Panorama: scene.ktx2Panorama ? resolve(scene.ktx2Panorama) : undefined,
      multiRes: scene.multiRes
        ? { ...scene.multiRes, urlTemplate: resolve(scene.multiRes.urlTemplate) }
        : undefined,
      editorPanorama: scene.editorPanorama ? resolve(scene.editorPanorama) : undefined,
      thumbnail: resolve(scene.thumbnail),
    })),
  };
}

/**
 * Given a scene ID, return the full external URL to share it.
 * Format: /experience/:tourId?scene=:sceneId
 */
export function buildSceneShareUrl(
  baseAppUrl: string,
  tourId: string,
  sceneId: string,
): string {
  const base = baseAppUrl.replace(/\/$/, '');
  return `${base}/experience/${tourId}?scene=${sceneId}`;
}
