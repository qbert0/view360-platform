/**
 * workers/media/processor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Media processing worker using Sharp.
 * Runs in a Node.js Worker Thread — never imported by client bundle.
 * Docs: "workers/media — Xử lý ảnh ở tiến trình riêng"
 *
 * Operations:
 *  - generateThumbnail:  full-res → 400×225 WebP thumbnail
 *  - resizeForWeb:       resize keeping aspect, convert to WebP
 *  - getMetadata:        return width, height, format without loading full image
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { workerData, parentPort } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export type ProcessorTask =
  | { op: 'thumbnail';  inputPath: string; outputPath: string }
  | { op: 'resize';     inputPath: string; outputPath: string; width: number; height?: number }
  | { op: 'metadata';   inputPath: string };

export type ProcessorResult =
  | { ok: true;  outputPath?: string; width?: number; height?: number; format?: string }
  | { ok: false; error: string };

async function runTask(task: ProcessorTask): Promise<ProcessorResult> {
  if (!existsSync(task.inputPath)) {
    return { ok: false, error: `File không tồn tại: ${task.inputPath}` };
  }

  try {
    if (task.op === 'metadata') {
      const meta = await sharp(task.inputPath).metadata();
      return { ok: true, width: meta.width, height: meta.height, format: meta.format };
    }

    if (task.op === 'thumbnail') {
      await sharp(task.inputPath)
        .resize(400, 225, { fit: 'cover', position: 'centre' })
        .webp({ quality: 82, effort: 4 })
        .toFile(task.outputPath);
      return { ok: true, outputPath: task.outputPath };
    }

    if (task.op === 'resize') {
      await sharp(task.inputPath)
        .resize(task.width, task.height, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 88, effort: 4 })
        .toFile(task.outputPath);
      return { ok: true, outputPath: task.outputPath };
    }

    return { ok: false, error: `Unknown op: ${(task as any).op}` };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// ── Worker Thread entry point ────────────────────────────────────────────────
// When this file is loaded as a worker, workerData contains the task
if (workerData && parentPort) {
  runTask(workerData as ProcessorTask)
    .then(result => parentPort!.postMessage(result))
    .catch(e   => parentPort!.postMessage({ ok: false, error: String(e) }));
}

// ── Helper to run a task in a new worker thread ────────────────────────────
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

export function runInWorker(task: ProcessorTask): Promise<ProcessorResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: task });
    worker.once('message', resolve);
    worker.once('error',   reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}
