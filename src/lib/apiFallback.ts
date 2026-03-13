/**
 * apiFallback.ts
 * Multi-provider fallback system for anime streams, info, and search.
 *
 * Priority order:
 *   1. hianime   (primary scraper — fast, best coverage)
 *   2. animelok  (broad multi-language catalog)
 *   3. animeya   (secondary scraper)
 *   4. watchaw   (tertiary scraper)
 *   5. desidubanime / toonstream (last-resort specialty scrapers)
 *
 * All providers are on the SAME backend pool (beat-anime-api clones).
 * Response shapes differ between scrapers — each provider has its own
 * normalizer so callers always receive a consistent NormalizedStream /
 * NormalizedAnimeInfo shape.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FallbackTrack {
  file: string;
  label: string;
  kind: "subtitles" | "captions";
  default?: boolean;
}

export interface FallbackStream {
  url: string;
  type: "hls" | "iframe";
  tracks: FallbackTrack[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  server: string;
  category: string;
  provider: string;
}

export interface FallbackAnimeInfo {
  id: string;
  name: string;
  poster?: string;
  description?: string;
  episodes?: { sub?: number; dub?: number };
  rating?: string;
  type?: string;
  status?: string;
  genres?: string[];
  provider: string;
}

export interface FallbackEpisode {
  number: number;
  episodeId: string;
  title?: string;
  isFiller?: boolean;
}

// ─── API Pool helpers ─────────────────────────────────────────────────────────

function getApiPool(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem("beat_api_endpoints") || "[]");
    if (Array.isArray(stored) && stored.length > 0) return stored;
  } catch {}
  return [
    "https://beat-anime-api.onrender.com/api/v1",
    "https://beat-anime-api-2.onrender.com/api/v1",
    "https://beat-anime-api-3.onrender.com/api/v1",
    "https://beat-anime-api-4.onrender.com/api/v1",
  ];
}

/** Round-robin: picks a random API from the pool */
function pickApi(): string {
  const pool = getApiPool();
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Try a fetch against ALL pool APIs and return first success */
async function racePool<T>(
  pathFn: (base: string) => string,
  timeoutMs = 12000
): Promise<T> {
  const pool = getApiPool();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const promises = pool.map(async (base) => {
      const res = await fetch(pathFn(base), { signal: controller.signal });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json() as Promise<T>;
    });
    const results = await Promise.allSettled(promises);
    const ok = results.find((r) => r.status === "fulfilled");
    if (ok && ok.status === "fulfilled") return ok.value;
    throw new Error("All pool APIs failed");
  } finally {
    clearTimeout(timer);
  }
}

// ─── Track normalizer (shared) ────────────────────────────────────────────────

function normalizeTracks(raw: any[]): FallbackTrack[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => {
      const k = (t.kind || t.lang || t.label || "").toLowerCase();
      return k !== "thumbnails" && k !== "thumbnail";
    })
    .map((t) => ({
      file: t.file || t.url || "",
      label: t.label || t.lang || "Unknown",
      kind: (t.kind === "captions" ? "captions" : "subtitles") as "subtitles" | "captions",
      default: t.default || false,
    }))
    .filter((t) => !!t.file);
}

// ─── Provider 1 — HiAnime ─────────────────────────────────────────────────────

async function streamFromHianime(
  episodeId: string,
  category: "sub" | "dub",
  server: "hd-1" | "hd-2"
): Promise<FallbackStream> {
  const data = await racePool<any>(
    (base) =>
      `${base}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${server}&category=${category}`
  );

  const d = data?.data || data;
  const sources: any[] = d?.sources || [];
  const hls = sources.find((s: any) => s.type === "hls" || (s.url || "").includes(".m3u8"));
  if (!hls?.url) throw new Error("hianime: no HLS source");

  return {
    url: hls.url,
    type: "hls",
    tracks: normalizeTracks(d?.tracks || []),
    intro: d?.intro ?? undefined,
    outro: d?.outro ?? undefined,
    server,
    category,
    provider: "hianime",
  };
}

