/**
 * In-memory + localStorage stream cache.
 * Caches stream results for 1 hour to avoid re-fetching on every navigation.
 */

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const LS_KEY = "beat_stream_cache";

interface CacheEntry<T> {
  data: T;
  ts: number;
}

// In-memory cache (fastest)
const memCache = new Map<string, CacheEntry<any>>();

function lsRead(): Record<string, CacheEntry<any>> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function lsWrite(store: Record<string, CacheEntry<any>>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch { /* quota exceeded — silently ignore */ }
}

export function getCachedStream<T>(key: string): T | null {
  const now = Date.now();

  // Check memory first
  const mem = memCache.get(key);
  if (mem && now - mem.ts < CACHE_TTL) return mem.data as T;

  // Fallback to localStorage
  const ls = lsRead();
  const entry = ls[key];
  if (entry && now - entry.ts < CACHE_TTL) {
    // Promote to memory
    memCache.set(key, entry);
    return entry.data as T;
  }

  return null;
}

export function setCachedStream<T>(key: string, data: T) {
  const entry: CacheEntry<T> = { data, ts: Date.now() };
  memCache.set(key, entry);

  // Persist to localStorage (prune old entries)
  const ls = lsRead();
  const now = Date.now();
  const pruned: Record<string, CacheEntry<any>> = {};
  for (const [k, v] of Object.entries(ls)) {
    if (now - v.ts < CACHE_TTL) pruned[k] = v;
  }
  pruned[key] = entry;
  lsWrite(pruned);
}

export function clearStreamCache() {
  memCache.clear();
  localStorage.removeItem(LS_KEY);
}
