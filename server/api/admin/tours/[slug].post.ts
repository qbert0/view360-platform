import { saveTour } from '../../../utils/yamlLoader';
import type { TourConfig } from '#view360/types/tour';

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || '';
  const body = await readBody<TourConfig>(event);

  if (!body || !body.slug || !Array.isArray(body.scenes)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid tour config body' });
  }

  try {
    saveTour(slug, body);
    return { ok: true, slug, tour: body };
  } catch (err) {
    throw createError({ statusCode: 500, statusMessage: `Could not save tour: ${err}` });
  }
});
