import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import sharp from 'sharp';

const appRoot = process.cwd();
const toursDir = resolve(appRoot, 'tours');
const uploadsDir = resolve(appRoot, 'public/uploads');
const tilesRoot = resolve(appRoot, 'public/panorama-tiles');
const tileSize = 1024;
const overlap = 2;
const basePanoramaWidth = 2048;
const minimumPanoramaWidth = 4096;
const minimumPanoramaHeight = 2048;
const pipelineVersion = 2;

sharp.cache(false);
sharp.concurrency(1);
await mkdir(tilesRoot, { recursive: true });

const uploads = (await readdir(uploadsDir)).filter(file => /\.(jpe?g|png|webp)$/i.test(file));
const tourFiles = (await readdir(toursDir)).filter(file => file.endsWith('.yaml')).sort();

function sourceForPanorama(panoramaUrl) {
  const outputBase = basename(panoramaUrl, extname(panoramaUrl));
  const sourceBase = outputBase.replace(/-[a-f0-9]{10}$/i, '');
  const exact = uploads.find(file => basename(file, extname(file)) === sourceBase);
  return exact ? resolve(uploadsDir, exact) : null;
}

function yamlBlock(indent, sourceUrl, width, height, maxLevel, key) {
  const minLevel = Math.min(maxLevel, Math.ceil(Math.log2(basePanoramaWidth)) + 1);
  return [
    `${indent}sourcePanorama: ${sourceUrl}`,
    `${indent}multiRes:`,
    `${indent}  enabled: true`,
    `${indent}  sourceWidth: ${width}`,
    `${indent}  sourceHeight: ${height}`,
    `${indent}  tileSize: ${tileSize}`,
    `${indent}  overlap: ${overlap}`,
    `${indent}  minLevel: ${minLevel}`,
    `${indent}  urlTemplate: /panorama-tiles/${key}_files/{level}/{x}_{y}.webp?v=${pipelineVersion}`,
    `${indent}  maxLevel: ${maxLevel}`,
  ].join('\n');
}

function replaceGeneratedMetadata(text, panoramaUrl, metadata) {
  const panoramaLine = `${metadata.indent}panorama: ${panoramaUrl}`;
  const sceneStart = text.indexOf(panoramaLine);
  if (sceneStart < 0) return text;
  const listIndent = metadata.indent.slice(0, Math.max(0, metadata.indent.length - 2));
  const nextScene = text.indexOf(`\n${listIndent}- id:`, sceneStart + panoramaLine.length);
  const sceneEnd = nextScene < 0 ? text.length : nextScene;
  let scene = text.slice(sceneStart, sceneEnd);
  const escapedIndent = metadata.indent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  scene = scene
    .replace(new RegExp(`^${escapedIndent}sourcePanorama:.*\\n?`, 'm'), '')
    .replace(new RegExp(`^${escapedIndent}multiRes:\\n(?:^${escapedIndent}  .*\\n?)*`, 'm'), '');
  scene = scene.replace(
    panoramaLine,
    `${panoramaLine}\n${yamlBlock(
      metadata.indent,
      metadata.sourceUrl,
      metadata.width,
      metadata.height,
      metadata.maxLevel,
      metadata.key,
    )}`,
  );
  return text.slice(0, sceneStart) + scene + text.slice(sceneEnd);
}

function pyramidManifest(key, width, height, maxLevel) {
  const levels = [];
  for (let level = 0; level <= maxLevel; level++) {
    const divisor = 2 ** (maxLevel - level);
    const levelWidth = Math.max(1, Math.ceil(width / divisor));
    const levelHeight = Math.max(1, Math.ceil(height / divisor));
    levels.push({
      level,
      width: levelWidth,
      height: levelHeight,
      cols: Math.ceil(levelWidth / tileSize),
      rows: Math.ceil(levelHeight / tileSize),
    });
  }
  return {
    version: pipelineVersion,
    projection: 'equirectangular',
    format: 'webp',
    sourceWidth: width,
    sourceHeight: height,
    tileSize,
    overlap,
    minLevel: Math.min(maxLevel, Math.ceil(Math.log2(basePanoramaWidth)) + 1),
    maxLevel,
    urlTemplate: `/panorama-tiles/${key}_files/{level}/{x}_{y}.webp?v=${pipelineVersion}`,
    levels,
  };
}

let generated = 0;
for (const tourFile of tourFiles) {
  const yamlPath = resolve(toursDir, tourFile);
  let text = await readFile(yamlPath, 'utf8');
  const panoramaMatches = [...text.matchAll(/^(\s+)panorama:\s*([^\s#]+)\s*$/gm)];

  for (const match of panoramaMatches) {
    const panoramaUrl = match[2];
    const sourcePath = sourceForPanorama(panoramaUrl);
    if (!sourcePath) {
      console.warn(`[tiles] Không tìm thấy ảnh gốc cho ${panoramaUrl}`);
      continue;
    }
    await access(sourcePath);
    const metadata = await sharp(sourcePath, { sequentialRead: true }).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width < minimumPanoramaWidth || height < minimumPanoramaHeight) {
      console.log(
        `[tiles] Bỏ qua ${basename(sourcePath)} (${width}×${height}) — ảnh không đủ lớn để cần streaming.`,
      );
      continue;
    }

    const key = basename(sourcePath, extname(sourcePath));
    const descriptorBasePath = resolve(tilesRoot, key);
    const descriptorPath = `${descriptorBasePath}.dzi`;
    const filesPath = resolve(tilesRoot, `${key}_files`);
    const manifestPath = resolve(tilesRoot, `${key}.manifest.json`);
    let alreadyGenerated = false;
    try {
      const descriptor = await readFile(descriptorPath, 'utf8');
      await access(filesPath);
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      alreadyGenerated = descriptor.includes(`Overlap=\"${overlap}\"`)
        && manifest.version === pipelineVersion
        && manifest.tileSize === tileSize
        && manifest.overlap === overlap
        && manifest.sourceWidth === width
        && manifest.sourceHeight === height;
    } catch {}
    if (!alreadyGenerated) {
      await rm(descriptorPath, { force: true });
      await rm(filesPath, { recursive: true, force: true });
      await rm(manifestPath, { force: true });
      await sharp(sourcePath, { sequentialRead: true, limitInputPixels: false })
        .webp({ quality: 90, effort: 4, smartSubsample: true })
        .tile({
          size: tileSize,
          overlap,
          angle: 0,
          background: '#000000',
          depth: 'onepixel',
          skipBlanks: -1,
          container: 'fs',
          layout: 'dz',
        })
        .toFile(descriptorBasePath);
    }

    const maxLevel = Math.ceil(Math.log2(Math.max(width, height)));
    await writeFile(
      manifestPath,
      `${JSON.stringify(pyramidManifest(key, width, height, maxLevel), null, 2)}\n`,
      'utf8',
    );
    const sourceUrl = `/uploads/${basename(sourcePath)}`;
    const indent = match[1];
    text = replaceGeneratedMetadata(text, panoramaUrl, {
      indent,
      sourceUrl,
      width,
      height,
      maxLevel,
      key,
    });
    generated++;
    console.log(`[tiles] ${generated}: ${key} (${width}×${height}, max level ${maxLevel})${alreadyGenerated ? ' — đã có' : ''}`);
  }
  await writeFile(yamlPath, text, 'utf8');
}

console.log(`[tiles] Hoàn tất ${generated} panorama đa phân giải.`);
