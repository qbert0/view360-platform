/**
 * stores/runtime.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pinia store for the viewer runtime state.
 * Tracks active tour, active scene, navigation history, and loading state.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { defineStore } from 'pinia';
import type { TourConfig, TourScene } from '#view360/types/tour';

// ── Inline navigation state (previously in core/runtime/navigation.ts) ────────

interface SceneRef { tourId: string; sceneId: string }

interface NavigationState {
  entryTourId: string;
  current: SceneRef;
  history: SceneRef[];
}

function createNavigationState(tourId: string, sceneId: string): NavigationState {
  return { entryTourId: tourId, current: { tourId, sceneId }, history: [] };
}

function navTo(state: NavigationState, dest: SceneRef): NavigationState {
  return {
    ...state,
    current: dest,
    history: state.history.length < 50
      ? [...state.history, state.current]
      : [...state.history.slice(1), state.current],
  };
}

function navBack(state: NavigationState): NavigationState {
  if (!state.history.length) return state;
  const prev = state.history[state.history.length - 1]!;
  return { ...state, current: prev, history: state.history.slice(0, -1) };
}

function canGoBackFn(state: NavigationState): boolean {
  return state.history.length > 0;
}

function isInGuestTourFn(state: NavigationState): boolean {
  return state.current.tourId !== state.entryTourId;
}

// ── Inline scene resolvers (previously in core/runtime/resolver.ts) ───────────

function resolveScene(tour: TourConfig, sceneId: string): TourScene | undefined {
  return tour.scenes.find((s) => s.id === sceneId);
}

function resolveInitialScene(tour: TourConfig, preferredId?: string): TourScene {
  if (preferredId) {
    const found = tour.scenes.find((s) => s.id === preferredId);
    if (found) return found;
  }
  const initial = tour.initialSceneId
    ? tour.scenes.find((s) => s.id === tour.initialSceneId)
    : undefined;
  return initial ?? tour.scenes[0]!;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useRuntimeStore = defineStore('runtime', () => {
  // ── State ─────────────────────────────────────────────────────────────────

  /** Currently loaded tour data (scenes only — no WebGL refs) */
  const tour    = ref<TourConfig | null>(null);
  const loading = ref(false);
  const error   = ref<string | null>(null);

  /** Navigation stack */
  const navState = ref<NavigationState | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────────

  const activeScene = computed<TourScene | undefined>(() => {
    if (!tour.value || !navState.value) return undefined;
    if (navState.value.current.tourId === tour.value.slug) {
      return resolveScene(tour.value, navState.value.current.sceneId);
    }
    return undefined;
  });

  const activeSceneId  = computed(() => navState.value?.current.sceneId ?? '');
  const activeTourId   = computed(() => navState.value?.current.tourId ?? '');
  const entryTourId    = computed(() => navState.value?.entryTourId ?? '');
  const canGoBack      = computed(() => navState.value ? canGoBackFn(navState.value) : false);
  const inGuestTour    = computed(() => navState.value ? isInGuestTourFn(navState.value) : false);
  const scenes         = computed<TourScene[]>(() => tour.value?.scenes ?? []);
  const sceneIndex     = computed(() => {
    if (!navState.value || !tour.value) return 0;
    return tour.value.scenes.findIndex((s) => s.id === activeSceneId.value) + 1;
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  async function loadTour(tourId: string, preferredSceneId?: string): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    error.value   = null;

    try {
      const res = await $fetch<{ item: TourConfig }>(`/api/tours/${tourId}`);
      if (!res.item) throw new Error('Tour không tồn tại.');

      tour.value = res.item;

      const initial = resolveInitialScene(res.item, preferredSceneId);
      navState.value = createNavigationState(tourId, initial.id);
    } catch (e: any) {
      error.value = e?.data?.statusMessage ?? e?.message ?? 'Lỗi tải tour.';
    } finally {
      loading.value = false;
    }
  }

  function navigateTo(sceneId: string, tourId?: string): void {
    if (!navState.value) return;
    navState.value = navTo(navState.value, {
      tourId:  tourId ?? tour.value?.slug ?? '',
      sceneId,
    });
  }

  function goBack(): void {
    if (!navState.value) return;
    navState.value = navBack(navState.value);
  }

  function reset(): void {
    tour.value     = null;
    navState.value = null;
    loading.value  = false;
    error.value    = null;
  }

  return {
    // State
    tour, loading, error, navState,
    // Computed
    activeScene, activeSceneId, activeTourId, entryTourId,
    canGoBack, inGuestTour, scenes, sceneIndex,
    // Actions
    loadTour, navigateTo, goBack, reset,
  };
});
