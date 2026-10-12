<script setup lang="ts">
/**
 * MorphIcon — thin Vue wrapper around morphicons/vue.
 *
 * Drop-in replacement for any @lucide/vue icon that can animate
 * between two states via spring physics.
 *
 * Usage (static, same icon):
 *   <MorphIcon :icon="Binoculars" :size="20" />
 *
 * Usage (morphing on boolean toggle):
 *   <MorphIcon :icon="isOpen ? X : Menu" :size="20" spring="snappy" />
 *
 * Usage (morph from/to via template ref):
 *   const ref = useTemplateRef<MorphHandle>('icon')
 *   ref.value?.morphTo(SearchIcon, 'bouncy')
 */
import { MorphIcon as _MorphIcon } from 'morphicons/vue';
import type { IconInput, SpringPreset, MorphOptions, MorphHandle } from 'morphicons/vue';

export type { MorphHandle };

interface Props {
  icon?:               IconInput;
  from?:               IconInput;
  to?:                 IconInput;
  progress?:           number;
  spring?:             SpringPreset | MorphOptions;
  size?:               number | string;
  color?:              string;
  strokeWidth?:        number | string;
  absoluteStrokeWidth?: boolean;
  label?:              string;
  reducedMotion?:      'never' | 'user' | 'always';
  class?:              string;
}

withDefaults(defineProps<Props>(), {
  size: 20,
  color: 'currentColor',
  strokeWidth: 2,
  reducedMotion: 'user',
});

defineExpose<{ morphTo?: MorphHandle['morphTo']; set?: MorphHandle['set'] }>({});
</script>

<template>
  <_MorphIcon
    v-bind="$props"
    :class="$props.class"
  />
</template>
