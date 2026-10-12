import { readFileSync, readdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { TourConfig, TourEntry } from '#view360/types/tour';
import { parseYaml, dumpYaml } from '../content/parser';
import { compileTour } from '../content/compiler';
import { resolveMediaUrls } from '../content/resolver';

// Generated from every canonical YAML file by predev/prebuild. Vercel's
// serverless bundle cannot reliably enumerate process.cwd()/tours at runtime,
// so the complete catalog must be imported statically into the server bundle.
function staticTours(): Record<string, TourConfig> {
  return (useRuntimeConfig().view360Tours ?? {}) as Record<string, TourConfig>;
}

const TOURS_DIR = resolve(process.cwd(), 'tours');

function activeSite(): 'song-van' | 'duc-thuy' {
  return useRuntimeConfig().public.siteId === 'duc-thuy' ? 'duc-thuy' : 'song-van';
}

function belongsToSite(tour: Pick<TourConfig, 'siteId'>): boolean {
  return (tour.siteId ?? 'song-van') === activeSite();
}

/** Parse and return a single tour config by slug */
export function loadTour(slug: string): TourConfig | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  // 1. Try reading disk YAML first (always priority for local dev & saved edits)
  try {
    const filePath = join(TOURS_DIR, `${slug}.yaml`);
    if (existsSync(filePath)) {
      const raw    = readFileSync(filePath, 'utf-8');
      const parsed = parseYaml(raw);
      if (parsed.ok) {
        if (!belongsToSite(parsed.data as TourConfig)) return null;
        const compiled = compileTour(parsed.data);
        if (compiled.ok) {
          return compiled.tour;
        } else {
          console.error(`[yamlLoader] Schema validation failed (${slug}):`, compiled.errors);
        }
      } else {
        console.error(`[yamlLoader] YAML parse error (${slug}):`, parsed.error);
      }
    }
  } catch (e) {
    console.error(`[yamlLoader] Failed to read ${slug}.yaml from disk:`, e);
  }

  // 2. Fallback to native backend TypeScript data (for Vercel serverless build fallback)
  const bundledTours = staticTours();
  if (bundledTours[slug] && belongsToSite(bundledTours[slug])) {
    return JSON.parse(JSON.stringify(bundledTours[slug]));
  }

  return null;
}

/** List all available tours (lightweight — no scenes) */
export function listTours(): TourEntry[] {
  const tourSlugs = new Set<string>(Object.keys(staticTours()));

  // Merge local disk YAML files if available
  try {
    if (existsSync(TOURS_DIR)) {
      const files = readdirSync(TOURS_DIR).filter((f) => f.endsWith('.yaml'));
      for (const file of files) {
        tourSlugs.add(file.replace(/\.yaml$/, ''));
      }
    }
  } catch {}

  const entries: TourEntry[] = [];
  for (const slug of tourSlugs) {
    const tour = loadTour(slug);
    if (tour) {
      const preferredScene = tour.scenes?.find((scene) => scene.id === tour.initialSceneId)
        ?? tour.scenes?.[0];
      entries.push({
        slug: tour.slug,
        title: tour.title,
        location: tour.location,
        summary: tour.summary,
        theme: tour.theme,
        sceneCount: tour.scenes?.length ?? 0,
        firstSceneId: preferredScene?.id,
        cover: tour.scenes?.[0]?.thumbnail,
      });
    }
  }

  return entries;
}

/** Write a tour config back to disk (used by admin in local dev) */
export function saveTour(slug: string, config: TourConfig): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || config.slug !== slug) throw new Error('Invalid tour slug');
  const existingPath = join(TOURS_DIR, `${slug}.yaml`);
  const existing = existsSync(existingPath) ? parseYaml(readFileSync(existingPath, 'utf8')) : null;
  if (existing && (!existing.ok || !belongsToSite(existing.data as TourConfig))) throw new Error('Tour belongs to another site');
  const bundledTours = staticTours();
  if (bundledTours[slug] && !belongsToSite(bundledTours[slug])) throw new Error('Tour belongs to another site');
  if (config.siteId && !belongsToSite(config)) throw new Error('Cannot move tour to another site');
  config = { ...config, siteId: activeSite() };
  // Update in-memory static tour if present
  if (bundledTours[slug]) {
    bundledTours[slug] = JSON.parse(JSON.stringify(config));
  }

  // Admin mutations must reflect a real disk write. Silently swallowing this
  // error makes the UI report success while a reload restores the old YAML.
  const filePath = join(TOURS_DIR, `${slug}.yaml`);
  writeFileSync(filePath, dumpYaml(config), 'utf-8');
}

/** Delete a local YAML tour. Built-in fallback tours cannot be deleted here. */
export function deleteTour(slug: string): 'deleted' | 'not-found' | 'protected' {
  if (!loadTour(slug)) return 'not-found';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'not-found';
  if (Object.prototype.hasOwnProperty.call(staticTours(), slug)) return 'protected';

  const filePath = join(TOURS_DIR, `${slug}.yaml`);
  if (!existsSync(filePath)) return 'not-found';
  unlinkSync(filePath);
  return 'deleted';
}

/** Atomically update markers for a specific scene in the tour config */
export function saveSceneMarkers(
  slug: string,
  sceneId: string,
  markers: TourConfig['scenes'][number]['markers'],
): TourConfig | null {
  const tour = loadTour(slug);
  if (!tour) return null;

  const sceneIndex = tour.scenes.findIndex((s) => s.id === sceneId);
  if (sceneIndex === -1) return null;

  tour.scenes[sceneIndex].markers = markers;
  saveTour(slug, tour);
  return tour;
}
