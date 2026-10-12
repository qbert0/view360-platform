import { loadTour, saveTour } from '../../../utils/yamlLoader';
import type { TourConfig } from '#view360/types/tour';

function createUniqueSlug(): string {
  const base = `tour-moi-${Date.now().toString(36)}`;
  let slug = base;
  let suffix = 2;
  while (loadTour(slug)) slug = `${base}-${suffix++}`;
  return slug;
}

export default defineEventHandler((event) => {
  const slug = createUniqueSlug();
  const tour: TourConfig = {
    slug,
    title: 'Tour mới',
    location: 'Chưa cập nhật',
    summary: 'Tour mới chưa có nội dung.',
    theme: 'nature',
    plugins: [],
    mode: 'free',
    autoRotate: false,
    showMinimap: false,
    scenes: [],
  };

  saveTour(slug, tour);
  if (!loadTour(slug)) {
    throw createError({
      statusCode: 500,
      statusMessage: 'File tour đã được ghi nhưng cấu hình không thể tải lại. Hãy kiểm tra schema tour.',
    });
  }

  setResponseStatus(event, 201);
  return { ok: true, slug, tour };
});
