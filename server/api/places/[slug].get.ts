import { catalogService } from '../../services/catalogService';
import { mediaService } from '../../services/mediaService';

export default defineEventHandler((event) => {
  const slug = getRouterParam(event, 'slug') || '';
  const place = catalogService.getPlace(slug);

  if (!place) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Experience not found',
    });
  }

  const config = useRuntimeConfig(event);

  return {
    service: 'experience-service',
    item: mediaService.withPublicMedia(place, config.public.mediaBaseUrl),
  };
});
