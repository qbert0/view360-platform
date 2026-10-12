<script setup lang="ts">
import { computed } from 'vue';
import type { PlaceScene } from '#view360/types/place';

const NODE_W = 88;
const NODE_H = 60;
const H_GAP = 44;
const SVG_H = 100;

const props = defineProps<{
  scenes: PlaceScene[];
  activeSceneId: string;
}>();

const emit = defineEmits<{ select: [scene: PlaceScene] }>();

const svgWidth = computed(() => props.scenes.length * NODE_W + (props.scenes.length - 1) * H_GAP);
const nodeX = (i: number) => i * (NODE_W + H_GAP);
const nodeY = SVG_H / 2 - NODE_H / 2;
</script>

<template>
  <div class="mt-6 overflow-x-auto">
    <p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink/60">Tour flow</p>
    <svg :width="svgWidth" :height="SVG_H" class="block" role="img" aria-label="Scene flow graph">
      <defs>
        <marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" class="fill-ink/30" />
        </marker>
      </defs>
      <line
        v-for="(_, i) in scenes.slice(0, -1)"
        :key="`edge-${i}`"
        :x1="nodeX(i) + NODE_W + 2" :y1="SVG_H / 2"
        :x2="nodeX(i + 1) - 4"     :y2="SVG_H / 2"
        stroke-width="1.5" marker-end="url(#arrow)"
        class="stroke-ink/25"
      />
      <SceneGraphNode
        v-for="(scene, i) in scenes"
        :key="scene.id"
        :scene="scene"
        :index="i"
        :x="nodeX(i)"
        :y="nodeY"
        :active="scene.id === activeSceneId"
        :node-width="NODE_W"
        :node-height="NODE_H"
        @select="emit('select', $event)"
      />
    </svg>
  </div>
</template>
