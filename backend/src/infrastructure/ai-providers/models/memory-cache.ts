import type { NormalizedModel } from "../../../domain/ports/provider-models.port.js";

/**
 * Simple TTL-based in-memory cache for provider models.
 * Runs inside a single Cloudflare Workers isolate; entries are evicted on read if stale.
 *
 * IMPORTANT: This cache is NOT shared across parallel Worker instances. Each Worker
 * isolate maintains its own Map, so there is NO consistency between concurrent requests
 * served by different Workers. Use only for user-scoped caching where inconsistency
 * across instances is acceptable.
 */
export class MemoryModelsCache {
  private store = new Map<string, { models: NormalizedModel[]; ts: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): NormalizedModel[] | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts >= this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry.models;
  }

  set(key: string, models: NormalizedModel[]): void {
    this.store.set(key, { models, ts: Date.now() });
  }

  clear(): void {
    this.store.clear();
  }
}
