<script setup lang="ts">
/**
 * UiTooltip — Astryx-style floating tooltip triggered on hover/focus.
 * https://astryx.atmeta.com/components/Tooltip
 *
 * Props: content, placement, delay
 */

import { ref, computed } from 'vue';

interface Props {
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

const props = withDefaults(defineProps<Props>(), {
  placement: 'top',
  delay: 400,
});

const visible = ref(false);
let showTimer: ReturnType<typeof setTimeout>;

function show() {
  showTimer = setTimeout(() => { visible.value = true; }, props.delay);
}
function hide() {
  clearTimeout(showTimer);
  visible.value = false;
}

const positionClasses: Record<string, string> = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left:   'right-full top-1/2 -translate-y-1/2 mr-2',
  right:  'left-full top-1/2 -translate-y-1/2 ml-2',
};

const arrowClasses: Record<string, string> = {
  top:    'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-[#1c1c1c] dark:border-t-[#2d2d2d]',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-[#1c1c1c] dark:border-b-[#2d2d2d]',
  left:   'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-[#1c1c1c] dark:border-l-[#2d2d2d]',
  right:  'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-[#1c1c1c] dark:border-r-[#2d2d2d]',
};

const uid = `tooltip-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <div
    class="relative inline-flex"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <!-- Trigger -->
    <div :aria-describedby="visible ? uid : undefined">
      <slot />
    </div>

    <!-- Tooltip bubble -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="visible"
        :id="uid"
        role="tooltip"
        :class="[
          'absolute z-50 whitespace-nowrap pointer-events-none',
          'rounded-[--ui-radius-sm] bg-[#1c1c1c] dark:bg-[#2d2d2d]',
          'px-2.5 py-1.5 text-xs font-medium text-white',
          'shadow-[--ui-shadow-medium]',
          positionClasses[placement],
        ]"
      >
        {{ content }}
        <!-- Arrow -->
        <span
          :class="[
            'absolute h-0 w-0 border-4',
            arrowClasses[placement],
          ]"
        />
      </div>
    </Transition>
  </div>
</template>
