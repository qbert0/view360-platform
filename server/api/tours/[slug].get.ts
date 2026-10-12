import { tourService } from '../../services/tourService';

export default defineEventHandler((event) => {
  const slug = getRouterParam(event, 'slug') || '';
  const tour = tourService.getTour(slug);

  if (!tour) {
    throw createError({ statusCode: 404, statusMessage: `Tour '${slug}' not found` });
  }

  const config = useRuntimeConfig(event);
  return {
    service: 'tour-experience',
    item: tourService.withMedia(tour, config.public.mediaBaseUrl),
  };
});
