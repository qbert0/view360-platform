<script setup lang="ts">
import type { TourConfig, TourScene } from '#view360/types/tour';
defineProps<{ tour: TourConfig; activeScene: TourScene }>();
</script>

<template>
  <!-- Minimal theme: no sidebar, only a small overlay badge -->
  <div class="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-lg bg-ink/80 px-3 py-2 backdrop-blur-sm ring-1 ring-white/10">
    <span class="text-[10px] font-bold uppercase tracking-widest text-river">View360</span>
    <span class="h-3.5 w-px bg-white/20" />
    <span class="text-xs font-medium text-white/80">{{ activeScene.title }}</span>
    <span class="h-3.5 w-px bg-white/20" />
    <ThemeToggle size="text-base" />
  </div>
</template>
