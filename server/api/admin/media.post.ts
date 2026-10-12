/**
 * server/api/admin/media.post.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin API: Upload image → process with Sharp worker → return URLs.
 * Route: POST /api/admin/media
 * Protected by server/middleware/admin-auth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import sharp from 'sharp';

const UPLOAD_DIR    = join(process.cwd(), 'public', 'uploads');
const THUMBNAIL_DIR = join(process.cwd(), 'public', 'thumbnails');
const EDITOR_PREVIEW_DIR = join(process.cwd(), 'public', 'editor-previews');
const PANORAMA_PREVIEW_DIR = join(process.cwd(), 'public', 'panorama-previews');
const PANORAMA_DIR = join(process.cwd(), 'public', 'panoramas');
const MOBILE_PANORAMA_DIR = join(process.cwd(), 'public', 'panoramas-mobile');
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_FILE_SIZE = 60 * 1024 * 1024;

// The development server runs on the same machine as the browser. Avoid
// libvips retaining decoded tiles between admin uploads and process one image
// pipeline at a time to keep peak resident memory predictable.
sharp.cache(false);
sharp.concurrency(1);

export default defineEventHandler(async (event) => {
  // Ensure directories exist
  try { mkdirSync(UPLOAD_DIR,    { recursive: true }); } catch {}
  try { mkdirSync(THUMBNAIL_DIR, { recursive: true }); } catch {}
  try { mkdirSync(EDITOR_PREVIEW_DIR, { recursive: true }); } catch {}
  try { mkdirSync(PANORAMA_PREVIEW_DIR, { recursive: true }); } catch {}
  try { mkdirSync(PANORAMA_DIR, { recursive: true }); } catch {}
  try { mkdirSync(MOBILE_PANORAMA_DIR, { recursive: true }); } catch {}

  // Read multipart body
  const body = await readMultipartFormData(event);
  if (!body?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Không có file nào được gửi lên.' });
  }

  const results: Array<{
    original:  string;
    thumbnail: string;
    editorPreview: string;
    previewPanorama: string;
    viewerPanorama: string;
    mobilePanorama: string;
    width?:    number;
    height?:   number;
  }> = [];

  for (const part of body) {
    if (!part.data || !part.filename) continue;

    const ext = extname(part.filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw createError({ statusCode: 415, statusMessage: 'Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.' });
    }
    if (part.data.byteLength > MAX_FILE_SIZE) {
      throw createError({ statusCode: 413, statusMessage: 'Ảnh không được vượt quá 60 MB.' });
    }

    let meta: sharp.Metadata;
    try {
      meta = await sharp(part.data, { failOn: 'error' }).metadata();
    } catch (error: any) {
      throw createError({ statusCode: 422, statusMessage: `Không thể đọc ảnh: ${error?.message ?? String(error)}` });
    }
    if (!meta.width || !meta.height) {
      throw createError({ statusCode: 422, statusMessage: 'Ảnh không có kích thước hợp lệ.' });
    }

    const baseName = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fileName = `${baseName}${ext}`;
    const thumbName = `${baseName}.webp`;
    const editorPreviewName = `${baseName}.webp`;
    const panoramaPreviewName = `${baseName}.webp`;
    const viewerPanoramaName = `${baseName}.webp`;
    const mobilePanoramaName = `${baseName}.webp`;

    const inputPath  = join(UPLOAD_DIR,    fileName);
    const thumbPath  = join(THUMBNAIL_DIR, thumbName);
    const editorPreviewPath = join(EDITOR_PREVIEW_DIR, editorPreviewName);
    const panoramaPreviewPath = join(PANORAMA_PREVIEW_DIR, panoramaPreviewName);
    const viewerPanoramaPath = join(PANORAMA_DIR, viewerPanoramaName);
    const mobilePanoramaPath = join(MOBILE_PANORAMA_DIR, mobilePanoramaName);

    // Keep the original panorama untouched and generate only a lightweight preview.
    writeFileSync(inputPath, part.data);
    try {
      await sharp(part.data)
        .resize(400, 225, { fit: 'cover', position: 'centre' })
        .webp({ quality: 82, effort: 4 })
        .toFile(thumbPath);
      await sharp(part.data, { sequentialRead: true })
        .resize(2048, 1024, { fit: 'fill', withoutEnlargement: true })
        .webp({ quality: 86, effort: 3 })
        .toFile(editorPreviewPath);
      await sharp(part.data, { sequentialRead: true })
        .resize(2048, 1024, { fit: 'fill', withoutEnlargement: true })
        .webp({ quality: 68, effort: 4 })
        .toFile(panoramaPreviewPath);
      await sharp(part.data, { sequentialRead: true })
        .resize(5760, 2880, { fit: 'fill', withoutEnlargement: true })
        .webp({ quality: 84, effort: 4 })
        .toFile(viewerPanoramaPath);
      await sharp(part.data, { sequentialRead: true })
        .resize(4096, 2048, { fit: 'fill', withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toFile(mobilePanoramaPath);
    } catch (error: any) {
      throw createError({ statusCode: 500, statusMessage: `Lỗi tạo thumbnail: ${error?.message ?? String(error)}` });
    }

    results.push({
      original:  `/uploads/${fileName}`,
      thumbnail: `/thumbnails/${thumbName}`,
      editorPreview: `/editor-previews/${editorPreviewName}`,
      previewPanorama: `/panorama-previews/${panoramaPreviewName}`,
      viewerPanorama: `/panoramas/${viewerPanoramaName}`,
      mobilePanorama: `/panoramas-mobile/${mobilePanoramaName}`,
      width: meta.width,
      height: meta.height,
    });
  }

  return { ok: true, files: results };
});
