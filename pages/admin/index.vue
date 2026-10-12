<script setup lang="ts">
import type { TourEntry } from '#view360/types/tour';

definePageMeta({ layout: 'editor', ssr: false });
useHead({ title: 'Admin — Quản lý Tour · View360' });

const { data, refresh } = await useFetch<{ items: TourEntry[] }>('/api/tours');
const tours = computed(() => data.value?.items ?? []);
const creatingTour = ref(false);
const deletingTourSlug = ref<string | null>(null);
const { show: showToast } = useToast();

const totalScenes = computed(() =>
  tours.value.reduce((sum, tour) => sum + (tour.sceneCount ?? 0), 0),
);

function adminTourTarget(tour: TourEntry): string {
  return tour.firstSceneId
    ? `/admin/${tour.slug}/${tour.firstSceneId}`
    : `/admin/${tour.slug}`;
}

async function createEmptyTour() {
  if (creatingTour.value) return;
  creatingTour.value = true;
  try {
    const result = await $fetch<{ ok: boolean; slug: string }>('/api/admin/tours', {
      method: 'POST',
    });
    showToast({ message: 'Đã tạo tour rỗng', variant: 'success' });
    await navigateTo(`/admin/${result.slug}`);
  } catch (error: any) {
    const message = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Không thể tạo tour';
    showToast({ message, variant: 'error' });
  } finally {
    creatingTour.value = false;
  }
}

async function deleteSelectedTour(tour: TourEntry) {
  if (deletingTourSlug.value) return;
  if (!confirm(`Xóa tour “${tour.title}”?\n\nFile cấu hình tour sẽ bị xóa và không thể hoàn tác.`)) return;

  deletingTourSlug.value = tour.slug;
  try {
    await $fetch(`/api/admin/tours/${tour.slug}`, { method: 'DELETE' });
    await refresh();
    showToast({ message: `Đã xóa tour “${tour.title}”`, variant: 'success' });
  } catch (error: any) {
    const message = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Không thể xóa tour';
    showToast({ message, variant: 'error' });
  } finally {
    deletingTourSlug.value = null;
  }
}
</script>

<template>
  <div class="min-h-screen bg-[--ui-color-bg] font-[--ui-font-sans]">
    <div class="px-6 py-8">

      <!-- ── Stats bar ──────────────────────────────────────────────────────── -->
      <div class="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <UiCard variant="surface" padding="md">
          <p class="text-xs font-semibold uppercase tracking-wide text-[--ui-color-text-muted]">Tổng tour</p>
          <p class="mt-2 text-3xl font-bold text-[--ui-color-text-primary]">{{ tours.length }}</p>
          <UiBadge variant="primary" size="sm" class="mt-2">đang hoạt động</UiBadge>
        </UiCard>
        <UiCard variant="surface" padding="md">
          <p class="text-xs font-semibold uppercase tracking-wide text-[--ui-color-text-muted]">Tổng cảnh</p>
          <p class="mt-2 text-3xl font-bold text-[--ui-color-text-primary]">{{ totalScenes }}</p>
          <UiBadge variant="success" size="sm" class="mt-2">panoramas</UiBadge>
        </UiCard>
        <UiCard variant="surface" padding="md" class="col-span-2 sm:col-span-1">
          <p class="text-xs font-semibold uppercase tracking-wide text-[--ui-color-text-muted]">Hệ thống</p>
          <div class="mt-2 flex items-center gap-2">
            <UiStatusDot variant="online" :pulse="true" />
            <p class="text-sm font-semibold text-[--ui-color-text-primary]">Hoạt động bình thường</p>
          </div>
          <p class="mt-1 text-xs text-[--ui-color-text-muted]">
            Chỉ hoạt động khi <code class="rounded bg-[--ui-color-bg-muted] px-1 font-mono text-[10px]">ENABLE_ADMIN=true</code>
          </p>
        </UiCard>
      </div>

      <!-- ── Section header ─────────────────────────────────────────────────── -->
      <div class="mb-5 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-[--ui-color-text-primary]">Danh sách Tour</h1>
          <p class="mt-0.5 text-sm text-[--ui-color-text-muted]">Chọn tour để xem và chỉnh sửa các cảnh</p>
        </div>
        <div class="flex items-center gap-3">
          <UiBadge variant="muted">{{ tours.length }} tour</UiBadge>
          <UiButton :loading="creatingTour" @click="createEmptyTour">+ Tạo tour</UiButton>
        </div>
      </div>

      <!-- ── Tour grid ──────────────────────────────────────────────────────── -->
      <div v-if="tours.length" class="grid gap-4 sm:grid-cols-2">
        <div
          v-for="tour in tours"
          :key="tour.slug"
          class="block group cursor-pointer"
          role="link"
          tabindex="0"
          @click="navigateTo(adminTourTarget(tour))"
          @keydown.enter="navigateTo(adminTourTarget(tour))"
        >
          <UiCard variant="surface" padding="md" :hoverable="true" class="h-full transition-all group-hover:ring-[--ui-color-brand]/30">
            <div class="flex items-start justify-between gap-3">
              <!-- Tour icon -->
              <div class="flex items-start gap-3">
                <UiAvatar
                  :name="tour.title"
                  size="md"
                  shape="square"
                />
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-[--ui-color-text-primary] group-hover:text-[--ui-color-brand] transition-colors">
                    {{ tour.title }}
                  </p>
                  <p class="mt-0.5 text-xs text-[--ui-color-text-muted]">{{ tour.location }}</p>
                </div>
              </div>
              <!-- Scene count -->
              <UiBadge variant="default" size="sm" class="shrink-0">
                {{ tour.sceneCount }} cảnh
              </UiBadge>
            </div>

            <!-- Summary -->
            <p class="mt-3 text-xs leading-relaxed text-[--ui-color-text-muted] line-clamp-2">
              {{ tour.summary }}
            </p>

            <!-- Footer tags -->
            <div class="mt-4 flex items-center justify-between">
              <div class="flex gap-2">
                <UiBadge variant="primary" size="sm" pill>
                  {{ tour.theme ?? 'nature' }}
                </UiBadge>
              </div>
              <div class="flex items-center gap-2">
                <UiButton
                  v-if="tour.slug !== 'trang-bay'"
                  variant="danger"
                  size="sm"
                  :loading="deletingTourSlug === tour.slug"
                  @click.stop="deleteSelectedTour(tour)"
                  @keydown.stop
                >Xóa</UiButton>
                <span class="text-xs text-[--ui-color-text-muted] group-hover:text-[--ui-color-brand] transition-colors flex items-center gap-1">
                  Chỉnh sửa
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </span>
              </div>
            </div>
          </UiCard>
        </div>
      </div>

      <!-- ── Empty state ────────────────────────────────────────────────────── -->
      <UiCard v-else variant="outlined" padding="none">
        <UiEmptyState
          icon="🗺️"
          title="Chưa có tour nào"
          description="Tạo một tour rỗng để bắt đầu xây dựng trải nghiệm 360°."
        >
          <template #actions>
            <UiButton size="sm" :loading="creatingTour" @click="createEmptyTour">+ Tạo tour đầu tiên</UiButton>
          </template>
        </UiEmptyState>
      </UiCard>

    </div>
  </div>
</template>
