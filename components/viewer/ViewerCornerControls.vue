<script setup lang="ts">
const props = withDefaults(defineProps<{
  mapAvailable: boolean;
  mapVisible: boolean;
  hidden?: boolean;
  logoSize?: 'small' | 'medium' | 'large';
}>(), {
  logoSize: 'large',
});

defineEmits<{
  toggleMap: [];
  toggleInfo: [];
  share: [];
}>();

const buttonClass = 'grid size-[42px] place-items-center rounded-full border border-white/15 bg-black/55 text-white/70 shadow-md backdrop-blur-xl transition duration-200 hover:scale-110 hover:border-white/25 hover:bg-black/80 hover:text-white active:scale-95 max-sm:size-[38px]';
const logoSizeClasses = {
  small: 'w-[160px] max-sm:w-[96px]',
  medium: 'w-[208px] max-sm:w-[120px]',
  large: 'w-[264px] max-sm:w-[150px]',
} as const;
</script>

<template>
  <div
    class="pointer-events-none absolute inset-0 z-[22] transition duration-300"
    :class="hidden ? 'invisible pointer-events-none opacity-0' : ''"
  >
    <div
      class="viewer-corner-buttons pointer-events-auto absolute left-5 flex flex-col gap-2 duration-300 max-sm:left-3"
      :class="mapVisible ? 'bottom-[252px]' : 'bottom-5'"
    >
      <button
        v-if="mapAvailable"
        type="button"
        :class="[buttonClass, mapVisible && '!border-white/30 !bg-[#1f6f8b] !text-white']"
        title="Bật/tắt bản đồ"
        aria-label="Bật/tắt bản đồ"
        @click="$emit('toggleMap')"
      >
        <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/>
          <line x1="9" y1="3" x2="9" y2="18"/>
          <line x1="15" y1="6" x2="15" y2="21"/>
        </svg>
      </button>

      <button type="button" :class="buttonClass" title="Thông tin địa điểm" aria-label="Thông tin địa điểm" @click="$emit('toggleInfo')">
        <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <circle cx="12" cy="7" r="1.8" fill="currentColor" stroke="none"/>
          <path d="M12 11 L12 18"/>
        </svg>
      </button>

      <button type="button" :class="buttonClass" title="Chia sẻ" aria-label="Chia sẻ" @click="$emit('share')">
        <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"/>
          <circle cx="6" cy="12" r="3"/>
          <circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
      </button>
    </div>

    <div
      class="viewer-corner-logo pointer-events-none absolute bottom-[1px] right-[1px]"
      :class="logoSizeClasses[props.logoSize]"
      aria-label="Memory Group"
    >
      <img class="block h-auto w-full object-contain" src="/icons/logo/memory gruop trắng.png" alt="Memory Group" />
    </div>
  </div>
</template>

<style scoped>
@media (max-width: 640px) {
  .viewer-corner-buttons {
    top: calc(60px + env(safe-area-inset-top, 0px));
    bottom: auto !important;
  }

  .viewer-corner-logo {
    right: max(1px, env(safe-area-inset-right, 0px));
    bottom: max(1px, env(safe-area-inset-bottom, 0px));
  }
}

@media (max-width: 900px) and (orientation: landscape) {
  .viewer-corner-buttons {
    top: auto;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;
  }
}
</style>
