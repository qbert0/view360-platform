<script setup lang="ts">
/**
 * UiTextInput — Astryx-style text input with label, hint and error state.
 * https://astryx.atmeta.com/components/TextInput
 *
 * v-model: string
 * Sizes: sm | md | lg
 */

import { computed, useId } from 'vue';

interface Props {
  modelValue?: string;
  label?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  type?: string;
  id?: string;
  required?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  size: 'md',
  type: 'text',
});

const emit = defineEmits<{
  'update:modelValue': [val: string];
  focus: [e: FocusEvent];
  blur: [e: FocusEvent];
}>();

const uid = props.id ?? `input-${Math.random().toString(36).slice(2, 8)}`;
const hintId = `${uid}-hint`;

const sizeClasses: Record<string, string> = {
  sm: 'h-8  px-3 text-xs  rounded-[--ui-radius-sm]',
  md: 'h-10 px-3 text-sm  rounded-[--ui-radius-sm]',
  lg: 'h-12 px-4 text-base rounded-[--ui-radius-md]',
};

const hasError = computed(() => !!props.error);
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <!-- Label -->
    <label
      v-if="label"
      :for="uid"
      :class="[
        'text-sm font-medium leading-none',
        hasError ? 'text-[--ui-color-error]' : 'text-[--ui-color-text-primary]',
      ]"
    >
      {{ label }}
      <span v-if="required" class="ml-0.5 text-[--ui-color-error]" aria-hidden="true">*</span>
    </label>

    <!-- Input wrapper -->
    <div class="relative flex items-center">
      <!-- Leading slot -->
      <div v-if="$slots.leading" class="pointer-events-none absolute left-3 text-[--ui-color-text-muted]">
        <slot name="leading" />
      </div>

      <input
        :id="uid"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :aria-describedby="hint || error ? hintId : undefined"
        :aria-invalid="hasError || undefined"
        :class="[
          'w-full bg-[--ui-color-surface] text-[--ui-color-text-primary]',
          'ring-1 outline-none transition-all duration-[--ui-transition-fast]',
          'placeholder:text-[--ui-color-text-muted]',
          'focus:ring-2',
          hasError
            ? 'ring-[--ui-color-error] focus:ring-[--ui-color-error]'
            : 'ring-[--ui-color-border] focus:ring-[--ui-color-brand]',
          disabled ? 'opacity-50 cursor-not-allowed bg-[--ui-color-bg-muted]' : '',
          sizeClasses[size],
          $slots.leading ? 'pl-9' : '',
          $slots.trailing ? 'pr-9' : '',
        ]"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @focus="emit('focus', $event)"
        @blur="emit('blur', $event)"
      />

      <!-- Trailing slot -->
      <div v-if="$slots.trailing" class="pointer-events-none absolute right-3 text-[--ui-color-text-muted]">
        <slot name="trailing" />
      </div>
    </div>

    <!-- Hint / Error -->
    <p
      v-if="error || hint"
      :id="hintId"
      :class="[
        'text-xs leading-relaxed',
        hasError ? 'text-[--ui-color-error]' : 'text-[--ui-color-text-muted]',
      ]"
    >
      {{ error || hint }}
    </p>
  </div>
</template>
