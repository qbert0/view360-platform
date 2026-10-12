/**
 * useTheme - Manages dark/light mode state for View360.
 * Persists preference to localStorage and syncs the `dark` class on <html>.
 */

import { ref, computed, readonly } from 'vue';

// Toggle variant types available from @theme-toggles/vue
export type ToggleVariant =
  | 'classic'
  | 'around'
  | 'dark-inner'
  | 'dark-side'
  | 'eclipse'
  | 'expand'
  | 'spin'
  | 'half-sun'
  | 'horizon'
  | 'inner-moon'
  | 'lightbulb'
  | 'light-switch'
  | 'simple'
  | 'within';

export const TOGGLE_VARIANTS: ToggleVariant[] = [
  'classic',
  'around',
  'dark-inner',
  'dark-side',
  'eclipse',
  'expand',
  'spin',
  'half-sun',
  'horizon',
  'inner-moon',
  'lightbulb',
  'light-switch',
  'simple',
  'within',
];

const THEME_KEY   = 'view360:theme';
const VARIANT_KEY = 'view360:toggle-variant';

// ── Singleton state ─────────────────────────────────────────────────────────
const isDark    = ref(false);
const variant   = ref<ToggleVariant>('classic');
let initialized = false;

function applyTheme(dark: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', dark);
}

function init() {
  if (initialized) return;
  initialized = true;

  // Read persisted variant
  const savedVariant = localStorage.getItem(VARIANT_KEY) as ToggleVariant | null;
  if (savedVariant && TOGGLE_VARIANTS.includes(savedVariant)) {
    variant.value = savedVariant;
  }

  // Read persisted theme – fallback to system preference
  const saved        = localStorage.getItem(THEME_KEY);
  const prefersDark  = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark         = saved !== null ? saved === 'dark' : prefersDark;

  isDark.value = dark;
  applyTheme(dark);
}

// ── Composable ──────────────────────────────────────────────────────────────
export function useTheme() {
  if (import.meta.client) {
    init();
  }

  function toggle() {
    isDark.value = !isDark.value;
    applyTheme(isDark.value);
    localStorage.setItem(THEME_KEY, isDark.value ? 'dark' : 'light');
  }

  function setVariant(v: ToggleVariant) {
    variant.value = v;
    localStorage.setItem(VARIANT_KEY, v);
  }

  const label = computed(() => (isDark.value ? 'Chuyển sang sáng' : 'Chuyển sang tối'));

  return {
    isDark: readonly(isDark),
    variant: readonly(variant),
    toggle,
    setVariant,
    label,
  };
}
