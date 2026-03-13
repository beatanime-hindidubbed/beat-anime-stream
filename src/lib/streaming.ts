/**
 * streaming.ts
 * Delegates pool management to apiPool.ts — no hardcoded URLs here.
 * Re-exports getApiPool / getNextApi / getApi / setApiPool for backward compat.
 */
import { getApiPool, getNextApi, getApi, setApiPool, racePool, pickApis } from "./apiPool";

export { getApiPool, getNextApi, getApi, setApiPool };

const PROXY = (base: string) => `${base}/hindiapi/proxy`;

export function proxyUrl(
  rawUrl: string,
  referer = "https://megacloud.blog/",
  apiBase?: string
) {
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
export type HiAnimeServer = (typeof HIANIME_SERVERS)[number];

async function tryHiAnimeServer(
  episodeId: string,
  server: string,
  category: string
): Promise<StreamResult | null> {
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
  episodeNumber?: number;
  animeSlug?: string;
}

export async function getWorkingStream(
  opts: GetStreamOptions
): Promise<StreamResult | null> {
  const { episodeId, category = "sub", server, episodeNumber, animeSlug } = opts;

  // ── Primary: HiAnime all servers ───────────────────────────────────────────
  if (server) {
    const result = await tryHiAnimeServer(episodeId, server, category);
    if (result) return result;
    const alt = await tryHiAnimeServer(episodeId, server, category === "sub" ? "dub" : "sub");
    if (alt) return alt;
  }

  for (const s of HIANIME_SERVERS) {
    if (s === server) continue;
    const result = await tryHiAnimeServer(episodeId, s, category);
    if (result) return result;
    const alt = await tryHiAnimeServer(episodeId, s, category === "sub" ? "dub" : "sub");
    if (alt) return alt;
  }

  // ── Fallback: multi-provider chain ─────────────────────────────────────────
  try {
    const { getStreamWithFallback } = await import("./apiFallback");
    const fb = await getStreamWithFallback({
      episodeId,
      category: category === "sub" || category === "dub" ? category : "sub",
      server: server === "hd-1" || server === "hd-2" ? (server as "hd-1" | "hd-2") : "hd-2",
      episodeNumber: episodeNumber ?? 1,
      animeSlug,
    });
    return {
      type: fb.type,
      url: fb.url,
      tracks: fb.tracks.map((t) => ({
        file: t.file,
        label: t.label,
        kind: t.kind,
        default: t.default ?? false,
      })),
      intro: fb.intro,
      outro: fb.outro,
      server: fb.server,
      category: fb.category,
      provider: fb.provider,
    };
  } catch (err) {
    console.warn("[stream fallback] All providers exhausted:", err);
    return null;
  }
}

/** Fetch thumbnail VTT — races all pool APIs for fastest response */
export async function fetchThumbnailVtt(
  episodeId: string,
  server = "hd-2",
  category = "sub"
): Promise<string | null> {
  try {
    const data = await racePool<any>(
      (apiBase) =>
        `${apiBase}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${server}&category=${category}`
    );
    const tracks = data?.data?.tracks || [];
    const thumbTrack = tracks.find(
      (t: any) => t.kind === "thumbnails" || t.lang === "thumbnails"
    );
    if (thumbTrack) {
      return proxyUrl(thumbTrack.url || thumbTrack.file, "https://megacloud.blog/");
    }
    return null;
  } catch {
    return null;
  }
}
