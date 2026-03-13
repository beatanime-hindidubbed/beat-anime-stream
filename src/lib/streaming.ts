// Multi-API pool for load distribution
const API_POOL = [
  "https://beat-anime-api.onrender.com/api/v1",
  "https://beat-anime-api-2.onrender.com/api/v1",
  "https://beat-anime-api-3.onrender.com/api/v1",
  "https://beat-anime-api-4.onrender.com/api/v1",
];

let apiRoundRobin = 0;

/** Get next API base using round-robin for load distribution */
export function getNextApi(): string {
  const api = API_POOL[apiRoundRobin % API_POOL.length];
  apiRoundRobin++;
  return api;
}

/** Get a specific API by index */
export function getApi(index: number): string {
  return API_POOL[index % API_POOL.length];
}

export function getApiPool(): string[] {
  return [...API_POOL];
}

const BASE = API_POOL[0];
const PROXY = (base: string) => `${base}/hindiapi/proxy`;

export function proxyUrl(rawUrl: string, referer = "https://megacloud.blog/", apiBase?: string) {
  const base = apiBase || getNextApi();
  return `${PROXY(base)}?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent(referer)}`;
}

export interface StreamResult {
  type: "hls" | "iframe";
  url: string;
  tracks?: { file: string; label?: string; kind?: string; default?: boolean }[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  server: string;
  category: string;
  provider: string;
}

export const HIANIME_SERVERS = ["hd-2", "hd-1", "vidstreaming", "megacloud"] as const;
export type HiAnimeServer = typeof HIANIME_SERVERS[number];

// Try a specific HiAnime server+category, using round-robin API
async function tryHiAnimeServer(episodeId: string, server: string, category: string): Promise<StreamResult | null> {
  const apiBase = getNextApi();
  try {
    const res = await fetch(
      `${apiBase}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${server}&category=${category}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const sources = data?.data?.sources;
    if (!sources?.length) return null;

    const rawUrl = sources[0].url;
    const proxiedUrl = proxyUrl(rawUrl, "https://megacloud.blog/", apiBase);

    const rawTracks = data?.data?.tracks || [];
    const tracks = rawTracks
      .filter((t: any) => (t.kind || t.lang) !== "thumbnails" && t.lang !== "thumbnails")
      .map((t: any) => ({
        file: proxyUrl(t.url || t.file, "https://megacloud.blog/", apiBase),
        label: t.label || t.lang || "Unknown",
        kind: t.kind || "subtitles",
        default: t.default || false,
      }));

    return {
      type: "hls",
      url: proxiedUrl,
      tracks,
      intro: data?.data?.intro,
      outro: data?.data?.outro,
      server,
      category,
      provider: "hianime",
    };
  } catch {
    return null;
  }
}

export interface GetStreamOptions {
  episodeId: string;
  category?: string;
  server?: string;
}

export async function getWorkingStream(opts: GetStreamOptions): Promise<StreamResult | null> {
  const { episodeId, category = "sub", server } = opts;

  if (server) {
    const result = await tryHiAnimeServer(episodeId, server, category);
    if (result) return result;
    const altCat = category === "sub" ? "dub" : "sub";
    const alt = await tryHiAnimeServer(episodeId, server, altCat);
    if (alt) return alt;
  }

  for (const s of HIANIME_SERVERS) {
    if (s === server) continue;
    const result = await tryHiAnimeServer(episodeId, s, category);
    if (result) return result;
    const altCat = category === "sub" ? "dub" : "sub";
    const alt = await tryHiAnimeServer(episodeId, s, altCat);
    if (alt) return alt;
  }

  return null;
}

/** Fetch thumbnail VTT using fastest available API (parallel race) */
export async function fetchThumbnailVtt(episodeId: string, server = "hd-2", category = "sub"): Promise<string | null> {
  // Race all 4 APIs to get the fastest thumbnail response
  const promises = API_POOL.map(async (apiBase) => {
    try {
      const res = await fetch(
        `${apiBase}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${server}&category=${category}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      const tracks = data?.data?.tracks || [];
      const thumbTrack = tracks.find((t: any) => t.kind === "thumbnails" || t.lang === "thumbnails");
      if (thumbTrack) {
        return proxyUrl(thumbTrack.url || thumbTrack.file, "https://megacloud.blog/", apiBase);
      }
      return null;
    } catch {
      return null;
    }
  });

  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) return r.value;
  }
  return null;
}
