<script setup lang="ts">
import type { PlaceScene } from '#view360/types/place';

const props = defineProps<{
  scene: PlaceScene;
  index: number;
  x: number;
  y: number;
  active: boolean;
  nodeWidth: number;
  nodeHeight: number;
}>();

const emit = defineEmits<{ select: [scene: PlaceScene] }>();

const label = computed(() =>
  props.scene.title.length > 11 ? props.scene.title.slice(0, 10) + '…' : props.scene.title,
);
</script>

<template>
  <g
    :transform="`translate(${x}, ${y})`"
    class="cursor-pointer"
    role="button"
    :aria-label="`Go to ${scene.title}`"
    tabindex="0"
    @click="emit('select', scene)"
    @keydown.enter="emit('select', scene)"
    @keydown.space.prevent="emit('select', scene)"
  >
    <rect
      :width="nodeWidth" :height="nodeHeight" rx="4" stroke-width="1.5"
      :class="active ? 'fill-river stroke-river' : 'fill-white stroke-ink/20 hover:stroke-river/60'"
      class="transition-colors"
    />
    <text x="44" y="22" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="600"
      :class="active ? 'fill-white' : 'fill-ink/45'">
      {{ String(index + 1).padStart(2, '0') }}
    </text>
    <text x="44" y="37" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="500"
      :class="active ? 'fill-white' : 'fill-ink'">
      {{ label }}
    </text>
    <rect x="26" y="46" width="36" height="10" rx="5"
      :class="active ? 'fill-white/20' : 'fill-ink/8'" />
    <text x="44" y="51" text-anchor="middle" dominant-baseline="middle" font-size="8"
      :class="active ? 'fill-white/80' : 'fill-ink/50'">
      {{ scene.hotspots.length }} hotspot{{ scene.hotspots.length !== 1 ? 's' : '' }}
    </text>
  </g>
</template>
