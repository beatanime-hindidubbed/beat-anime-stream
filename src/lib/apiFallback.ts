/**
 * apiFallback.ts
 * Multi-provider fallback system.
 * Uses apiPool.ts (racePool) — always hits admin-configured endpoints.
 */

import { racePool } from "./apiPool";
export { racePool };

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

// ─── Track normalizer ─────────────────────────────────────────────────────────

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

async function streamFromAnimelok(
  animeId: string,
  episodeNumber: number
): Promise<FallbackStream> {
  const slug = animeId.split("?")[0];
  const watchId = `${slug}-episode-${episodeNumber}`;
  const data = await racePool<any>(
    (base) => `${base}/animelok/watch/${encodeURIComponent(watchId)}`
  );
  const d = data?.data || data;
  const streams: any[] = d?.streams || d?.sources || [];
  const hls =
    streams.find((s: any) => s.isM3U8 || (s.url || "").includes(".m3u8")) || streams[0];
  if (!hls?.url) throw new Error("animelok: no stream");
  return {
    url: hls.url,
    type: "hls",
    tracks: normalizeTracks(d?.subtitles || d?.tracks || []),
    intro: d?.intro ?? undefined,
    outro: d?.outro ?? undefined,
    server: "animelok",
    category: "sub",
    provider: "animelok",
  };
}

async function infoFromAnimelok(slug: string): Promise<FallbackAnimeInfo> {
  const data = await racePool<any>(
    (base) => `${base}/animelok/anime/${encodeURIComponent(slug)}`
  );
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

async function streamFromAnimeya(episodeId: string): Promise<FallbackStream> {
  const data = await racePool<any>(
    (base) => `${base}/animeya/watch/${encodeURIComponent(episodeId)}`
  );
  const d = data?.data || data;
  const sources: any[] = d?.sources || d?.streams || [];
  const hls =
    sources.find((s: any) => s.isM3U8 || (s.url || "").includes(".m3u8")) || sources[0];
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

async function infoFromAnimeya(slug: string): Promise<FallbackAnimeInfo> {
  const data = await racePool<any>(
    (base) => `${base}/animeya/info/${encodeURIComponent(slug)}`
  );
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

// ─── Provider 5 — DesiDubAnime ────────────────────────────────────────────────

async function streamFromDesiDub(id: string): Promise<FallbackStream> {
  const data = await racePool<any>(
    (base) => `${base}/desidubanime/watch/${encodeURIComponent(id)}`
  );
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

// ─── Search ───────────────────────────────────────────────────────────────────

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

// ─── Public: Stream fallback chain ───────────────────────────────────────────

export interface StreamFallbackOptions {
  episodeId: string;
  category?: "sub" | "dub";
  server?: "hd-1" | "hd-2";
  episodeNumber?: number;
  animeSlug?: string;
  hindiOnly?: boolean;
}

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

  if (!hindiOnly) {
    for (const srv of [server, server === "hd-2" ? "hd-1" : "hd-2"] as const) {
      try { return await streamFromHianime(episodeId, category, srv); }
      catch (e: any) { errors.push(`hianime/${srv}: ${e.message}`); }
    }
  }

  if (!hindiOnly) {
    try { return await streamFromAnimelok(slug, episodeNumber); }
    catch (e: any) { errors.push(`animelok: ${e.message}`); }
  }

  if (!hindiOnly) {
    try { return await streamFromAnimeya(episodeId); }
    catch (e: any) { errors.push(`animeya: ${e.message}`); }
  }

  if (!hindiOnly) {
    try { return await streamFromWatchaw(slug, episodeNumber); }
    catch (e: any) { errors.push(`watchaw: ${e.message}`); }
  }

  if (category === "dub" || hindiOnly) {
    try { return await streamFromDesiDub(slug); }
    catch (e: any) { errors.push(`desidubanime: ${e.message}`); }
  }

  throw new Error(`All stream providers failed:\n${errors.join("\n")}`);
}

// ─── Public: Info fallback ────────────────────────────────────────────────────

export async function getAnimeInfoWithFallback(slug: string): Promise<FallbackAnimeInfo> {
  const errors: string[] = [];
  try { return await infoFromAnimelok(slug); } catch (e: any) { errors.push(`animelok: ${e.message}`); }
  try { return await infoFromAnimeya(slug); } catch (e: any) { errors.push(`animeya: ${e.message}`); }
  throw new Error(`All info providers failed:\n${errors.join("\n")}`);
}

// ─── Public: Search fallback ──────────────────────────────────────────────────

export async function searchWithFallback(
  query: string,
  page = 1
): Promise<FallbackSearchResult[]> {
  try {
    const results = await searchHianime(query, page);
    if (results.length > 0) return results;
  } catch {}

  const [lok, ya] = await Promise.allSettled([
    searchAnimelok(query),
    searchAnimeya(query),
  ]);
  const combined: FallbackSearchResult[] = [
    ...(lok.status === "fulfilled" ? lok.value : []),
    ...(ya.status === "fulfilled" ? ya.value : []),
  ];
  const seen = new Set<string>();
  return combined.filter((r) => {
    const key = r.name.toLowerCase().replace(/\s+/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Public: Home fallback ────────────────────────────────────────────────────

export interface FallbackHomeSection {
  trending: FallbackSearchResult[];
  latest: FallbackSearchResult[];
  popular: FallbackSearchResult[];
  provider: string;
}

export async function getHomeWithFallback(): Promise<FallbackHomeSection> {
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

// ─── Public: Schedule fallback ────────────────────────────────────────────────

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

// ─── Diagnostic: probe all providers ─────────────────────────────────────────

export async function probeAllProviders(
  opts: StreamFallbackOptions
): Promise<Record<string, { ok: boolean; ms?: number; error?: string }>> {
  const { episodeId, category = "sub", episodeNumber = 1 } = opts;
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
    probe("desidubanime", () => streamFromDesiDub(slug)),
  ]);

  return Object.fromEntries(
    results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<[string, any]>).value)
  );
}
