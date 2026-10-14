/**
 * server/content/compiler.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer 2: Validate raw JS object against JSON Schema → typed TourConfig.
 * Uses Ajv for JSON Schema Draft-07 validation.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { TourConfig, TourScene, TourMarker } from '#view360/types/tour';
import { generateAutoMap } from './autoMapGenerator';

// Lazy-load schema — avoid importing JSON at module level in Nitro
let _ajv: Ajv | null = null;
let _validate: ReturnType<Ajv['compile']> | null = null;

function getValidator() {
  if (_validate) return _validate;
  _ajv = new Ajv({ allErrors: true, useDefaults: true });
  addFormats(_ajv as any);

  // Inline schema to avoid fs reads in serverless environments
  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    required: ['slug', 'title', 'location', 'summary', 'scenes'],
    properties: {
      slug:           { type: 'string' },
      siteId:         { type: 'string', minLength: 1 },
      title:          { type: 'string', minLength: 1 },
      location:       { type: 'string', minLength: 1 },
      summary:        { type: 'string', minLength: 1 },
      duration:       { type: 'string' },
      theme:          { type: 'string', enum: ['nature', 'minimal', 'tourism', 'urban'], default: 'nature' },
      initialSceneId: { type: 'string' },
      plugins:        { type: 'array', items: { type: 'string' } },
      mode:           { type: 'string', enum: ['free', 'guided'] },
      guidedDuration: { type: 'number', minimum: 0 },
      autoRotate:     { type: 'boolean' },
      showMinimap:    { type: 'boolean' },
      transition:     { type: 'string', enum: ['crossfade', 'forward', 'fly-through', 'crossfade-pan'] },
      transitionDuration: { type: 'number', minimum: 0 },
      transitionColor: { type: 'string' },
      thumbnailFallbackAfterMs: { type: 'number', minimum: 0 },
      preloadEnabled: { type: 'boolean' },
      preloadRadius:  { type: 'number', minimum: 0 },
      minOverlayMs:   { type: 'number', minimum: 0 },
      scenes: {
        type: 'array', minItems: 0,
        items: {
          type: 'object',
          required: ['id', 'title', 'panorama', 'thumbnail'],
          properties: {
            id:           { type: 'string' },
            title:        { type: 'string', minLength: 1 },
            subtitle:     { type: 'string', default: '' },
            panorama:     { type: 'string', minLength: 1 },
            sourcePanorama: { type: 'string', minLength: 1 },
            previewPanorama: { type: 'string', minLength: 1 },
            mobilePanorama: { type: 'string', minLength: 1 },
            ktx2Panorama: { type: 'string', minLength: 1 },
            multiRes: {
              type: 'object',
              required: ['enabled', 'sourceWidth', 'urlTemplate', 'maxLevel'],
              properties: {
                enabled: { type: 'boolean' },
                sourceWidth: { type: 'number', minimum: 4096 },
                sourceHeight: { type: 'number', minimum: 2048 },
                tileSize: { type: 'number', minimum: 256, maximum: 1024, default: 512 },
                overlap: { type: 'number', minimum: 0, maximum: 8, default: 0 },
                minLevel: { type: 'number', minimum: 1 },
                minFov: { type: 'number', minimum: 20, maximum: 90, default: 55 },
                urlTemplate: { type: 'string', minLength: 1 },
                maxLevel: { type: 'number', minimum: 1 },
              },
            },
            thumbnail:    { type: 'string', minLength: 1 },
            editorPanorama: { type: 'string', minLength: 1 },
            initialYaw:   { type: 'number', default: 0 },
            initialPitch: { type: 'number', default: 0 },
            initialFov:   { type: 'number', minimum: 30, maximum: 150, default: 75 },
            defaultCameraEnabled: { type: 'boolean', default: false },
            defaultZoomEnabled: { type: 'boolean', default: false },
            mobileView: {
              type: 'object',
              properties: {
                initialYaw: { type: 'number' },
                initialPitch: { type: 'number' },
                initialFov: { type: 'number', minimum: 30, maximum: 150 },
                defaultCameraEnabled: { type: 'boolean' },
                defaultZoomEnabled: { type: 'boolean' },
              },
            },
            panoramaRotation: { type: 'number', default: 0 },
            panoramaRoll: { type: 'number', minimum: -0.7854, maximum: 0.7854, default: 0 },
            brightness:   { type: 'number', minimum: 0.5, maximum: 2, default: 1.25 },
            highlightCompression: { type: 'number', minimum: 0, maximum: 1, default: 0 },
            coordinates:  {
              type: 'array', minItems: 2, maxItems: 2,
              items: { type: 'number' },
            },
            showOnMap:    { type: 'boolean', default: false },
            markers:      { type: 'array', default: [] },
            areaHighlights: {
              type: 'array',
              default: [],
              items: {
                type: 'object',
                required: ['id', 'points'],
                properties: {
                  id: { type: 'string', minLength: 1 },
                  points: {
                    type: 'array', minItems: 3,
                    items: {
                      type: 'object', required: ['yaw', 'pitch'],
                      properties: {
                        yaw: { type: 'number' },
                        pitch: { type: 'number', minimum: -1.5708, maximum: 1.5708 },
                      },
                    },
                  },
                  color: { type: 'string' },
                  outlineColor: { type: 'string' },
                  opacity: { type: 'number', minimum: 0, maximum: 1 },
                  delayMs: { type: 'number', minimum: 0 },
                  durationMs: { type: 'number', minimum: 250 },
                  radius: { type: 'number', minimum: 100, maximum: 595 },
                  mode: { type: 'string', enum: ['fill', 'outline', 'fill-outline'] },
                  lineWidth: { type: 'number', minimum: 1, maximum: 24 },
                },
              },
            },
          },
        },
      },
    },
  };

  _validate = _ajv.compile(schema);
  return _validate;
}

export type CompileResult =
  | { ok: true;  tour: TourConfig; warnings: string[] }
  | { ok: false; errors: string[] };

/**
 * Validate and normalize a raw JS object into a typed TourConfig.
 * Applies defaults and catches schema violations.
 */
