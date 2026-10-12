import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';

const MANAGED_MEDIA_DIRS: Record<string, string> = {
  '/uploads/': join(process.cwd(), 'public', 'uploads'),
  '/thumbnails/': join(process.cwd(), 'public', 'thumbnails'),
  '/editor-previews/': join(process.cwd(), 'public', 'editor-previews'),
  '/panorama-previews/': join(process.cwd(), 'public', 'panorama-previews'),
  '/panoramas/': join(process.cwd(), 'public', 'panoramas'),
  '/panoramas-mobile/': join(process.cwd(), 'public', 'panoramas-mobile'),
};

interface DeleteMediaBody {
  paths?: string[];
}

/**
 * Delete files created by the admin uploader. Deliberately refuses arbitrary
 * paths and bundled files under public/images.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<DeleteMediaBody>(event);
  const paths = [...new Set(body?.paths ?? [])];
  const deleted: string[] = [];
  const skipped: string[] = [];

  for (const publicPath of paths) {
    const prefix = Object.keys(MANAGED_MEDIA_DIRS).find((candidate) => publicPath.startsWith(candidate));
    if (!prefix) {
      skipped.push(publicPath);
      continue;
    }

    const fileName = basename(publicPath.split(/[?#]/u, 1)[0] ?? '');
    if (!fileName || fileName === '.' || fileName === '..') {
      skipped.push(publicPath);
      continue;
    }

    const filePath = join(MANAGED_MEDIA_DIRS[prefix]!, fileName);
    if (!existsSync(filePath)) {
      skipped.push(publicPath);
      continue;
    }

    await unlink(filePath);
    deleted.push(publicPath);
  }

  return { ok: true, deleted, skipped };
});