// ─── Provider 2 — Animelok ────────────────────────────────────────────────────

/**
 * Animelok's /watch/:id returns:
 *   { data: { streams: [{ url, isM3U8, subtitles }], intro, outro } }
 */
async function streamFromAnimelok(
  animeId: string,
  episodeNumber: number
): Promise<FallbackStream> {
  // Animelok uses slug-based IDs — strip ?ep=N from hianime episodeId
  const slug = animeId.split("?")[0];
  const watchId = `${slug}-episode-${episodeNumber}`;

  const data = await racePool<any>((base) => `${base}/animelok/watch/${encodeURIComponent(watchId)}`);

  const d = data?.data || data;
  const streams: any[] = d?.streams || d?.sources || [];
  const hls = streams.find((s: any) => s.isM3U8 || (s.url || "").includes(".m3u8")) || streams[0];
  if (!hls?.url) throw new Error("animelok: no stream");

  const rawTracks: any[] = d?.subtitles || d?.tracks || [];
  return {
    url: hls.url,
    type: "hls",
    tracks: normalizeTracks(rawTracks),
    intro: d?.intro ?? undefined,
    outro: d?.outro ?? undefined,
    server: "animelok",
    category: "sub",
    provider: "animelok",
  };
}

/**
 * Animelok anime info:
 *   /animelok/anime/:id → { data: { title, image, description, episodes, genres } }
 */
async function infoFromAnimelok(slug: string): Promise<FallbackAnimeInfo> {
  const data = await racePool<any>((base) => `${base}/animelok/anime/${encodeURIComponent(slug)}`);
  const d = data?.data || data;
  return {
    id: slug,
    name: d?.title || d?.name || slug,
    poster: d?.image || d?.poster,
    description: d?.description || d?.synopsis,
    episodes: { sub: d?.episodes?.sub ?? d?.totalEpisodes },
    rating: d?.rating,
    type: d?.type,
    status: d?.status,
    genres: d?.genres || [],
    provider: "animelok",
  };
}

// ─── Provider 3 — AnimeYa ─────────────────────────────────────────────────────

/**
 * AnimeYa /watch/:episodeId returns:
 *   { data: { sources: [{ url, isM3U8 }], subtitles, intro, outro } }
 */
async function streamFromAnimeya(episodeId: string): Promise<FallbackStream> {
  const data = await racePool<any>(
    (base) => `${base}/animeya/watch/${encodeURIComponent(episodeId)}`
  );

  const d = data?.data || data;
  const sources: any[] = d?.sources || d?.streams || [];
  const hls = sources.find((s: any) => s.isM3U8 || (s.url || "").includes(".m3u8")) || sources[0];
  if (!hls?.url) throw new Error("animeya: no stream");

  return {
    url: hls.url,
    type: "hls",
    tracks: normalizeTracks(d?.subtitles || d?.tracks || []),
    intro: d?.intro ?? undefined,
    outro: d?.outro ?? undefined,
    server: "animeya",
    category: "sub",
    provider: "animeya",
  };
}

/**
 * AnimeYa /info/:slug
 */
async function infoFromAnimeya(slug: string): Promise<FallbackAnimeInfo> {
  const data = await racePool<any>((base) => `${base}/animeya/info/${encodeURIComponent(slug)}`);
  const d = data?.data || data;
  return {
    id: slug,
    name: d?.title || d?.name || slug,
    poster: d?.image || d?.poster || d?.cover,
    description: d?.description || d?.synopsis,
    episodes: { sub: d?.totalEpisodes ?? d?.episodes?.total },
    rating: d?.rating,
    type: d?.type,
    status: d?.status,
    genres: Array.isArray(d?.genres) ? d.genres : [],
    provider: "animeya",
  };
}

// ─── Provider 4 — WatchAnimeWorld ─────────────────────────────────────────────

/**
 * watchaw /episode?slug=...&ep=N
 */
