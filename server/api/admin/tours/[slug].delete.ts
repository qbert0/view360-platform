import { deleteTour } from '../../../utils/yamlLoader';

export default defineEventHandler((event) => {
  const slug = getRouterParam(event, 'slug') ?? '';
  const result = deleteTour(slug);

  if (result === 'protected') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Đây là tour hệ thống nên không thể xóa từ trang quản trị.',
    });
  }
  if (result === 'not-found') {
    throw createError({ statusCode: 404, statusMessage: 'Không tìm thấy tour cần xóa.' });
  }

  return { ok: true, slug };
});
