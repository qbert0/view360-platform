import { fileURLToPath } from 'node:url';

const layerRoot = fileURLToPath(new URL('.', import.meta.url));
const fromLayer = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Shared View360 product layer.
 *
 * Viewer, admin, Three.js engine and their UI live here. Brand applications
 * extend this layer and only provide landing content, media and tour data.
 */
export default defineNuxtConfig({
  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt'],

  runtimeConfig: {
    view360Tours: {},
  },

  experimental: {
    appManifest: false,
  },

  routeRules: {
    '/images/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/uploads/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/thumbnails/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/panoramas/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/panoramas-mobile/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/panorama-previews/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/panorama-tiles/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/panoramas-ktx2/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/basis/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
  },

  app: {
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=Lora:ital,wght@0,500;0,600;1,500&display=swap',
        },
      ],
    },
  },

  alias: {
    '#view360': layerRoot,
  },

  css: [
    fromLayer('./assets/css/main.css'),
    'leaflet/dist/leaflet.css',
  ],

  build: {
    transpile: [
      '@photo-sphere-viewer/core',
      '@photo-sphere-viewer/markers-plugin',
      '@photo-sphere-viewer/plan-plugin',
    ],
  },

  vite: {
    resolve: {
      alias: [
        { find: /^leaflet$/, replacement: 'leaflet/dist/leaflet-src.esm.js' },
      ],
    },
    optimizeDeps: {
      include: [
        'three',
        'leaflet',
        '@photo-sphere-viewer/core',
        '@photo-sphere-viewer/markers-plugin',
        '@photo-sphere-viewer/plan-plugin',
        'js-yaml',
        '@theme-toggles/vue',
      ],
      exclude: ['sharp'],
    },
    ssr: {
      noExternal: [
        'three',
        '@photo-sphere-viewer/core',
        '@photo-sphere-viewer/markers-plugin',
        '@photo-sphere-viewer/plan-plugin',
      ],
      external: ['sharp', 'worker_threads'],
    },
  },

  components: [
    { path: fromLayer('./components/ui'), prefix: 'Ui' },
    { path: fromLayer('./components/experience'), pathPrefix: false },
    { path: fromLayer('./components/editor'), pathPrefix: false },
    { path: fromLayer('./components/designer'), pathPrefix: false },
    { path: fromLayer('./components/viewer'), pathPrefix: false },
    { path: fromLayer('./components/admin'), prefix: 'Admin' },
    { path: fromLayer('./themes'), pathPrefix: true },
    { path: fromLayer('./components'), pathPrefix: false, pattern: '*.vue' },
  ],
});
