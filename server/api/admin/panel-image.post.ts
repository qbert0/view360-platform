import { mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import sharp from 'sharp';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_FILE_SIZE = 200 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = '200 MB';

/** Upload optimized static images used by ImageBlock without panorama variants. */
export default defineEventHandler(async (event) => {
  const contentLength = Number(getRequestHeader(event, 'content-length') ?? 0);
  if (contentLength > MAX_FILE_SIZE + 1024 * 1024) {
    throw createError({ statusCode: 413, statusMessage: `Ảnh 2D không được vượt quá ${MAX_FILE_SIZE_LABEL}.` });
  }

  // H3's legacy byte-by-byte multipart parser can throw "Invalid array
  // length" for binary bodies containing some byte sequences. The Web API
  // FormData parser is streaming-safe and does not use that parser.
  const form = await readFormData(event);
  const uploaded = form.get('file');
  if (!uploaded || typeof uploaded === 'string' || typeof uploaded.arrayBuffer !== 'function') {
    throw createError({ statusCode: 400, statusMessage: 'Không có ảnh nào được gửi lên.' });
  }

  const extension = extname(uploaded.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw createError({ statusCode: 415, statusMessage: 'Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.' });
  }
  if (uploaded.size > MAX_FILE_SIZE) {
    throw createError({ statusCode: 413, statusMessage: `Ảnh 2D không được vượt quá ${MAX_FILE_SIZE_LABEL}.` });
  }

  const imageData = Buffer.from(await uploaded.arrayBuffer());

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}-panel.webp`;
  await mkdir(UPLOAD_DIR, { recursive: true });

  try {
    await sharp(imageData, { failOn: 'error', sequentialRead: true })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86, effort: 4 })
      .toFile(join(UPLOAD_DIR, fileName));
  } catch (error: any) {
    throw createError({
      statusCode: 422,
      statusMessage: `Không thể xử lý ảnh 2D: ${error?.message ?? String(error)}`,
    });
  }

  return { ok: true, file: { url: `/uploads/${fileName}` } };
});
