export interface ByteLruEntry {
  bytes: number;
  lastUsedAt: number;
}

/**
 * Byte-budgeted LRU store modelled after Marzipano's TextureStore lifecycle.
 * It deliberately knows nothing about Three.js: the adapter owns allocation
 * and disposal, while this class owns accounting and recency ordering.
 */
export class TileStore<T extends ByteLruEntry> {
  private readonly items = new Map<string, T>();
  private usedBytes = 0;

  get size(): number { return this.items.size; }
  get totalBytes(): number { return this.usedBytes; }

  has(key: string): boolean { return this.items.has(key); }
  get(key: string): T | undefined { return this.items.get(key); }
  values(): IterableIterator<T> { return this.items.values(); }
  entries(): IterableIterator<[string, T]> { return this.items.entries(); }

  forEach(callback: (value: T, key: string) => void): void {
    this.items.forEach(callback);
  }

  set(key: string, value: T): void {
    const previous = this.items.get(key);
    if (previous) this.usedBytes -= previous.bytes;
    this.items.delete(key);
    this.items.set(key, value);
    this.usedBytes += value.bytes;
  }

  touch(key: string, now: number): T | undefined {
    const value = this.items.get(key);
    if (!value) return undefined;
    value.lastUsedAt = now;
    // Map insertion order is the LRU order.
    this.items.delete(key);
    this.items.set(key, value);
    return value;
  }

  delete(key: string): T | undefined {
    const value = this.items.get(key);
    if (!value) return undefined;
    this.items.delete(key);
    this.usedBytes = Math.max(0, this.usedBytes - value.bytes);
    return value;
  }

  clear(): T[] {
    const values = [...this.items.values()];
    this.items.clear();
    this.usedBytes = 0;
    return values;
  }
}
