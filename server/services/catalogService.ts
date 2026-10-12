import { places } from '../data/places';

export const catalogService = {
  listPlaces() {
    if (useRuntimeConfig().public.siteId === 'duc-thuy') return [];
    return places.map(({ scenes, ...place }) => ({
      ...place,
      sceneCount: scenes.length,
      cover: scenes[0]?.thumbnail,
    }));
  },

  getPlace(slug: string) {
    if (useRuntimeConfig().public.siteId === 'duc-thuy') return undefined;
    return places.find((place) => place.slug === slug);
  },
};
