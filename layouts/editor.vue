<script setup lang="ts">
/**
 * layouts/editor.vue
 * ────────────────────────────────────────────────────────────────────
 * Admin / Editor layout — nền sáng, sidebar nav cố định bên trái.
 * Docs: "editor trung tính để dễ làm việc"
 * ────────────────────────────────────────────────────────────────────
 */

const route = useRoute();

const navItems = [
  { to: '/admin', label: 'Tổng quan', icon: '⊞' },
];

// Highlight active based on route prefix
const isActive = (to: string) =>
  to === '/admin' ? route.path === '/admin' : route.path.startsWith(to);
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-[--ui-color-bg] font-[--ui-font-sans]">

    <!-- ── Left sidebar nav ─────────────────────────────────────────────── -->
    <aside class="flex h-full w-56 shrink-0 flex-col border-r border-[--ui-color-border] bg-[--ui-color-surface]">

      <!-- Brand -->
      <div class="flex h-14 items-center gap-2.5 border-b border-[--ui-color-border] px-4">
        <div class="grid h-7 w-7 place-items-center rounded-[--ui-radius-xs] bg-[--ui-color-brand] text-white text-[10px] font-bold">
          V<span class="text-[7px] align-super">360</span>
        </div>
        <div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-[--ui-color-brand]">Admin</p>
          <p class="text-xs font-semibold text-[--ui-color-text-primary] leading-none">View360</p>
        </div>
      </div>

      <!-- Nav -->
      <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :class="[
            'flex items-center gap-2.5 rounded-[--ui-radius-sm] px-3 py-2 text-sm transition-colors',
            isActive(item.to)
              ? 'bg-[--ui-color-brand-muted] text-[--ui-color-brand] font-medium'
              : 'text-[--ui-color-text-secondary] hover:bg-[--ui-color-bg-muted] hover:text-[--ui-color-text-primary]',
          ]"
        >
          <span class="text-base leading-none">{{ item.icon }}</span>
          {{ item.label }}
        </NuxtLink>
      </nav>

      <!-- Footer links -->
      <div class="border-t border-[--ui-color-border] px-3 py-3 space-y-1">
        <NuxtLink to="/">
          <UiButton variant="ghost" size="sm" class="w-full justify-start">
            <template #icon-leading>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/></svg>
            </template>
            Xem catalog
          </UiButton>
        </NuxtLink>
        <div class="flex items-center justify-between px-2 py-1">
          <span class="text-xs text-[--ui-color-text-muted]">Theme</span>
          <ThemeToggle size="text-base" />
        </div>
      </div>
    </aside>

    <!-- ── Main content area ─────────────────────────────────────────────── -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>

  </div>
</template>
