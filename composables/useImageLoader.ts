/**
 * composables/useImageLoader.ts
 * Image loading orchestrator — cache, preload, decode, LRU.
 * Đảm bảo ảnh đã sẵn sàng trong bộ nhớ TRƯỚC KHI giao cho PSV.
 */

export interface ImageLoadResult {
  src: string;
  fromCache: boolean;
  loadMs: number;
}

interface CacheEntry {
  src: string;
  promise: Promise<HTMLImageElement>;
  element?: HTMLImageElement;
  lastUsed: number;
}

const DEFAULT_MAX_CACHE = 8;

export function useImageLoader() {
  /** Map src → entry. Bộ nhớ đệm chính */
  const cache = new Map<string, CacheEntry>();

  /** Đang có bao nhiêu ảnh đang tải (tránh nghẽn mạng) */
  let inflight = 0;
  const MAX_CONCURRENT = 3;

  /** Hàng đợi khi vượt ngưỡng concurrent */
  const queue: Array<() => void> = [];

  /**
   * Core: nạp 1 ảnh, trả về khi ảnh đã DECODE xong
   */
  function loadImage(src: string, opts: { decode?: boolean } = {}): Promise<HTMLImageElement> {
    if (!src) return Promise.reject(new Error('Invalid src'));

    // Đã có trong cache
    const existing = cache.get(src);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.promise;
    }

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const run = () => {
        inflight++;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';

        img.onload = async () => {
          try {
            // QUAN TRỌNG: decode() tách khỏi main thread
            // → Không block animation khi ảnh sẵn sàng
            if (opts.decode !== false && 'decode' in img) {
              await img.decode().catch(() => {});
            }
            const entry = cache.get(src);
            if (entry) entry.element = img;
            resolve(img);
          } finally {
            inflight--;
            queue.shift()?.();
          }
        };

        img.onerror = () => {
          inflight--;
          queue.shift()?.();
          cache.delete(src);
          reject(new Error(`Failed to load ${src}`));
        };

        img.src = src;
      };

      // Điều tiết concurrent
      if (inflight < MAX_CONCURRENT) run();
      else queue.push(run);
    });

    const entry: CacheEntry = { src, promise, lastUsed: Date.now() };
    cache.set(src, entry);

    // LRU eviction
    if (cache.size > DEFAULT_MAX_CACHE) {
      const sorted = [...cache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      const toEvict = sorted.slice(0, cache.size - DEFAULT_MAX_CACHE);
      for (const [key] of toEvict) {
        cache.delete(key);
      }
    }

    return promise;
  }

  /**
   * Preload ảnh ngầm (idle) — KHÔNG block bất kỳ thứ gì
   */
  function preloadInBackground(srcs: string[]) {
    if (typeof window === 'undefined') return;

    const idle = (cb: () => void) => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(cb, { timeout: 2000 });
      } else {
        setTimeout(cb, 200);
      }
    };

    srcs.forEach((src, i) => {
      if (!src || cache.has(src)) return;
      idle(() => {
        setTimeout(() => {
          loadImage(src, { decode: false }).catch(() => {});
        }, i * 150);
      });
    });
  }

  /**
   * Preload + resolve promise khi ảnh đã sẵn sàng 100%
   */
  function waitForImage(src: string): Promise<ImageLoadResult> {
    const start = performance.now();
    const fromCache = cache.has(src) && !!cache.get(src)?.element;

    return loadImage(src).then(async (img) => {
      // A background preload intentionally skips decode. Decode on demand so
      // PSV does not have to do this expensive work during the transition.
      if ('decode' in img) await img.decode().catch(() => {});
      return {
        src,
        fromCache,
        loadMs: performance.now() - start,
      };
    });
  }

  /**
   * Kiểm tra ảnh đã trong cache chưa
   */
  function isCached(src: string): boolean {
    return !!cache.get(src)?.element;
  }

  /** Xóa cache */
  function clearCache() {
    cache.clear();
  }

  return {
    loadImage,
    waitForImage,
    preloadInBackground,
    isCached,
    clearCache,
  };
}
