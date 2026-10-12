import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const tilesRoot = resolve(process.cwd(), 'public/panorama-tiles');
const manifests = (await readdir(tilesRoot))
  .filter(file => file.endsWith('.manifest.json'))
  .sort();

let pyramids = 0;
let tiles = 0;
const errors = [];

for (const filename of manifests) {
  const key = filename.slice(0, -'.manifest.json'.length);
  const manifest = JSON.parse(await readFile(resolve(tilesRoot, filename), 'utf8'));
  if (manifest.version !== 2 || manifest.projection !== 'equirectangular') {
    errors.push(`${filename}: manifest không đúng version/projection.`);
    continue;
  }
  if (manifest.overlap !== 2 || manifest.tileSize !== 1024) {
    errors.push(`${filename}: tileSize/overlap không đúng pipeline hiện tại.`);
  }

  for (const level of manifest.levels) {
    for (let y = 0; y < level.rows; y++) {
      for (let x = 0; x < level.cols; x++) {
        const path = resolve(tilesRoot, `${key}_files`, String(level.level), `${x}_${y}.${manifest.format}`);
        try {
          await access(path);
          tiles++;
        } catch {
          errors.push(`${filename}: thiếu ${level.level}/${x}_${y}.${manifest.format}`);
        }
      }
    }
  }
  pyramids++;
}

if (errors.length) {
  console.error(errors.slice(0, 50).join('\n'));
  if (errors.length > 50) console.error(`… và ${errors.length - 50} lỗi khác.`);
  process.exitCode = 1;
} else {
  console.log(`[tiles:validate] OK — ${pyramids} pyramid, ${tiles} tile.`);
}
