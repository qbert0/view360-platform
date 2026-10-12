import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import sharp from 'sharp';

const PUBLIC_DIR = resolve(process.cwd(), 'public');
const PREVIEW_DIR = join(PUBLIC_DIR, 'editor-previews');

sharp.cache(false);
sharp.concurrency(1);

/** Generate and persist a lightweight admin-only panorama for legacy scenes. */
export default defineEventHandler(async (event) => {
  const source = String(getQuery(event).path ?? '');
  if (!source.startsWith('/') || source.startsWith('//') || /^https?:/iu.test(source)) {
    throw createError({ statusCode: 400, statusMessage: 'Đường dẫn panorama không hợp lệ.' });
  }

  const cleanSource = source.split(/[?#]/u, 1)[0]!;
  const inputPath = resolve(PUBLIC_DIR, `.${cleanSource}`);
  if (!inputPath.startsWith(`${PUBLIC_DIR}${sep}`) || !existsSync(inputPath)) {
    throw createError({ statusCode: 404, statusMessage: 'Không tìm thấy panorama nguồn.' });
  }

  mkdirSync(PREVIEW_DIR, { recursive: true });
  const name = `${createHash('sha1').update(cleanSource).digest('hex')}.webp`;
  const outputPath = join(PREVIEW_DIR, name);

  if (!existsSync(outputPath)) {
    await sharp(inputPath, { sequentialRead: true })
      .resize(2048, 1024, { fit: 'fill', withoutEnlargement: true })
      .webp({ quality: 86, effort: 3 })
      .toFile(outputPath);
  }

  return sendRedirect(event, `/editor-previews/${name}`, 302);
});
