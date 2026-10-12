<script setup lang="ts">
import { ref } from 'vue';
import { useTheme, TOGGLE_VARIANTS, type ToggleVariant } from '#view360/composables/useTheme';
import { X } from 'lucide';

// Import all toggle components from the package entry point
import {
  Classic, Around, DarkInner, DarkSide, Eclipse,
  Expand, Spin, HalfSun, Horizon, InnerMoon,
  Lightbulb, LightSwitch, Simple, Within,
} from '@theme-toggles/vue';


const { isDark, variant, setVariant } = useTheme();

const isOpen = ref(false);

const COMPONENT_MAP: Record<ToggleVariant, unknown> = {
  'classic':      Classic,
  'around':       Around,
  'dark-inner':   DarkInner,
  'dark-side':    DarkSide,
  'eclipse':      Eclipse,
  'expand':       Expand,
  'spin':         Spin,
  'half-sun':     HalfSun,
  'horizon':      Horizon,
  'inner-moon':   InnerMoon,
  'lightbulb':    Lightbulb,
  'light-switch': LightSwitch,
  'simple':       Simple,
  'within':       Within,
};

const VARIANT_LABELS: Record<ToggleVariant, string> = {
  'classic':      'Classic',
  'around':       'Around',
  'dark-inner':   'Dark Inner',
  'dark-side':    'Dark Side',
  'eclipse':      'Eclipse',
  'expand':       'Expand',
  'spin':         'Spin',
  'half-sun':     'Half Sun',
  'horizon':      'Horizon',
  'inner-moon':   'Inner Moon',
  'lightbulb':    'Lightbulb',
  'light-switch': 'Light Switch',
  'simple':       'Simple',
  'within':       'Within',
};

function select(v: ToggleVariant) {
  setVariant(v);
  isOpen.value = false;
}
</script>

<template>
  <!-- Trigger button -->
  <button
    type="button"
    class="flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1.5 text-[11px] font-medium text-white/60 ring-1 ring-white/10 transition hover:bg-white/12 hover:text-white/80 dark:bg-black/20 dark:ring-white/8"
    @click="isOpen = true"
  >
    <span class="text-xs">✨</span>
    <span class="hidden sm:inline">Đổi hiệu ứng</span>
  </button>

  <!-- Backdrop + Modal -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click.self="isOpen = false"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="isOpen = false" />

        <!-- Modal panel -->
        <div
          class="relative z-10 w-full max-w-xl rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl"
        >
          <!-- Header -->
          <div class="mb-5 flex items-center justify-between">
            <div>
              <h2 class="text-base font-semibold text-white">Chọn hiệu ứng Toggle</h2>
              <p class="mt-0.5 text-xs text-white/45">14 hoạt hình từ toggles.dev</p>
            </div>
            <button
              type="button"
              class="grid h-8 w-8 place-items-center rounded-full bg-white/8 text-white/50 transition hover:bg-white/15 hover:text-white"
              @click="isOpen = false"
            >
            <MorphIcon :icon="X" :size="14" spring="snappy" />
            </button>
          </div>

          <!-- Grid of toggles -->
          <div class="grid grid-cols-4 gap-3 sm:grid-cols-7">
            <button
              v-for="v in TOGGLE_VARIANTS"
              :key="v"
              type="button"
              :class="[
                'flex flex-col items-center gap-2 rounded-xl border p-3 transition',
                v === variant
                  ? 'border-river bg-river/10 ring-1 ring-river/40'
                  : 'border-white/8 bg-white/4 hover:border-white/20 hover:bg-white/8',
              ]"
              @click="select(v)"
            >
              <component
                :is="COMPONENT_MAP[v]"
                :class="['text-2xl cursor-pointer', isDark ? 'dark' : '']"
                :duration="400"
                title=""
                aria-label=""
              />
              <span class="text-center text-[9px] leading-tight text-white/50">
                {{ VARIANT_LABELS[v] }}
              </span>
            </button>
          </div>

          <!-- Selected indicator -->
          <p class="mt-4 text-center text-xs text-white/30">
            Đang dùng: <span class="font-semibold text-river">{{ VARIANT_LABELS[variant] }}</span>
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
