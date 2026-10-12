<script setup lang="ts">
defineProps<{
  sceneIndex: number;
  sceneCount: number;
  title: string;
  subtitle?: string;
  hidden?: boolean;
}>();

defineEmits<{
  help: [];
  immersive: [];
}>();

const glassButton = 'pointer-events-auto inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-white/15 bg-black/55 text-white backdrop-blur-xl transition duration-200 hover:-translate-y-px hover:border-white/25 hover:bg-black/80 active:translate-y-0 max-sm:size-9 max-sm:rounded-[9px]';
</script>

<template>
  <header
    class="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/65 to-transparent px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top,0px))] transition duration-300 max-sm:gap-2 max-sm:px-2.5 max-sm:pb-2 max-sm:pt-[calc(8px+env(safe-area-inset-top,0px))]"
    :class="hidden ? 'invisible pointer-events-none -translate-y-3 opacity-0' : ''"
  >
    <NuxtLink to="/" :class="glassButton" aria-label="Quay lại danh mục" title="Quay lại trang chủ">
      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="m15 18-6-6 6-6"/>
      </svg>
    </NuxtLink>

    <div class="pointer-events-auto flex h-10 min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-[10px] border border-white/15 bg-black/55 px-3.5 backdrop-blur-xl max-sm:h-9 max-sm:gap-2 max-sm:rounded-[9px] max-sm:px-2.5">
      <span class="inline-flex shrink-0 items-center rounded-full border border-[#1f6f8b]/40 bg-[#1f6f8b]/25 px-2 py-0.5 font-mono text-[10px] font-bold tracking-[.05em] text-[#7ec8e3]">
        {{ sceneIndex }}/{{ sceneCount }}
      </span>
      <span class="truncate text-sm font-semibold text-white max-sm:text-[13px]">{{ title }}</span>
      <span v-if="subtitle" class="truncate text-xs text-white/40 max-[380px]:hidden max-sm:text-[11px]">· {{ subtitle }}</span>
    </div>

    <div class="pointer-events-auto flex shrink-0 gap-2">
      <button type="button" :class="glassButton" title="Hướng dẫn sử dụng" @click="$emit('help')">
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </button>
      <button type="button" :class="glassButton" title="Chế độ toàn cảnh (nhấn F)" @click="$emit('immersive')">
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
      </button>
    </div>
  </header>
</template>
