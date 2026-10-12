import { loadTour, listTours } from '../utils/yamlLoader';
import type { TourConfig, TourEntry } from '#view360/types/tour';

export const tourService = {
  /** Get a single tour by slug. Returns null if not found. */
  getTour(slug: string): TourConfig | null {
    return loadTour(slug);
  },

  /** List all tours (lightweight, no scenes included). */
  listTours(): TourEntry[] {
    return listTours();
  },

  /**
   * Resolve media URLs.
   * If a mediaBaseUrl is set (e.g. MinIO), prefix all /images and /thumbnails paths.
   */
  withMedia(tour: TourConfig, baseUrl = ''): TourConfig {
    if (!baseUrl) return tour;
    const prefix = baseUrl.replace(/\/$/, '');
    const prefixUrl = (url: string) =>
      url.startsWith('http') ? url : `${prefix}/${url.replace(/^\//, '')}`;

    return {
      ...tour,
      scenes: tour.scenes.map((scene) => ({
        ...scene,
        panorama: prefixUrl(scene.panorama),
        thumbnail: prefixUrl(scene.thumbnail),
      })),
    };
  },
};
