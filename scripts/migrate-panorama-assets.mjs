import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import sharp from 'sharp';

const appRoot = process.cwd();
const toursDir = resolve(appRoot, 'tours');
const publicDir = resolve(appRoot, 'public');
const outputDirs = {
  desktop: resolve(publicDir, 'panoramas'),
  mobile: resolve(publicDir, 'panoramas-mobile'),
  preview: resolve(publicDir, 'panorama-previews'),
};

sharp.cache(false);
sharp.concurrency(1);

for (const directory of Object.values(outputDirs)) {
  await mkdir(directory, { recursive: true });
}

const { readdir } = await import('node:fs/promises');
const tourFiles = (await readdir(toursDir))
  .filter(file => file.endsWith('.yaml'))
  .sort();

const plans = [];
const yamlUpdates = new Map();

for (const tourFile of tourFiles) {
  const yamlPath = resolve(toursDir, tourFile);
  const sourceText = await readFile(yamlPath, 'utf8');
  const lines = sourceText.split('\n');
  const output = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = /^(\s*)panorama:\s*(.*?)\s*$/.exec(line);
    if (!match) {
      output.push(line);
      continue;
    }

    const indent = match[1];
    const sourceUrl = match[2].replace(/^['"]|['"]$/g, '');
    if (
      !sourceUrl.startsWith('/')
      || sourceUrl.startsWith('/panoramas/')
      || sourceUrl.startsWith('//')
    ) {
      output.push(line);
      continue;
    }

    const sourcePath = resolve(publicDir, `.${sourceUrl}`);
    await access(sourcePath);
    const sourceBase = basename(sourceUrl, extname(sourceUrl))
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 52) || 'panorama';
    const hash = createHash('sha1').update(sourceUrl).digest('hex').slice(0, 10);
    const outputName = `${sourceBase}-${hash}.webp`;
    const urls = {
      desktop: `/panoramas/${outputName}`,
      mobile: `/panoramas-mobile/${outputName}`,
      preview: `/panorama-previews/${outputName}`,
    };

    plans.push({ sourcePath, outputName, sourceUrl });
    output.push(`${indent}panorama: ${urls.desktop}`);

    // Replace existing generated variant fields if this script is rerun.
    while (/^\s+(previewPanorama|mobilePanorama):/.test(lines[index + 1] ?? '')) {
      index++;
    }
    output.push(`${indent}previewPanorama: ${urls.preview}`);
    output.push(`${indent}mobilePanorama: ${urls.mobile}`);
  }

  yamlUpdates.set(yamlPath, `${output.join('\n').replace(/\n+$/u, '')}\n`);
}

const uniquePlans = [...new Map(plans.map(plan => [plan.sourceUrl, plan])).values()];
console.log(`[panorama-migrate] Chuẩn bị xử lý ${uniquePlans.length} panorama.`);

let completed = 0;
for (const plan of uniquePlans) {
  const desktopPath = resolve(outputDirs.desktop, plan.outputName);
  const mobilePath = resolve(outputDirs.mobile, plan.outputName);
  const previewPath = resolve(outputDirs.preview, plan.outputName);

  await sharp(plan.sourcePath, { sequentialRead: true })
    .resize(5760, 2880, { fit: 'fill', withoutEnlargement: true })
    .webp({ quality: 84, effort: 4 })
    .toFile(desktopPath);
  await sharp(plan.sourcePath, { sequentialRead: true })
    .resize(4096, 2048, { fit: 'fill', withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toFile(mobilePath);
  await sharp(plan.sourcePath, { sequentialRead: true })
    .resize(2048, 1024, { fit: 'fill', withoutEnlargement: true })
    .webp({ quality: 68, effort: 4 })
    .toFile(previewPath);

  completed++;
  console.log(`[panorama-migrate] ${completed}/${uniquePlans.length} ${plan.sourceUrl}`);
}

// YAML is changed only after every image variant was generated successfully.
for (const [yamlPath, content] of yamlUpdates) {
  await writeFile(yamlPath, content, 'utf8');
}

console.log(`[panorama-migrate] Hoàn tất ${uniquePlans.length} panorama và ${yamlUpdates.size} file YAML.`);
