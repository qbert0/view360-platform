import { saveSceneMarkers } from '../../../../../../utils/yamlLoader';
import type { TourMarker } from '#view360/types/tour';

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || '';
  const sceneId = getRouterParam(event, 'sceneId') || '';
  const body = await readBody<{ markers: TourMarker[] }>(event);

  if (!body || !Array.isArray(body.markers)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid markers body' });
  }

  const updatedTour = saveSceneMarkers(slug, sceneId, body.markers);
  if (!updatedTour) {
    throw createError({ statusCode: 404, statusMessage: `Scene '${sceneId}' or Tour '${slug}' not found` });
  }

  return { ok: true, slug, sceneId, tour: updatedTour };
});
