/**
 * apiPool.ts — Single source of truth for the API endpoint pool.
 *
 * Reading priority (first non-empty array wins):
 *   1. In-memory _pool (set via setApiPool — fastest, zero localStorage reads)
 *   2. localStorage "beat_api_endpoints"  (written by setApiPool for persistence)
 *   3. localStorage "beat_site_settings_cache_v1" → .apiEndpoints
 *      (written automatically by useSiteSettings on every settings load/save)
 *   4. Hardcoded bootstrap default (absolute last resort)
 *
 * useSiteSettings calls setApiPool() whenever settings load or change,
 * so the pool is always warm after the first settings fetch.
 */

const LS_POOL_KEY     = "beat_api_endpoints";
const LS_SETTINGS_KEY = "beat_site_settings_cache_v1";

const BOOTSTRAP = [
  "https://beat-anime-api.onrender.com/api/v1",
  "https://beat-anime-api-2.onrender.com/api/v1",
  "https://beat-anime-api-3.onrender.com/api/v1",
  "https://beat-anime-api-4.onrender.com/api/v1",
];

// In-memory cache — avoids repeated JSON.parse on every request
let _pool: string[] = [];
let _roundRobin = 0;

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Called by useSiteSettings whenever apiEndpoints change.
 * Also persists to localStorage so the pool survives page reloads
 * before useSiteSettings has finished fetching from Supabase.
 */
export function setApiPool(endpoints: string[]): void {
  if (!Array.isArray(endpoints)) return;
  const clean = endpoints.map(e => e.trim()).filter(Boolean);
  if (clean.length === 0) return;
  _pool = clean;
  _roundRobin = 0;
  try { localStorage.setItem(LS_POOL_KEY, JSON.stringify(clean)); } catch {}
}

// ─── Read ──────────────────────────────────────────────────────────────────────

function readFromStorage(): string[] {
  // 1. Dedicated pool key (written by setApiPool)
  try {
    const raw = localStorage.getItem(LS_POOL_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p) && p.length > 0) return p;
    }
  } catch {}

  // 2. Full settings cache (written by useSiteSettings on every save)
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    if (raw) {
      const settings = JSON.parse(raw);
      const eps = settings?.apiEndpoints;
      if (Array.isArray(eps) && eps.length > 0) return eps;
    }
  } catch {}

  return [];
}

/**
 * Returns current pool — reads from memory first, then localStorage,
 * then falls back to bootstrap defaults.
 */
export function getApiPool(): string[] {
  if (_pool.length > 0) return _pool;
  const stored = readFromStorage();
  if (stored.length > 0) {
    _pool = stored; // warm the in-memory cache
    return stored;
  }
  return BOOTSTRAP;
}

/** Round-robin: returns next API base URL */
export function getNextApi(): string {
  const pool = getApiPool();
  const api = pool[_roundRobin % pool.length];
  _roundRobin++;
  return api;
}

/** Legacy compat alias */
export function getApi(index: number): string {
  const pool = getApiPool();
  return pool[index % pool.length];
}

/** Returns a random API from the pool */
export function getRandomApi(): string {
  const pool = getApiPool();
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Returns up to `count` distinct APIs cycling round-robin */
export function pickApis(count: number): string[] {
  const pool = getApiPool();
  if (pool.length <= count) return [...pool];
  const start = _roundRobin % pool.length;
  const picked: string[] = [];
  for (let i = 0; i < count; i++) picked.push(pool[(start + i) % pool.length]);
  _roundRobin += count;
  return picked;
}

/**
 * Race ALL pool APIs — returns first successful JSON response.
 * controller.abort() cancels the rest once one succeeds.
 */
export async function racePool<T>(
  pathFn: (base: string) => string,
  timeoutMs = 12000
): Promise<T> {
  const pool = getApiPool();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let failed = 0;

    pool.forEach((base) => {
      fetch(pathFn(base), { signal: controller.signal })
        .then(res => {
          if (!res.ok) throw new Error(`${res.status}`);
          return res.json() as Promise<T>;
        })
        .then(data => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            controller.abort(); // cancel remaining
            resolve(data);
          }
        })
        .catch(() => {
          failed++;
          if (failed === pool.length && !settled) {
            clearTimeout(timer);
            reject(new Error("All pool APIs failed for: " + pathFn(pool[0])));
          }
        });
    });
  });
}

/**
 * Try pool APIs sequentially — slower but useful for rate-limited endpoints.
 */
export async function sequentialPool<T>(
  pathFn: (base: string) => string,
  timeoutMs = 12000
): Promise<T> {
  const pool = getApiPool();
  const errors: string[] = [];
  for (const base of pool) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(pathFn(base), { signal: controller.signal });
        if (!res.ok) throw new Error(`${res.status}`);
        return await res.json() as T;
      } finally {
        clearTimeout(timer);
      }
    } catch (e: any) {
      errors.push(`${base}: ${e.message}`);
    }
  }
  throw new Error(`All APIs failed:\n${errors.join("\n")}`);
}
