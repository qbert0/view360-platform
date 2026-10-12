/**
 * stores/editor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pinia store for admin scene editor state.
 * Tracks markers, selected marker, undo/redo history, and save state.
 *
 * Docs: "stores/ — Pinia store tách runtime/editor"
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { defineStore } from 'pinia';
import type { TourMarker, NavigationMarker, InfoMarker } from '#view360/types/tour';

const MAX_HISTORY = 50;

export type EditorAddMode = 'view' | 'add-navigation' | 'add-info';

export const useEditorStore = defineStore('editor', () => {
  // ── Marker state ──────────────────────────────────────────────────────────
  const markers     = ref<TourMarker[]>([]);
  const selectedId  = ref<string | null>(null);
  const addMode     = ref<EditorAddMode>('view');

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const undoStack   = ref<TourMarker[][]>([]);
  const redoStack   = ref<TourMarker[][]>([]);

  // ── Save state ────────────────────────────────────────────────────────────
  const saving      = ref(false);
  const saveStatus  = ref<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const saveError   = ref<string | null>(null);

  // ── Dirty tracking ────────────────────────────────────────────────────────
  /** True if markers differ from last save */
  const isDirty     = ref(false);

  // ── Computed ──────────────────────────────────────────────────────────────
  const selectedMarker = computed(() =>
    markers.value.find(m => m.id === selectedId.value) ?? null,
  );
  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Initialize editor with markers from the server */
  function init(initialMarkers: TourMarker[]): void {
    markers.value    = JSON.parse(JSON.stringify(initialMarkers));
    selectedId.value = null;
    addMode.value    = 'view';
    undoStack.value  = [];
    redoStack.value  = [];
    isDirty.value    = false;
    saveStatus.value = 'idle';
    saveError.value  = null;
  }

  /** Snapshot current markers to undo stack before a mutation */
  function _snapshot(): void {
    undoStack.value.push(JSON.parse(JSON.stringify(markers.value)));
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift();
    redoStack.value = []; // clear redo on new action
    isDirty.value = true;
  }

  function addMarker(plugin: 'navigation' | 'info', yaw: number, pitch: number): string {
    _snapshot();
    const id   = `marker-${plugin}-${Date.now()}`;
    const base = {
      id,
      label: plugin === 'navigation' ? 'Điểm đến mới' : 'Thông tin',
      yaw:   parseFloat(yaw.toFixed(3)),
      pitch: parseFloat(pitch.toFixed(3)),
    };
    if (plugin === 'navigation') {
      markers.value.push({ ...base, plugin: 'navigation', targetScene: '' } as NavigationMarker);
    } else {
      markers.value.push({ ...base, plugin: 'info', content: '' } as InfoMarker);
    }
    selectedId.value = id;
    addMode.value    = 'view';
    return id;
  }

  function updateMarker(id: string, updates: Partial<TourMarker>): void {
    const idx = markers.value.findIndex(m => m.id === id);
    if (idx === -1) return;
    _snapshot();
    markers.value[idx] = { ...markers.value[idx], ...updates } as TourMarker;
    if (selectedId.value === id) selectedId.value = id; // keep selected
  }

  function moveMarker(id: string, yaw: number, pitch: number): void {
    const idx = markers.value.findIndex(m => m.id === id);
    if (idx === -1) return;
    // Don't snapshot on drag (too many entries) — use debounce at call site
    markers.value[idx] = {
      ...markers.value[idx],
      yaw:   parseFloat(yaw.toFixed(3)),
      pitch: parseFloat(pitch.toFixed(3)),
    } as TourMarker;
    isDirty.value = true;
  }

  function deleteMarker(id: string): void {
    _snapshot();
    markers.value = markers.value.filter(m => m.id !== id);
    if (selectedId.value === id) selectedId.value = null;
  }

  function selectMarker(id: string | null): void {
    selectedId.value = id;
    addMode.value    = 'view';
  }

  function undo(): void {
    if (!canUndo.value) return;
    redoStack.value.push(JSON.parse(JSON.stringify(markers.value)));
    markers.value = undoStack.value.pop()!;
    isDirty.value = undoStack.value.length > 0;
  }

  function redo(): void {
    if (!canRedo.value) return;
    undoStack.value.push(JSON.parse(JSON.stringify(markers.value)));
    markers.value = redoStack.value.pop()!;
    isDirty.value = true;
  }

  /** Called when markers are saved to server */
  function markSaved(): void {
    isDirty.value    = false;
    saveStatus.value = 'ok';
    saveError.value  = null;
    setTimeout(() => { saveStatus.value = 'idle'; }, 2500);
  }

  function markSaveError(msg: string): void {
    saveStatus.value = 'error';
    saveError.value  = msg;
  }

  return {
    // State
    markers, selectedId, addMode, saving, saveStatus, saveError, isDirty,
    // Computed
    selectedMarker, canUndo, canRedo,
    // Actions
    init, addMarker, updateMarker, moveMarker, deleteMarker,
    selectMarker, undo, redo, markSaved, markSaveError,
  };
});
