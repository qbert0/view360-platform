<script setup lang="ts">
/**
 * pages/experience/[tourId]/[ownerTourId]/[sceneId].vue
 * ──────────────────────────────────────────────────────────────────────────────
 * Route: /experience/:tourId/:ownerTourId/:sceneId
 * Deep link đến scene cụ thể trong tour.
 * Docs: "Đi thẳng tới scene, giữ ngữ cảnh hành trình gốc"
 * ──────────────────────────────────────────────────────────────────────────────
 */
definePageMeta({ layout: 'experience', ssr: false });

const route = useRoute();

// Redirect to /experience/:tourId?scene=sceneId
// This preserves the entry tour context while opening the specific scene
onMounted(() => {
  const tourId    = route.params.tourId as string;
  const sceneId   = route.params.sceneId as string;
  navigateTo(`/experience/${tourId}?scene=${sceneId}`, { replace: true });
});
</script>

<template>
  <div class="grid h-screen w-full place-items-center bg-ink">
    <div class="flex flex-col items-center gap-4">
      <UiSpinner size="lg" color="primary" />
      <p class="text-sm text-white/50">Đang mở cảnh...</p>
    </div>
  </div>
</template>