export function compileTour(raw: unknown): CompileResult {
  const validate = getValidator();
  const valid = validate(raw);

  if (!valid) {
    const errors = (validate.errors ?? []).map(e =>
      `[${e.instancePath || '(root)'}] ${e.message}`,
    );
    return { ok: false, errors };
  }

  // Cast — schema validation ensures shape is correct
  const data = raw as any;
  const warnings: string[] = [];

  // Normalize: ensure all scenes have subtitle and markers array
  const scenes: TourScene[] = (data.scenes as any[]).map((s: any, i: number) => {
    const markers: TourMarker[] = (s.markers ?? []).map((m: any) => {
      // Validate required marker fields
      if (!m.id || !m.plugin || !m.label) {
        warnings.push(`Scene[${i}].markers: marker thiếu id/plugin/label — bị bỏ qua.`);
        return null;
      }
      return m as TourMarker;
    }).filter(Boolean) as TourMarker[];

    return {
      id:           s.id,
      title:        s.title,
      subtitle:     s.subtitle ?? '',
      panorama:     s.panorama,
      sourcePanorama: s.sourcePanorama,
      // Existing uploaded scenes already have a 2K editor panorama. Reuse it
      // as the progressive viewer preview until the tour is uploaded again.
      // `editorPanorama` is intentionally small and belongs exclusively to
      // the admin canvas. Never promote it to the public viewer preview: doing
      // so makes every admin save persist a blurry first-pass texture and the
      // viewer then waits for its idle upgrade before becoming sharp.
      previewPanorama: s.previewPanorama,
      mobilePanorama: s.mobilePanorama,
      ktx2Panorama: s.ktx2Panorama,
      multiRes: s.multiRes,
      thumbnail:    s.thumbnail,
      editorPanorama: s.editorPanorama,
      initialYaw:   s.initialYaw ?? 0,
      initialPitch: s.initialPitch ?? 0,
      initialFov:   s.initialFov ?? 75,
      defaultCameraEnabled: s.defaultCameraEnabled ?? false,
      // Existing tours historically stored zoom under defaultCameraEnabled.
      // Preserve that behaviour while allowing new scenes to control it alone.
      defaultZoomEnabled: s.defaultZoomEnabled ?? s.defaultCameraEnabled ?? false,
      mobileView: s.mobileView,
      panoramaRotation: s.panoramaRotation ?? 0,
      panoramaRoll: s.panoramaRoll ?? 0,
      brightness:   s.brightness ?? 1.25,
      highlightCompression: s.highlightCompression ?? 0,
      coordinates:  s.coordinates,
      showOnMap:    s.showOnMap ?? false,
      markers,
      areaHighlights: s.areaHighlights ?? [],
    } satisfies TourScene;
  });

  // Validate initialSceneId if set
  if (data.initialSceneId) {
    const exists = scenes.some(s => s.id === data.initialSceneId);
    if (!exists) {
      warnings.push(`initialSceneId '${data.initialSceneId}' không tồn tại trong scenes — sẽ dùng scene đầu tiên.`);
    }
  }

  const tour: TourConfig = {
    siteId:        data.siteId,
    slug:          data.slug,
    title:         data.title,
    location:      data.location,
    summary:       data.summary,
    duration:      data.duration,
    theme:         data.theme ?? 'nature',
    initialSceneId: data.initialSceneId,
    plugins:       data.plugins ?? [],
    mode:          data.mode,
    guidedDuration: data.guidedDuration,
    autoRotate:    data.autoRotate,
    showMinimap:   data.showMinimap,
    transition:    data.transition,
    transitionDuration: data.transitionDuration,
    transitionColor: data.transitionColor,
    thumbnailFallbackAfterMs: data.thumbnailFallbackAfterMs,
    preloadEnabled: data.preloadEnabled,
    preloadRadius: data.preloadRadius,
    minOverlayMs: data.minOverlayMs,
    map: data.map ?? generateAutoMap(scenes),
    scenes,
  };

  return { ok: true, tour, warnings };
}
