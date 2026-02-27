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

// Provider 1: HindiDubbed (Hindi only)
function toHindiSlug(name: string): string[] {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return [base, `${base}-s1`, `${base}-season-1`];
}

async function tryHindiDubbed(animeName: string, episodeNumber: number): Promise<StreamResult | null> {
  const slugs = toHindiSlug(animeName);
  for (const slug of slugs) {
    try {
      const res = await fetch(`${BASE}/hindidubbed/anime/${slug}`);
      if (!res.ok) continue;
      const data = await res.json();
      const episodes = data?.data?.episodes;
      if (!episodes?.length) continue;
      const ep = episodes.find((e: any) => e.number === episodeNumber) || episodes[episodeNumber - 1];
      if (!ep?.servers?.length) continue;
      const server = ep.servers[0];
      if (server?.url) {
        return { type: "iframe", url: server.url, server: server.name || "hindidubbed", category: "hindi", provider: "hindidubbed" };
      }
    } catch { continue; }
  }
  return null;
}

// Provider 2: WatchAW (multi-language)
async function tryWatchAW(animeName: string, episodeNumber: number, preferredLang = "hi"): Promise<StreamResult | null> {
  try {
    const searchRes = await fetch(`${BASE}/watchaw/search?q=${encodeURIComponent(animeName)}`);
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const results = searchData?.data?.results;
    if (!results?.length) return null;
    const slug = results[0].slug;
    
    const epRes = await fetch(`${BASE}/watchaw/episode?id=${slug}-1x${episodeNumber}`);
    if (!epRes.ok) return null;
    const epData = await epRes.json();
    const sources = epData?.data?.sources;
    if (!sources?.length) return null;
    
    const langPriority = [preferredLang, 'hi', 'en', 'ja', 'ta', 'te'];
    let source = null;
    for (const lang of langPriority) {
      source = sources.find((s: any) => s.langCode === lang);
      if (source) break;
    }
    source = source || sources[0];
    
    if (source?.url) {
      return { type: "iframe", url: source.url, server: source.providerName || "watchaw", category: source.language || source.langCode || "unknown", provider: "watchaw" };
    }
  } catch { /* fall through */ }
  return null;
}

// Provider 3: HiAnime (sub/dub with proxy)
const HIANIME_SERVERS = ["hd-2", "hd-1", "vidstreaming", "megacloud"];
const HIANIME_CATEGORIES = ["sub", "dub"];

async function tryHiAnime(episodeId: string, preferredCategory?: string): Promise<StreamResult | null> {
  const categories = preferredCategory 
    ? [preferredCategory, ...HIANIME_CATEGORIES.filter(c => c !== preferredCategory)]
    : HIANIME_CATEGORIES;
    
  for (const server of HIANIME_SERVERS) {
    for (const category of categories) {
      try {
        const res = await fetch(
          `${BASE}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${server}&category=${category}`
        );
        if (!res.ok) continue;
        const data = await res.json();
        const sources = data?.data?.sources;
        if (!sources?.length) continue;
        
        const rawUrl = sources[0].url;
        const proxiedUrl = proxyUrl(rawUrl);
        
        // Build tracks
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
      } catch { continue; }
    }
  }
  return null;
}

export interface GetStreamOptions {
  episodeId: string;       // HiAnime episodeId like "anime-name?ep=12345"
  animeName: string;
  episodeNumber: number;
  preferredLang?: string;  // 'hi', 'en', 'ja', etc.
  preferredCategory?: string; // 'sub' or 'dub' for HiAnime
}

export async function getWorkingStream(opts: GetStreamOptions): Promise<StreamResult | null> {
  const { episodeId, animeName, episodeNumber, preferredLang = "hi", preferredCategory } = opts;
  
  // Strategy: Try HiAnime first (most reliable for sub), then WatchAW, then HindiDubbed
  // If user wants Hindi, try HindiDubbed and WatchAW first
  
  if (preferredLang === "hi") {
    // Try HindiDubbed first for Hindi
    const hindi = await tryHindiDubbed(animeName, episodeNumber);
    if (hindi) return hindi;
    
    // Try WatchAW
    const watchaw = await tryWatchAW(animeName, episodeNumber, "hi");
    if (watchaw) return watchaw;
  }
  
  // Try HiAnime with server fallback
  const hianime = await tryHiAnime(episodeId, preferredCategory);
  if (hianime) return hianime;
  
  // Last resort: try WatchAW with any language
  if (preferredLang !== "hi") {
    const watchaw = await tryWatchAW(animeName, episodeNumber, preferredLang);
    if (watchaw) return watchaw;
  }
  
  return null;
}
