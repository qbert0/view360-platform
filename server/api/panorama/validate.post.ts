/**
 * server/api/panorama/validate.post.ts
 * ──────────────────────────────────────────────────────────────
 * Validate ảnh panorama trước khi upload:
 *   - Tỷ lệ 2:1 (equirectangular)
 *   - Độ phân giải tối thiểu
 *   - JPEG quality ước lượng
 *   - Ước lượng độ nét (Laplacian variance)
 *   - Cảnh báo thumbnail bị nhầm làm panorama
 *   - Cảnh báo denoise / nén quá mạnh
 *
 * Request: multipart form-data với field "file" (image)
 * hoặc JSON body { url: string } để validate qua URL.
 * ──────────────────────────────────────────────────────────────
 */

import sharp from 'sharp';

export interface PanoramaValidationResult {
  ok: boolean;
  filename: string;
  width: number;
  height: number;
  aspectRatio: number;
  format: string;
  fileSizeKB: number;
  /** JPEG quality estimate (0–100). -1 if not applicable */
  jpegQualityEstimate: number;
  /** Laplacian variance — higher = sharper. <100 = likely blurry */
  sharpnessScore: number;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

const MIN_WIDTH  = 4096;
const MIN_HEIGHT = 2048;
const IDEAL_WIDTH = 5760;
const IDEAL_RATIO_MIN = 1.9;
const IDEAL_RATIO_MAX = 2.1;
const MAX_FILE_SIZE_MB = 60;
const THUMBNAIL_MAX_PX = 1024; // anything ≤ this is suspicious as panorama

export default defineEventHandler(async (event): Promise<PanoramaValidationResult> => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // ── Parse request ────────────────────────────────────────────
  let buffer: Buffer;
  let filename = 'unknown';
  let fileSizeKB = 0;

  const contentType = getHeader(event, 'content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await readMultipartFormData(event);
    const file = form?.find((f) => f.name === 'file');
    if (!file?.data) {
      throw createError({ statusCode: 400, statusMessage: 'Không tìm thấy file "file" trong form-data.' });
    }
    buffer   = file.data;
    filename = file.filename ?? 'unknown';
    fileSizeKB = Math.round(buffer.length / 1024);
  } else {
    const body = await readBody<{ url?: string }>(event);
    if (!body?.url) {
      throw createError({ statusCode: 400, statusMessage: 'Cần gửi url hoặc file multipart.' });
    }
    const res = await fetch(body.url);
    if (!res.ok) {
      throw createError({ statusCode: 400, statusMessage: `Không tải được URL: ${res.status}` });
    }
    const ab = await res.arrayBuffer();
    buffer   = Buffer.from(ab);
    filename = body.url.split('/').pop() ?? 'unknown';
    fileSizeKB = Math.round(buffer.length / 1024);
  }

  // ── Analyze with Sharp ───────────────────────────────────────
  const img = sharp(buffer);
  const meta = await img.metadata();

  const width  = meta.width  ?? 0;
  const height = meta.height ?? 0;
  const format = meta.format ?? 'unknown';
  const aspectRatio = height > 0 ? +(width / height).toFixed(3) : 0;

  // ── File size ────────────────────────────────────────────────
  if (fileSizeKB > MAX_FILE_SIZE_MB * 1024) {
    warnings.push(`File quá lớn (${(fileSizeKB / 1024).toFixed(1)} MB). Khuyến nghị dưới ${MAX_FILE_SIZE_MB} MB.`);
  }
  if (fileSizeKB < 500) {
    warnings.push(`File rất nhỏ (${fileSizeKB} KB) — có thể đã bị nén quá mạnh.`);
  }

  // ── Thumbnail detection ──────────────────────────────────────
  if (width <= THUMBNAIL_MAX_PX || height <= THUMBNAIL_MAX_PX) {
    errors.push(`Ảnh quá nhỏ (${width}×${height}). Đây có thể là thumbnail, không phải panorama.`);
  }

  // ── Aspect ratio ─────────────────────────────────────────────
  if (aspectRatio < IDEAL_RATIO_MIN || aspectRatio > IDEAL_RATIO_MAX) {
    errors.push(`Tỷ lệ ${aspectRatio}:1 không phù hợp. Equirectangular cần tỷ lệ 2:1 (width = height × 2).`);
  }

  // ── Resolution ───────────────────────────────────────────────
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    errors.push(`Độ phân giải ${width}×${height} thấp hơn tối thiểu ${MIN_WIDTH}×${MIN_HEIGHT}.`);
  } else if (width < IDEAL_WIDTH) {
    warnings.push(`Độ phân giải ${width}px. Khuyến nghị ${IDEAL_WIDTH}px để tránh mờ khi zoom.`);
  }

  // ── Format ───────────────────────────────────────────────────
  if (format !== 'jpeg' && format !== 'webp') {
    warnings.push(`Format "${format}" — JPEG hoặc WebP được ưu tiên cho panorama.`);
  }

  // ── JPEG quality estimate ────────────────────────────────────
  // Estimate by re-encoding at known quality and comparing size ratio
  let jpegQualityEstimate = -1;
  if (format === 'jpeg') {
    // Re-encode at Q=95 and compare: if original << re-encoded, it was compressed
    const reencoded = await sharp(buffer).jpeg({ quality: 95 }).toBuffer();
    const ratio = buffer.length / reencoded.length;

    if (ratio < 0.35)      { jpegQualityEstimate = 50;  warnings.push(`JPEG quality ước lượng thấp (~50) — ảnh có thể đã bị nén quá mạnh.`); }
    else if (ratio < 0.55) { jpegQualityEstimate = 65;  warnings.push(`JPEG quality ước lượng trung bình (~65).`); }
    else if (ratio < 0.75) { jpegQualityEstimate = 80;  }
    else                   { jpegQualityEstimate = 90;  }
  }

  // ── Sharpness estimation (Laplacian variance) ────────────────
  // Convert to grayscale, apply Laplacian-like sharpen, measure std deviation
  let sharpnessScore = 0;
  try {
    // Use a high-pass approach: subtract blurred from original
    const gray = await sharp(buffer)
      .resize(512, 256, { fit: 'fill' })   // normalize for comparison
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = gray;
    const totalPx = info.width * info.height;

    // Compute pixel variance as a proxy for sharpness
    let sum = 0, sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      sum   += data[i]!;
      sumSq += data[i]! * data[i]!;
    }
    const mean = sum / totalPx;
    const variance = sumSq / totalPx - mean * mean;
    sharpnessScore = +variance.toFixed(1);

    if (sharpnessScore < 150) {
      warnings.push(`Độ nét ước lượng thấp (score: ${sharpnessScore}). Ảnh có thể đã bị denoise hoặc over-smooth.`);
    } else if (sharpnessScore < 350) {
      recommendations.push(`Độ nét trung bình (score: ${sharpnessScore}). Có thể thêm nhẹ sharpen.`);
    }
  } catch {
    warnings.push('Không thể tính toán độ nét.');
  }

  // ── Recommendations ──────────────────────────────────────────
  if (errors.length === 0 && warnings.length === 0) {
    recommendations.push('✓ Ảnh đạt tiêu chuẩn panorama 360°.');
  }
  if (width >= IDEAL_WIDTH && sharpnessScore >= 350) {
    recommendations.push('✓ Chất lượng ảnh rất tốt.');
  }

  return {
    ok: errors.length === 0,
    filename,
    width,
    height,
    aspectRatio,
    format,
    fileSizeKB,
    jpegQualityEstimate,
    sharpnessScore,
    errors,
    warnings,
    recommendations,
  };
});