async function streamFromWatchaw(slug: string, epNumber: number): Promise<FallbackStream> {
  const data = await racePool<any>(
    (base) => `${base}/watchaw/episode?slug=${encodeURIComponent(slug)}&ep=${epNumber}`
  );

  const d = data?.data || data;
  const sources: any[] = d?.sources || d?.streams || [];
  const hls =
    sources.find((s: any) => s.isM3U8 || (s.url || "").includes(".m3u8")) || sources[0];
  if (!hls?.url) throw new Error("watchaw: no stream");

  return {
    url: hls.url,
    type: "hls",
    tracks: normalizeTracks(d?.subtitles || d?.captions || []),
    intro: d?.intro ?? undefined,
    outro: d?.outro ?? undefined,
    server: "watchaw",
    category: "sub",
    provider: "watchaw",
  };
}

// ─── Provider 5 — DesiDubAnime (Hindi specialty) ──────────────────────────────

/**
 * /desidubanime/watch/:id — for Hindi fallback only
 */
async function streamFromDesiDub(id: string): Promise<FallbackStream> {
  const data = await racePool<any>((base) => `${base}/desidubanime/watch/${encodeURIComponent(id)}`);
  const d = data?.data || data;
  const sources: any[] = d?.sources || d?.streams || [];
  const hls =
    sources.find((s: any) => s.isM3U8 || (s.url || "").includes(".m3u8")) || sources[0];
  if (!hls?.url) throw new Error("desidubanime: no stream");

  return {
    url: hls.url,
    type: "hls",
    tracks: normalizeTracks(d?.subtitles || d?.tracks || []),
    server: "desidubanime",
    category: "dub",
    provider: "desidubanime",
  };
}

// ─── Search fallbacks ─────────────────────────────────────────────────────────

export interface FallbackSearchResult {
  id: string;
  name: string;
  poster?: string;
  type?: string;
  episodes?: { sub?: number; dub?: number };
  provider: string;
}

async function searchHianime(query: string, page = 1): Promise<FallbackSearchResult[]> {
  const data = await racePool<any>(
    (base) => `${base}/hianime/search?q=${encodeURIComponent(query)}&page=${page}`
  );
  return (data?.data?.animes || []).map((a: any) => ({
    id: a.id,
    name: a.name,
    poster: a.poster,
    type: a.type,
    episodes: a.episodes,
    provider: "hianime",
  }));
}

async function searchAnimelok(query: string): Promise<FallbackSearchResult[]> {
  const data = await racePool<any>(
    (base) => `${base}/animelok/search?q=${encodeURIComponent(query)}`
  );
  const results = data?.data?.results || data?.data || [];
  return results.map((a: any) => ({
    id: a.id || a.slug,
    name: a.title || a.name,
    poster: a.image || a.poster,
    type: a.type,
    provider: "animelok",
  }));
}

async function searchAnimeya(query: string): Promise<FallbackSearchResult[]> {
  const data = await racePool<any>(
    (base) => `${base}/animeya/search?q=${encodeURIComponent(query)}`
  );
  const results = data?.data?.results || data?.data || [];
  return results.map((a: any) => ({
    id: a.id || a.slug,
    name: a.title || a.name,
    poster: a.image || a.poster || a.cover,
    type: a.type,
    provider: "animeya",
  }));
}

// ─── Public API: Stream with fallback chain ───────────────────────────────────

export interface StreamFallbackOptions {
  episodeId: string;         // hianime episodeId (e.g. "naruto-60?ep=1234")
  category?: "sub" | "dub"; // defaults to "sub"
  server?: "hd-1" | "hd-2"; // preferred server
  episodeNumber?: number;    // needed for non-hianime providers
  animeSlug?: string;        // needed for watchaw / animeya fallbacks
  hindiOnly?: boolean;       // if true, only try dub-capable providers
}

/**
 * getStreamWithFallback
 *
 * Tries providers in order and returns the first working stream.
 * Throws only if ALL providers fail.
 *
 * Usage (drop-in replacement in WatchPage / HindiWatchPage):
 *
 *   import { getStreamWithFallback } from "@/lib/apiFallback";
 *   const stream = await getStreamWithFallback({ episodeId, category: "sub" });
 *   // stream.url is always the HLS URL
 */
