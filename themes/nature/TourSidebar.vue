<script setup lang="ts">
import { Binoculars, MapPin, Eye } from 'lucide';
import type { TourConfig, TourScene } from '#view360/types/tour';

const props = defineProps<{
  tour: TourConfig;
  activeScene: TourScene;
}>();

// Morph from Binoculars → Eye when hovering the icon area
import { ref } from 'vue';
const iconHovered = ref(false);
</script>

<template>
  <aside class="order-2 flex w-full flex-col border-t border-white/10 bg-ink lg:order-1 lg:h-screen lg:w-[320px] lg:border-r lg:border-t-0">

    <!-- Header -->
    <div class="relative overflow-hidden px-6 pb-6 pt-7">
      <div class="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-river/20 blur-3xl" />
      <div class="pointer-events-none absolute -bottom-4 left-4 h-24 w-24 rounded-full bg-clay/15 blur-2xl" />

      <div class="relative flex items-start gap-3">
        <!-- Binoculars → Eye morph on hover -->
        <div
          class="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-river/20 ring-1 ring-river/40 cursor-default"
          @mouseenter="iconHovered = true"
          @mouseleave="iconHovered = false"
        >
          <MorphIcon
            :icon="iconHovered ? Eye : Binoculars"
            :size="20"
            spring="bouncy"
            color="rgb(31 111 139)"
          />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] font-bold uppercase tracking-[0.22em] text-river">View360</p>
          <h1 class="mt-0.5 text-xl font-bold leading-tight text-white">{{ tour.title }}</h1>
        </div>
        <!-- Theme toggle in sidebar header -->
        <ThemeToggle size="text-xl" class="mt-0.5 shrink-0" />
      </div>

      <p class="relative mt-4 text-sm leading-6 text-white/55">{{ tour.summary }}</p>

      <div class="relative mt-4 flex items-center gap-2 text-xs text-white/40">
        <MorphIcon :icon="MapPin" :size="14" color="rgb(168 88 63)" />
        <span>{{ tour.location }}</span>
      </div>
    </div>

    <div class="mx-6 h-px bg-white/8" />

    <!-- Active scene -->
    <div class="px-6 py-5">
      <p class="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Đang xem</p>
      <p class="text-base font-semibold text-white">{{ activeScene.title }}</p>
      <p class="mt-0.5 text-xs leading-5 text-white/50">{{ activeScene.subtitle }}</p>
    </div>

    <div class="mx-6 h-px bg-white/8" />

    <!-- Usage guide -->
    <div class="mt-auto px-6 py-5">
      <p class="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Hướng dẫn</p>
      <ul class="grid gap-2">
        <li class="flex items-center gap-2.5 text-xs text-white/50">
          <span class="text-base leading-none">🖱️</span> Kéo để xoay ảnh 360°
        </li>
        <li class="flex items-center gap-2.5 text-xs text-white/50">
          <span class="text-base leading-none">🔵</span> Nút xanh – di chuyển cảnh
        </li>
        <li class="flex items-center gap-2.5 text-xs text-white/50">
          <span class="text-base leading-none">🟠</span> Nút cam – xem thông tin
        </li>
        <li class="flex items-center gap-2.5 text-xs text-white/50">
          <span class="text-base leading-none">🔍</span> Cuộn chuột để zoom
        </li>
      </ul>
    </div>

  </aside>
</template>
