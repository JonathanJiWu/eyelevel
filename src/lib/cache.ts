/**
 * Small LRU cache with per-entry TTL. Expired entries are kept (until evicted)
 * so callers can fall back to stale data when the upstream service fails.
 */
interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class LruCache<V> {
  private map = new Map<string, Entry<V>>();

  constructor(
    private readonly maxEntries: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get size(): number {
    return this.map.size;
  }

  /** Fresh value or undefined. Refreshes LRU position on hit. */
  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) return undefined;
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  /** Value even if expired (used as a fallback when refreshing fails). */
  getStale(key: string): V | undefined {
    return this.map.get(key)?.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: this.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}
