<script setup lang="ts">
import type { TourConfig, TourScene } from '#view360/types/tour';

definePageMeta({ layout: 'editor', ssr: false });

const route = useRoute();
const slug  = route.params.slug as string;
const firstSceneInput = ref<HTMLInputElement | null>(null);
const addingFirstScene = ref(false);
const firstSceneQueueCurrent = ref(0);
const firstSceneQueueTotal = ref(0);
const firstSceneQueueFileName = ref('');
const firstSceneQueueWaiting = ref(false);
const { show: showToast } = useToast();

const { data } = await useFetch<{ item: TourConfig }>(`/api/tours/${slug}`);
const tour   = computed(() => data.value?.item);
const scenes = computed<TourScene[]>(() => tour.value?.scenes ?? []);

const preferredSceneId = tour.value?.scenes.find((scene) => scene.id === tour.value?.initialSceneId)?.id
  ?? tour.value?.scenes[0]?.id;
if (preferredSceneId) {
  await navigateTo(`/admin/${slug}/${preferredSceneId}`, { replace: true });
}

useHead({ title: computed(() => `${tour.value?.title ?? slug} — Admin · View360`) });

// Marker type counts per scene
const markerCount = (scene: TourScene, plugin?: string) =>
  plugin
    ? scene.markers?.filter(m => m.plugin === plugin).length ?? 0
    : scene.markers?.length ?? 0;

function selectFirstScenePanorama() {
  firstSceneInput.value?.click();
}

async function addFirstScene(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (!files.length || !tour.value || tour.value.scenes.length > 0) {
    input.value = '';
    return;
  }

  addingFirstScene.value = true;
  firstSceneQueueCurrent.value = 0;
  firstSceneQueueTotal.value = files.length;
  let lastAddedSceneId: string | null = null;
  let successCount = 0;
  try {
    for (const [index, file] of files.entries()) {
      firstSceneQueueCurrent.value = index + 1;
      firstSceneQueueFileName.value = file.name;
      firstSceneQueueWaiting.value = false;
      let addedSceneId: string | null = null;
      try {
        const formData = new FormData();
        formData.append('file', file);
        const upload = await $fetch<{
          ok: boolean;
          files: Array<{ original: string; thumbnail: string; editorPreview: string; previewPanorama: string; viewerPanorama: string; mobilePanorama: string }>;
        }>('/api/admin/media', { method: 'POST', body: formData });
        const media = upload.files?.[0];
        if (!media) throw new Error('API không trả về ảnh panorama đã tải lên.');

        const sceneId = `scene-${Date.now().toString(36)}-${index.toString(36)}`;
        const titleFromFile = file.name.replace(/\.[^.]+$/u, '').replace(/[-_]+/gu, ' ').trim();
        const scene: TourScene = {
          id: sceneId,
          title: titleFromFile || (successCount ? 'Cảnh mới' : 'Cảnh đầu tiên'),
          subtitle: '',
          panorama: media.viewerPanorama,
          previewPanorama: media.previewPanorama,
          mobilePanorama: media.mobilePanorama,
          thumbnail: media.thumbnail || media.original,
          editorPanorama: media.editorPreview,
          initialYaw: 0,
          initialPitch: 0,
          initialFov: 75,
          defaultZoomEnabled: false,
          showOnMap: false,
          brightness: 1.25,
          markers: [],
        };
        tour.value.scenes.push(scene);
        addedSceneId = sceneId;
        if (!tour.value.initialSceneId) tour.value.initialSceneId = sceneId;
        await $fetch(`/api/admin/tours/${slug}`, { method: 'POST', body: tour.value });
        lastAddedSceneId = sceneId;
        successCount += 1;
      } catch (error: any) {
        if (addedSceneId) {
          const addedIndex = tour.value.scenes.findIndex(scene => scene.id === addedSceneId);
          if (addedIndex !== -1) tour.value.scenes.splice(addedIndex, 1);
          if (tour.value.initialSceneId === addedSceneId) {
            tour.value.initialSceneId = tour.value.scenes[0]?.id ?? '';
          }
        }
        const message = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Không thể tạo cảnh';
        showToast({ message: `${file.name}: ${message}`, variant: 'error' });
      }

      if (index < files.length - 1) {
        firstSceneQueueWaiting.value = true;
        await new Promise(resolve => window.setTimeout(resolve, 5_000));
      }
    }

    if (successCount && lastAddedSceneId) {
      showToast({ message: `Đã tạo ${successCount}/${files.length} cảnh`, variant: successCount === files.length ? 'success' : 'warning' });
      await navigateTo(`/admin/${slug}/${lastAddedSceneId}`);
    }
  } finally {
    addingFirstScene.value = false;
    firstSceneQueueCurrent.value = 0;
    firstSceneQueueTotal.value = 0;
    firstSceneQueueFileName.value = '';
    firstSceneQueueWaiting.value = false;
    input.value = '';
  }
}
</script>

