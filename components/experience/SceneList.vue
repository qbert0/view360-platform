<script setup lang="ts">
import type { PlaceScene } from '#view360/types/place';

defineProps<{
  scenes: PlaceScene[];
  activeSceneId: string;
}>();

const emit = defineEmits<{ select: [scene: PlaceScene] }>();
</script>

<template>
  <section class="mt-7">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-ink/60">Scenes</h2>
      <span class="text-xs text-ink/45">{{ scenes.length }} stops</span>
    </div>
    <div class="space-y-3">
      <button
        v-for="scene in scenes"
        :key="scene.id"
        type="button"
        class="grid w-full grid-cols-[92px_1fr] gap-3 border p-2 text-left transition hover:border-river"
        :class="scene.id === activeSceneId ? 'border-river bg-white shadow-panel' : 'border-ink/10 bg-white/70'"
        @click="emit('select', scene)"
      >
        <img :src="scene.thumbnail" :alt="scene.title" class="h-20 w-[92px] object-cover" />
        <span class="min-w-0 py-1">
          <span class="block text-sm font-semibold text-ink">{{ scene.title }}</span>
          <span class="mt-1 block text-xs leading-5 text-ink/60">{{ scene.subtitle }}</span>
        </span>
      </button>
    </div>
  </section>
</template>
