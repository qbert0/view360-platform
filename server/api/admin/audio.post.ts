import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const AUDIO_DIR = join(process.cwd(), 'public', 'uploads', 'audio');
const ALLOWED_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.ogg', '.aac', '.flac']);
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event);
  const part = parts?.find((item) => item.filename && item.data);
  if (!part?.filename || !part.data) {
    throw createError({ statusCode: 400, statusMessage: 'Không có file âm thanh được gửi lên.' });
  }

  const extension = extname(part.filename).toLowerCase();
  // Some browsers/OSes report generated WAV files as a generic binary stream.
  // The extension allow-list remains the primary validation for local authoring.
  const isAudioMime = part.type?.startsWith('audio/') || part.type === 'application/octet-stream';
  if (!ALLOWED_EXTENSIONS.has(extension) || !isAudioMime) {
    throw createError({ statusCode: 415, statusMessage: 'Chỉ hỗ trợ WAV, MP3, M4A, OGG, AAC hoặc FLAC.' });
  }
  if (part.data.byteLength > MAX_FILE_SIZE) {
    throw createError({ statusCode: 413, statusMessage: 'File âm thanh không được vượt quá 25 MB.' });
  }

  mkdirSync(AUDIO_DIR, { recursive: true });
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
  writeFileSync(join(AUDIO_DIR, fileName), part.data);

  return {
    ok: true,
    file: {
      url: `/uploads/audio/${fileName}`,
      name: part.filename,
      size: part.data.byteLength,
      mimeType: part.type,
    },
  };
});
