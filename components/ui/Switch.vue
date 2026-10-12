<script setup lang="ts">
/**
 * UiSwitch — Astryx-style toggle switch.
 * https://astryx.atmeta.com/components/Switch
 *
 * v-model: boolean
 * Sizes: sm | md
 */

import { computed } from 'vue';

interface Props {
  modelValue?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  label?: string;
  id?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  disabled: false,
  size: 'md',
});

const emit = defineEmits<{ 'update:modelValue': [val: boolean] }>();

const uid = props.id ?? `switch-${Math.random().toString(36).slice(2, 8)}`;

const sizeMap = {
  sm: { track: 'w-8 h-5',   thumb: 'h-3.5 w-3.5', translate: 'translate-x-3.5' },
  md: { track: 'w-11 h-6',  thumb: 'h-4.5 w-4.5',  translate: 'translate-x-5' },
};

const s = computed(() => sizeMap[props.size]);
</script>

<template>
  <label
    :for="uid"
    :class="[
      'inline-flex items-center gap-3',
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    ]"
  >
    <!-- Track -->
    <button
      :id="uid"
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :disabled="disabled"
      :class="[
        'relative shrink-0 rounded-full transition-colors duration-[--ui-transition-base]',
        'outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[--ui-color-brand]',
        s.track,
        modelValue ? 'bg-[--ui-color-brand]' : 'bg-[--ui-color-bg-muted] ring-1 ring-[--ui-color-border]',
      ]"
      @click="!disabled && emit('update:modelValue', !modelValue)"
    >
      <!-- Thumb -->
      <span
        :class="[
          'absolute top-1/2 left-0.5 -translate-y-1/2 rounded-full bg-white shadow-sm',
          'transition-transform duration-[--ui-transition-base]',
          s.thumb,
          modelValue ? s.translate : 'translate-x-0',
        ]"
      />
    </button>
    <!-- Label -->
    <span v-if="label" class="text-sm text-[--ui-color-text-primary] select-none">{{ label }}</span>
    <slot />
  </label>
</template>
