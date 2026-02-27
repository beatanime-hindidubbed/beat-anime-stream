const BASE = "https://beat-anime-api.onrender.com/api/v1";
const PROXY = `${BASE}/hindiapi/proxy`;

export function proxyUrl(rawUrl: string, referer = "https://megacloud.blog/") {
  return `${PROXY}?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent(referer)}`;
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

// Try a specific HiAnime server+category
async function tryHiAnimeServer(episodeId: string, server: string, category: string): Promise<StreamResult | null> {
  try {
    const res = await fetch(
      `${BASE}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${server}&category=${category}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const sources = data?.data?.sources;
    if (!sources?.length) return null;

    const rawUrl = sources[0].url;
    const proxiedUrl = proxyUrl(rawUrl);

    const rawTracks = data?.data?.tracks || [];
    const tracks = rawTracks
      .filter((t: any) => (t.kind || t.lang) !== "thumbnails" && t.lang !== "thumbnails")
      .map((t: any) => ({
        file: proxyUrl(t.url || t.file),
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
  category?: string;       // 'sub' or 'dub'
  server?: string;         // specific server to try first
}

export async function getWorkingStream(opts: GetStreamOptions): Promise<StreamResult | null> {
  const { episodeId, category = "sub", server } = opts;

  // If user picked a specific server, try that first
  if (server) {
    const result = await tryHiAnimeServer(episodeId, server, category);
    if (result) return result;
    // Also try the other category on same server
    const altCat = category === "sub" ? "dub" : "sub";
    const alt = await tryHiAnimeServer(episodeId, server, altCat);
    if (alt) return alt;
  }

  // Fallback: try all servers in order
  for (const s of HIANIME_SERVERS) {
    if (s === server) continue; // already tried
    const result = await tryHiAnimeServer(episodeId, s, category);
    if (result) return result;
    // Try other category
    const altCat = category === "sub" ? "dub" : "sub";
    const alt = await tryHiAnimeServer(episodeId, s, altCat);
    if (alt) return alt;
  }

  return null;
}
