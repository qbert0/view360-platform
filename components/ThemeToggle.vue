<script setup lang="ts">
import { computed } from 'vue';
import { useTheme, type ToggleVariant } from '#view360/composables/useTheme';

// Import all toggle components from the package entry point (package.json exports only allows ".")
import {
  Classic, Around, DarkInner, DarkSide, Eclipse,
  Expand, Spin, HalfSun, Horizon, InnerMoon,
  Lightbulb, LightSwitch, Simple, Within,
} from '@theme-toggles/vue';


interface Props {
  /** Size class e.g. "text-2xl", "text-3xl" */
  size?: string;
  /** Animation duration in ms */
  duration?: number;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'text-2xl',
  duration: 400,
});

const { isDark, variant, toggle } = useTheme();

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

const activeComponent = computed(() => COMPONENT_MAP[variant.value] ?? Classic);
</script>

<template>
  <component
    :is="activeComponent"
    :class="[
      props.size,
      'cursor-pointer transition-transform duration-200 hover:scale-110 active:scale-95',
      isDark ? 'dark' : '',
    ]"
    :duration="props.duration"
    title="Chuyển đổi giao diện"
    aria-label="Chuyển đổi giao diện sáng/tối"
    @click="toggle"
  />
</template>
