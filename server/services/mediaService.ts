import type { PlaceExperience } from '#view360/types/place';

export const mediaService = {
  withPublicMedia(place: PlaceExperience, baseUrl = ''): PlaceExperience {
    if (!baseUrl) {
      return place;
    }

    return {
      ...place,
      scenes: place.scenes.map((scene) => ({
        ...scene,
        panorama: scene.panorama.startsWith('http')
          ? scene.panorama
          : `${baseUrl.replace(/\/$/, '')}/${scene.panorama.replace(/^\//, '')}`,
      })),
    };
  },
};