<template>
  <div class="min-h-screen bg-[--ui-color-bg] font-[--ui-font-sans]">
    <input
      ref="firstSceneInput"
      class="hidden"
      type="file"
      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
      multiple
      @change="addFirstScene"
    >
    <div class="px-6 py-8">
      <!-- Breadcrumb -->
      <div class="mb-6 flex items-center gap-2 text-sm">
        <NuxtLink to="/admin" class="text-[--ui-color-text-muted] hover:text-[--ui-color-text-primary] transition-colors">Admin</NuxtLink>
        <span class="text-[--ui-color-border-strong]">/</span>
        <p class="font-semibold text-[--ui-color-text-primary] truncate">{{ tour?.title ?? slug }}</p>
        <div class="ml-auto">
          <NuxtLink :to="`/experience/${slug}`">
            <UiButton variant="ghost" size="sm">Xem tour →</UiButton>
          </NuxtLink>
        </div>
      </div>

      <!-- ── Tour info header ───────────────────────────────────────────────── -->
      <UiCard variant="surface" padding="md" class="mb-6">
        <div class="flex items-center gap-4">
          <UiAvatar :name="tour?.title ?? slug" size="xl" shape="square" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-xl font-bold text-[--ui-color-text-primary]">{{ tour?.title }}</h1>
              <UiBadge variant="primary" pill>{{ tour?.theme ?? 'nature' }}</UiBadge>
            </div>
            <p class="mt-1 text-sm text-[--ui-color-text-muted]">{{ tour?.location }}</p>
            <div class="mt-2 flex items-center gap-3">
              <UiBadge variant="default">
                {{ scenes.length }} cảnh
              </UiBadge>
              <UiBadge variant="muted">
                {{ scenes.reduce((n, s) => n + (s.markers?.length ?? 0), 0) }} markers
              </UiBadge>
            </div>
          </div>
        </div>
      </UiCard>

      <!-- ── Section label ──────────────────────────────────────────────────── -->
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-base font-semibold text-[--ui-color-text-primary]">Danh sách cảnh</h2>
        <p class="text-xs text-[--ui-color-text-muted]">Nhấn vào cảnh để chỉnh sửa markers</p>
      </div>

      <!-- ── Scene list ─────────────────────────────────────────────────────── -->
      <div v-if="scenes.length" class="space-y-3">
        <NuxtLink
          v-for="(scene, index) in scenes"
          :key="scene.id"
          :to="`/admin/${slug}/${scene.id}`"
          class="block group"
        >
          <UiCard variant="surface" padding="none" :hoverable="true"
            class="overflow-hidden transition-all group-hover:ring-[--ui-color-brand]/25">
            <div class="flex items-center gap-0">

              <!-- Index -->
              <div class="flex h-full w-12 shrink-0 items-center justify-center border-r border-[--ui-color-border] self-stretch">
                <span class="text-sm font-bold tabular-nums text-[--ui-color-text-muted]">
                  {{ String(index + 1).padStart(2, '0') }}
                </span>
              </div>

              <!-- Thumbnail -->
              <div class="shrink-0">
                <img
                  :src="scene.thumbnail"
                  :alt="scene.title"
                  class="h-20 w-32 object-cover"
                />
              </div>

              <!-- Info -->
              <div class="min-w-0 flex-1 px-4 py-3">
                <p class="font-semibold text-[--ui-color-text-primary] group-hover:text-[--ui-color-brand] transition-colors">
                  {{ scene.title }}
                </p>
                <p class="mt-0.5 text-xs text-[--ui-color-text-muted]">{{ scene.subtitle }}</p>
                <!-- Marker badges -->
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <UiBadge
                    v-if="markerCount(scene, 'navigation') > 0"
                    variant="primary" size="sm"
                  >
                    ↑ {{ markerCount(scene, 'navigation') }} nav
                  </UiBadge>
                  <UiBadge
                    v-if="markerCount(scene, 'info') > 0"
                    variant="warning" size="sm"
                  >
                    ⓘ {{ markerCount(scene, 'info') }} info
                  </UiBadge>
                  <UiBadge
                    v-if="markerCount(scene) === 0"
                    variant="muted" size="sm"
                  >
                    Chưa có marker
                  </UiBadge>
                </div>
              </div>

              <!-- Arrow -->
              <div class="shrink-0 pr-4 text-[--ui-color-text-muted] group-hover:text-[--ui-color-brand] transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </div>

            </div>
          </UiCard>
        </NuxtLink>
      </div>

      <!-- Empty -->
      <UiCard v-else variant="outlined" padding="none">
        <UiEmptyState
          icon="🎞️"
          title="Chưa có cảnh nào"
          description="Chọn một ảnh panorama 2:1 để tạo cảnh đầu tiên và mở trình chỉnh sửa."
        >
          <template #actions>
            <UiButton :loading="addingFirstScene" @click="selectFirstScenePanorama">
              + Chọn một hoặc nhiều ảnh
            </UiButton>
            <p v-if="addingFirstScene" class="mt-3 text-xs text-[--ui-color-text-muted]" role="status" aria-live="polite">
              <template v-if="firstSceneQueueWaiting">Đã xong {{ firstSceneQueueCurrent }}/{{ firstSceneQueueTotal }} · nghỉ 5 giây trước ảnh tiếp theo…</template>
              <template v-else>Đang xử lý {{ firstSceneQueueCurrent }}/{{ firstSceneQueueTotal }} · {{ firstSceneQueueFileName }}</template>
            </p>
          </template>
        </UiEmptyState>
      </UiCard>

    </div>
  </div>
</template>
