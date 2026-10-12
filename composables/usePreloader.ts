import { ref } from 'vue';
import type { TourScene } from '#view360/types/tour';

/**
 * Preloads panorama images in the background so scene switches feel instant.
 * Strategy: when a scene becomes active, preload all of its neighbours' panoramas.
 */
export function usePreloader() {
  const preloaded = new Set<string>();

  function preloadUrl(url: string): void {
    if (!url || preloaded.has(url)) return;
    preloaded.add(url);
    // Use Image for JPEGs — browser caches it for PSV to reuse
    const img = new window.Image();
    img.src = url;
  }

  /** Preload full panorama + thumbnail for a scene */
  function preloadScene(scene: TourScene): void {
    preloadUrl(scene.thumbnail);
    preloadUrl(scene.panorama);
  }

  /**
   * Preload the neighbours of the active scene.
   * Finds all scenes reachable via navigation markers and preloads them.
   */
  function preloadNeighbours(activeScene: TourScene, allScenes: TourScene[]): void {
    const targetIds = activeScene.markers
      .filter((m) => m.plugin === 'navigation')
      .map((m) => (m as { targetScene: string }).targetScene);

    for (const id of targetIds) {
      const scene = allScenes.find((s) => s.id === id);
      if (scene) preloadScene(scene);
    }
  }

  return { preloadScene, preloadNeighbours, preloadUrl };
}