export async function getStreamWithFallback(
  opts: StreamFallbackOptions
): Promise<FallbackStream> {
  const {
    episodeId,
    category = "sub",
    server = "hd-2",
    episodeNumber = 1,
    animeSlug,
    hindiOnly = false,
  } = opts;

  const slug = animeSlug || episodeId.split("?")[0];
  const errors: string[] = [];

  // ── 1. HiAnime (primary) ──────────────────────────────────────────────────
  if (!hindiOnly) {
    for (const srv of [server, server === "hd-2" ? "hd-1" : "hd-2"] as const) {
      try {
        return await streamFromHianime(episodeId, category, srv);
      } catch (e: any) {
        errors.push(`hianime/${srv}: ${e.message}`);
      }
    }
  }

  // ── 2. Animelok ───────────────────────────────────────────────────────────
  if (!hindiOnly) {
    try {
      return await streamFromAnimelok(slug, episodeNumber);
    } catch (e: any) {
      errors.push(`animelok: ${e.message}`);
    }
  }

  // ── 3. AnimeYa ────────────────────────────────────────────────────────────
  if (!hindiOnly) {
    try {
      return await streamFromAnimeya(episodeId);
    } catch (e: any) {
      errors.push(`animeya: ${e.message}`);
    }
  }

  // ── 4. WatchAnimeWorld ────────────────────────────────────────────────────
  if (!hindiOnly) {
    try {
      return await streamFromWatchaw(slug, episodeNumber);
    } catch (e: any) {
      errors.push(`watchaw: ${e.message}`);
    }
  }

  // ── 5. DesiDubAnime (Hindi/Dub last resort) ───────────────────────────────
  if (category === "dub" || hindiOnly) {
    try {
      return await streamFromDesiDub(slug);
    } catch (e: any) {
      errors.push(`desidubanime: ${e.message}`);
    }
  }

  throw new Error(`All stream providers failed:\n${errors.join("\n")}`);
}

// ─── Public API: Anime info with fallback chain ───────────────────────────────

/**
 * getAnimeInfoWithFallback
 *
 * Falls back from hianime → animelok → animeya when info fetch fails.
 * Returns a normalised FallbackAnimeInfo — NOT the full hianime shape.
 * Primarily useful as a last-resort when the main api.getAnimeInfo fails.
 */
export async function getAnimeInfoWithFallback(slug: string): Promise<FallbackAnimeInfo> {
  const errors: string[] = [];

  try {
    return await infoFromAnimelok(slug);
  } catch (e: any) {
    errors.push(`animelok: ${e.message}`);
  }

  try {
    return await infoFromAnimeya(slug);
  } catch (e: any) {
    errors.push(`animeya: ${e.message}`);
  }

  throw new Error(`All info providers failed:\n${errors.join("\n")}`);
}

// ─── Public API: Search with fallback chain ───────────────────────────────────

/**
 * searchWithFallback
 *
 * Tries hianime search first, then merges/dedupes results from animelok
 * and animeya if hianime returns 0 results.
 */
export async function searchWithFallback(
  query: string,
  page = 1
): Promise<FallbackSearchResult[]> {
  // Always try hianime first
  try {
    const results = await searchHianime(query, page);
    if (results.length > 0) return results;
  } catch {}

  // Parallel fallback from animelok + animeya
  const [lok, ya] = await Promise.allSettled([
    searchAnimelok(query),
    searchAnimeya(query),
  ]);

  const combined: FallbackSearchResult[] = [
    ...(lok.status === "fulfilled" ? lok.value : []),
    ...(ya.status === "fulfilled" ? ya.value : []),
  ];

  // Dedupe by normalised name
  const seen = new Set<string>();
  return combined.filter((r) => {
    const key = r.name.toLowerCase().replace(/\s+/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Public API: Home data with fallback ─────────────────────────────────────

export interface FallbackHomeSection {
  trending: FallbackSearchResult[];
  latest: FallbackSearchResult[];
  popular: FallbackSearchResult[];
  provider: string;
}

export async function getHomeWithFallback(): Promise<FallbackHomeSection> {
  // Try animelok home first as fallback (hianime home is handled by main api.ts)
  try {
    const data = await racePool<any>((base) => `${base}/animelok/home`);
    const d = data?.data || data;
    const toResult = (arr: any[], provider = "animelok"): FallbackSearchResult[] =>
      (arr || []).map((a: any) => ({
        id: a.id || a.slug,
        name: a.title || a.name,
        poster: a.image || a.poster,
        type: a.type,
        provider,
      }));
    return {
      trending: toResult(d?.trending || d?.featured || []),
      latest: toResult(d?.latestEpisodes || d?.latest || []),
      popular: toResult(d?.popular || []),
      provider: "animelok",
    };
  } catch {}

  // Last resort: hindidubbed home
  try {
    const data = await racePool<any>((base) => `${base}/hindidubbed/home`);
    const d = data?.data || data;
    const toResult = (arr: any[]): FallbackSearchResult[] =>
      (arr || []).map((a: any) => ({
        id: a.id || a.slug,
        name: a.title || a.name,
        poster: a.image || a.poster,
        provider: "hindidubbed",
      }));
    return {
      trending: toResult(d?.featured || []),
      latest: toResult(d?.latest || []),
      popular: toResult(d?.popular || []),
      provider: "hindidubbed",
    };
  } catch {}

  return { trending: [], latest: [], popular: [], provider: "none" };
}

// ─── Public API: Schedule with fallback ──────────────────────────────────────

export interface FallbackScheduleItem {
  id: string;
  name: string;
  poster?: string;
  time?: string;
  episode?: number;
}

export async function getScheduleWithFallback(
  date: string
): Promise<FallbackScheduleItem[]> {
  // Try animelok schedule
  try {
    const data = await racePool<any>(
      (base) => `${base}/animelok/schedule?date=${date}`
    );
    const items: any[] = data?.data?.scheduledAnimes || data?.data || [];
    return items.map((a: any) => ({
      id: a.id || a.slug,
      name: a.title || a.name,
      poster: a.image || a.poster,
      time: a.time || a.airingTime,
      episode: a.episode,
    }));
  } catch {}

  return [];
}

// ─── Utility: probe all providers for a given episodeId ──────────────────────

/**
 * probeAllProviders
 *
 * Diagnostic helper — tries every provider and returns results keyed by
 * provider name. Useful in AdminDashboard health checks.
 *
 * Example:
 *   const probe = await probeAllProviders({ episodeId: "naruto-60?ep=1234", episodeNumber: 1 });
 *   // { hianime: { ok: true, ms: 320 }, animelok: { ok: false, error: "..." }, ... }
 */
export async function probeAllProviders(opts: StreamFallbackOptions): Promise<
  Record<string, { ok: boolean; ms?: number; error?: string }>
> {
  const { episodeId, category = "sub", server = "hd-2", episodeNumber = 1 } = opts;
  const slug = opts.animeSlug || episodeId.split("?")[0];

  const probe = async (
    name: string,
    fn: () => Promise<FallbackStream>
  ): Promise<[string, { ok: boolean; ms?: number; error?: string }]> => {
    const t = performance.now();
    try {
      await fn();
      return [name, { ok: true, ms: Math.round(performance.now() - t) }];
    } catch (e: any) {
      return [name, { ok: false, ms: Math.round(performance.now() - t), error: e.message }];
    }
  };

  const results = await Promise.allSettled([
    probe("hianime/hd-2", () => streamFromHianime(episodeId, category, "hd-2")),
    probe("hianime/hd-1", () => streamFromHianime(episodeId, category, "hd-1")),
    probe("animelok", () => streamFromAnimelok(slug, episodeNumber)),
    probe("animeya", () => streamFromAnimeya(episodeId)),
    probe("watchaw", () => streamFromWatchaw(slug, episodeNumber)),
  ]);

  return Object.fromEntries(
    results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<[string, any]>).value)
  );
}
