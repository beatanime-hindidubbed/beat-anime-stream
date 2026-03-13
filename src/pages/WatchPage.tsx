import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { store } from "@/lib/store";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useRegion } from "@/hooks/useRegion";
import VideoPlayer from "@/components/VideoPlayer";
import HindiVideoPlayer from "@/components/HindiVideoPlayer";
import DownloadButton from "@/components/DownloadButton";
import BackButton from "@/components/BackButton";
import { lazy, Suspense } from "react";
const CommentSection = lazy(() => import("@/components/CommentSection"));
import AnimeCard from "@/components/AnimeCard";
import AnimeReportButton from "@/components/AnimeReportButton";
import { RegionalPopularWidget } from "@/components/RegionalPopular";
import { getWorkingStream, StreamResult, HIANIME_SERVERS } from "@/lib/streaming";
import { getCachedStream, setCachedStream } from "@/lib/streamCache";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft, ChevronRight, List, Loader2, Server,
  RefreshCw, Globe, ChevronDown, MessageSquare, Info
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";

// ── Constants ────────────────────────────────────────────────────────────────
const HINDI_API_BASE = "https://beat-anime-api.onrender.com/api/v1";

/**
 * Language options — Hindi DUB (hindiapi), English SUB/DUB (hianime), Japanese RAW (hianime-sub).
 * Fallback chain: Hindi → English Sub → English Dub → Japanese Raw
 */
const LANGUAGES = [
  { code: "dub",  label: "Hindi (हिंदी Dub)",     short: "🇮🇳 HINDI",  flag: "🇮🇳" },
  { code: "sub",  label: "English Sub",              short: "ENG SUB",   flag: "🌐" },
  { code: "eng",  label: "English Sub / Dub",        short: "ENG",       flag: "🌐" },
  { code: "raw",  label: "Japanese (日本語 Raw)",     short: "JPN RAW",   flag: "🇯🇵" },
] as const;

type LangCode = typeof LANGUAGES[number]["code"];

/** Language badge colors for quick identification */
const LANG_COLORS: Record<LangCode, string> = {
  dub: "text-orange-400",
  sub: "text-blue-400",
  eng: "text-blue-400",
  raw: "text-rose-400",
};

/** Ordered fallback chain when a language fails */
const FALLBACK_CHAIN: Record<LangCode, LangCode | null> = {
  dub: "sub",   // Hindi → English Sub
  sub: "eng",   // English Sub → English Sub+Dub
  eng: "raw",   // English → Japanese Raw
  raw: null,    // No further fallback
};

const ALLOWED_HINDI_PROVIDERS: Record<string, string> = {
  "StreamHG": "Server 1",
  "EarnVids": "Server 2 (Embedded)",
};

// ── API helpers ──────────────────────────────────────────────────────────────
/** Race multiple API clones for fastest response */
async function raceHindiFetch(url: string): Promise<any> {
  const apis: string[] = JSON.parse(localStorage.getItem("beat_api_endpoints") || "[]");
  const bases = apis.length > 0 ? apis : [HINDI_API_BASE];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const promises = bases.slice(0, 3).map(async (base: string) => {
      const fullUrl = url.replace(HINDI_API_BASE, base);
      const res = await fetch(fullUrl, { signal: controller.signal });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    });
    const results = await Promise.allSettled(promises);
    clearTimeout(timeout);
    const fulfilled = results.find(r => r.status === "fulfilled");
    if (fulfilled && fulfilled.status === "fulfilled") return fulfilled.value;
    throw new Error("All APIs failed");
  } catch {
    clearTimeout(timeout);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }
}

/**
 * Detect correct season number from seasons array and current animeId.
 * Fixes bug where Season 2+ would fetch Season 1 episodes from Hindi API.
 */
function detectSeasonNumber(seasons: any[], currentAnimeId: string): number {
  if (!seasons || seasons.length === 0) return 1;
  const currentSeasonIdx = seasons.findIndex((s: any) => s.id === currentAnimeId);
  if (currentSeasonIdx === -1) {
    const currentSeason = seasons.find((s: any) => s.isCurrent);
    if (!currentSeason) return 1;
    const titleMatch = (currentSeason.title || currentSeason.name || "").match(/season\s*(\d+)/i);
    if (titleMatch) return parseInt(titleMatch[1], 10);
    const tvSeasons = seasons.filter((s: any) => {
      const t = (s.title || s.name || "").toLowerCase();
      return t.includes("season") || (!t.includes("movie") && !t.includes("special") && !t.includes("ova"));
    });
    const idx = tvSeasons.findIndex((s: any) => s.isCurrent);
    return idx >= 0 ? idx + 1 : 1;
  }
  const season = seasons[currentSeasonIdx];
  const titleMatch = (season.title || season.name || "").match(/season\s*(\d+)/i);
  if (titleMatch) return parseInt(titleMatch[1], 10);
  const tvSeasons = seasons.filter((s: any) => {
    const t = (s.title || s.name || "").toLowerCase();
    return t.includes("season") || (!t.includes("movie") && !t.includes("special") && !t.includes("ova"));
  });
  const tvIdx = tvSeasons.findIndex((s: any) => s.id === currentAnimeId);
  return tvIdx >= 0 ? tvIdx + 1 : currentSeasonIdx + 1;
}

interface HindiSource {
  name: string;
  displayName: string;
  isHLS: boolean;
  url: string;
  headers: Record<string, string>;
}

async function fetchHindiSources(
  animeInfo: any,
  episodeNumber: number,
  currentAnimeId: string
): Promise<HindiSource[]> {
  const moreInfo = animeInfo?.anime?.moreInfo || animeInfo?.moreInfo || {};
  const info     = animeInfo?.anime?.info || {};
  const anilistId = moreInfo.anilistid || moreInfo.anilist_id || info.anilistId;
  const malId     = moreInfo.malid     || moreInfo.mal_id     || info.malId;
  if (!anilistId && !malId) throw new Error("No AniList/MAL ID found for this anime");

  const paramName  = anilistId ? "anilistId" : "malId";
  const paramValue = anilistId || malId;
  const seasons    = animeInfo?.seasons || [];
  const seasonNumber = detectSeasonNumber(seasons, currentAnimeId);

  // Endpoint: /hindiapi/episode?anilistId=...&season=N&episode=N&type=series
  const url = `${HINDI_API_BASE}/hindiapi/episode?${paramName}=${paramValue}&season=${seasonNumber}&episode=${episodeNumber}&type=series`;
  const data = await raceHindiFetch(url);

  const sources = data.data?.streams || data.data?.sources || data.data?.servers || [];
  if (!sources.length) throw new Error("No Hindi sources found");

  return sources
    .map((src: any) => {
      const provider    = src.provider || src.serverName || src.name || "Unknown";
      const displayName = ALLOWED_HINDI_PROVIDERS[provider];
      if (!displayName) return null;
      return {
        name: provider,
        displayName,
        isHLS: !!(src.isM3U8 || src.dhls || src.url?.includes(".m3u8") || src.streamUrl?.includes(".m3u8")),
        url:   src.dhls || src.streamUrl || src.url || "",
        headers: src.headers || {},
      };
    })
    .filter((s: HindiSource | null): s is HindiSource => s !== null && s.url !== "");
}

// ── Component ────────────────────────────────────────────────────────────────
export default function WatchPage() {
  const navigate        = useNavigate();
  const { episodeId }   = useParams<{ episodeId: string }>();
  const [searchParams]  = useSearchParams();
  const fullEpisodeId   = episodeId
    ? `${episodeId}${searchParams.get("ep") ? `?ep=${searchParams.get("ep")}` : ""}`
    : "";

  // Resolve initial language from ?lang= param; default = Hindi dub
  const initialCategory = ((): LangCode => {
    const lang = searchParams.get("lang");
    if (lang === "sub") return "sub";
    if (lang === "eng" || lang === "engdub") return "eng";
    if (lang === "raw") return "raw";
    return "dub"; // default: try Hindi first
  })();

  const [category, setCategory]       = useState<LangCode>(initialCategory);
  const [selectedServer, setServer]   = useState<string>("hd-2");
  const [showEpList, setShowEpList]   = useState(false);
  const [showLangMenu, setLangMenu]   = useState(false);

  // HiAnime (sub/eng/raw) state
  const [streamResult, setStreamResult]     = useState<StreamResult | null>(null);
  const [streamLoading, setStreamLoading]   = useState(false);
  const [streamError, setStreamError]       = useState<string | null>(null);
  const [retryKey, setRetryKey]             = useState(0);
  const [retryMessage, setRetryMessage]     = useState("");
  const [thumbnailsVttUrl, setThumbVtt]     = useState<string | null>(null);
  const [engMode, setEngMode]               = useState<"sub" | "dub">("sub");

  // Hindi state
  const [hindiSources, setHindiSources]         = useState<HindiSource[]>([]);
  const [selectedHindi, setSelectedHindi]        = useState<HindiSource | null>(null);
  const [hindiHlsSrc, setHindiHlsSrc]           = useState<string | null>(null);
  const [hindiIframeSrc, setHindiIframeSrc]     = useState<string | null>(null);

  // Fallback notification state
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);

  const langRef         = useRef<HTMLDivElement>(null);
  const playerAnchorRef = useRef<HTMLDivElement>(null);
  const playerWrapperRef= useRef<HTMLDivElement>(null);
  const [showPip, setShowPip] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { settings }    = useSiteSettings();
  const animeId         = fullEpisodeId.split("?")[0];

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close lang menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // PiP scroll tracking
  useEffect(() => {
    const updatePip = () => {
      const anchor = playerAnchorRef.current;
      if (!anchor) return;
      setShowPip(anchor.getBoundingClientRect().top < -250);
    };
    window.addEventListener("scroll", updatePip, { passive: true });
    window.addEventListener("resize", updatePip);
    updatePip();
    return () => { window.removeEventListener("scroll", updatePip); window.removeEventListener("resize", updatePip); };
  }, []);

  // PiP DOM mutation (avoid re-renders)
  useEffect(() => {
    const el = playerWrapperRef.current;
    if (!el) return;
    if (showPip) {
      Object.assign(el.style, {
        position: "fixed", bottom: "12px", right: "12px",
        width: isMobile ? "160px" : "320px", zIndex: "50",
        borderRadius: "12px", overflow: "hidden",
        boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
        border: "1px solid hsl(var(--border))", cursor: "pointer",
      });
      const inner = el.querySelector("div, video, iframe") as HTMLElement | null;
      if (inner) inner.style.pointerEvents = "none";
    } else {
      ["position","bottom","right","width","zIndex","borderRadius","overflow","boxShadow","border","cursor"]
        .forEach(p => el.style.removeProperty(p));
      const inner = el.querySelector("div, video, iframe") as HTMLElement | null;
      if (inner) inner.style.removeProperty("pointer-events");
    }
  }, [showPip, isMobile]);

  const scrollToPlayer = () => playerAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Queries
  const { data: epData } = useQuery({
    queryKey: ["episodes", animeId],
    queryFn: () => api.getEpisodes(animeId),
    enabled: !!animeId,
  });
  const { data: info } = useQuery({
    queryKey: ["info", animeId],
    queryFn: () => api.getAnimeInfo(animeId),
    enabled: !!animeId,
  });

  // Genre tracking for personalization
  useEffect(() => {
    if (!info) return;
    const genres = info?.anime?.moreInfo?.genres || [];
    if (genres.length) {
      try {
        const stored = JSON.parse(localStorage.getItem("beat_watched_genres") || "[]") as string[];
        const updated = [...new Set([...genres, ...stored])].slice(0, 20);
        localStorage.setItem("beat_watched_genres", JSON.stringify(updated));
      } catch {}
    }
  }, [info]);

  const episodes   = epData?.episodes || [];
  const currentEp  = episodes.find(e => e.episodeId === fullEpisodeId);
  const currentIdx = episodes.findIndex(e => e.episodeId === fullEpisodeId);
  const prevEp     = currentIdx > 0 ? episodes[currentIdx - 1] : null;
  const nextEp     = currentIdx < episodes.length - 1 ? episodes[currentIdx + 1] : null;

  const { user }     = useSupabaseAuth();
  const { trackView } = useRegion();
  const animeName   = info?.anime?.info?.name || animeId;
  const animePoster = info?.anime?.info?.poster;

  useEffect(() => {
    if (!info || !animeName || !animeId) return;
    trackView({ id: animeId, name: animeName, poster: animePoster });
  }, [info, animeId, animeName, animePoster, trackView]);

  /** Auto-fallback to next language in chain */
  const triggerFallback = useCallback((failedLang: LangCode) => {
    const next = FALLBACK_CHAIN[failedLang];
    if (!next) return false;
    const nextLang = LANGUAGES.find(l => l.code === next)!;
    const failedLabel = LANGUAGES.find(l => l.code === failedLang)?.label || failedLang;
    toast.warning(`${failedLabel} not available — switching to ${nextLang.label}`, { duration: 5000 });
    setFallbackNote(`${failedLabel} unavailable. Showing ${nextLang.label}`);
    setCategory(next);
    return true;
  }, []);

  // ── Hindi (dub) stream loader ─────────────────────────────────────────────
  const switchHindiSource = useCallback((src: HindiSource) => {
    setSelectedHindi(src);
    setStreamResult(null);
    setHindiHlsSrc(src.isHLS ? src.url : null);
    setHindiIframeSrc(!src.isHLS ? src.url : null);
  }, []);

  useEffect(() => {
    if (category !== "dub" || !info || !currentEp) return;
    let cancelled = false;

    const load = async () => {
      setStreamLoading(true);
      setStreamError(null);
      setStreamResult(null);
      setHindiSources([]);
      setSelectedHindi(null);
      setHindiHlsSrc(null);
      setHindiIframeSrc(null);
      setRetryMessage("🇮🇳 Fetching Hindi stream...");

      // Cache key includes season to avoid cross-season collisions
      const moreInfo   = info?.anime?.moreInfo || {};
      const infoObj    = info?.anime?.info as any;
      const anilistId  = (moreInfo as any).anilistid || (moreInfo as any).anilist_id || infoObj?.anilistId;
      const malId      = (moreInfo as any).malid     || (moreInfo as any).mal_id     || infoObj?.malId;
      const seasons    = info?.seasons || [];
      const seasonNum  = detectSeasonNumber(seasons, animeId);
      const cacheKey   = `hindi_${anilistId || malId}_s${seasonNum}_ep${currentEp.number}`;
      const cached     = getCachedStream<HindiSource[]>(cacheKey);

      if (cached && retryKey === 0) {
        if (!cancelled) {
          setHindiSources(cached);
          const first = cached.find(s => s.isHLS) || cached[0];
          if (first) switchHindiSource(first);
          else triggerFallback("dub");
          setStreamLoading(false);
        }
        return;
      }

      try {
        const srcs = await fetchHindiSources(info, currentEp.number || 1, animeId);
        if (cancelled) return;
        setCachedStream(cacheKey, srcs);
        setHindiSources(srcs);
        const first = srcs.find(s => s.isHLS) || srcs[0];
        if (first) {
          switchHindiSource(first);
        } else {
          triggerFallback("dub");
        }
      } catch {
        if (!cancelled) triggerFallback("dub");
      } finally {
        if (!cancelled) { setStreamLoading(false); setRetryMessage(""); }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [category, info, currentEp, retryKey, animeId, switchHindiSource, triggerFallback]);

  // ── HiAnime (sub/eng/raw) stream loader ──────────────────────────────────
  useEffect(() => {
    if (category === "dub" || !fullEpisodeId) return;
    let cancelled = false;

    const fetchStream = async () => {
      setStreamLoading(true);
      setStreamError(null);
      setStreamResult(null);
      setHindiSources([]);
      setHindiHlsSrc(null);
      setHindiIframeSrc(null);
      setRetryMessage("");
      setThumbVtt(null);

      const cacheKey = `hianime_${fullEpisodeId}_${category}`;
      const cached   = getCachedStream<StreamResult>(cacheKey);
      if (cached && retryKey === 0) {
        setServer(cached.server as string);
        setStreamResult(cached);
        if (category === "eng") setEngMode(cached.category as "sub" | "dub");
        setStreamLoading(false);
        return;
      }

      // For "sub" and "raw": try sub only. For "eng": try sub then dub.
      // For "raw": uses sub category (Japanese raw audio, no dub available on hianime).
      const categoriesToTry = category === "eng" ? ["sub", "dub"] : ["sub"];

      const fetchWithRetry = async (fn: () => Promise<any>, maxRetries = 4, baseDelay = 800) => {
        let lastErr: any;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            const result = await fn();
            if (result) return result;
          } catch (e) { lastErr = e; }
          if (attempt < maxRetries - 1)
            await new Promise(r => setTimeout(r, baseDelay * Math.pow(1.5, attempt)));
        }
        throw lastErr ?? new Error("All retries failed");
      };

      for (const apiCat of categoriesToTry) {
        for (let i = 0; i < HIANIME_SERVERS.length; i++) {
          if (cancelled) return;
          const server = HIANIME_SERVERS[i];
          const langLabel = category === "raw" ? "🇯🇵 Japanese" : category === "eng" ? `🌐 ${apiCat.toUpperCase()}` : "🌐 ENG SUB";
          setRetryMessage(`Trying ${langLabel} on ${server.toUpperCase()}...`);
          try {
            const result = await fetchWithRetry(
              () => getWorkingStream({ episodeId: fullEpisodeId, category: apiCat, server }),
              4, 800
            );
            if (cancelled) return;
            if (result) {
              setCachedStream(cacheKey, result);
              setServer(server);
              setStreamResult(result);
              setStreamLoading(false);
              setRetryMessage("");
              if (category === "eng") setEngMode(apiCat as "sub" | "dub");

              const thumbTrack = (result.tracks || []).find((t: any) =>
                ["thumbnails", "thumbnail"].includes(t.kind || t.lang || "")
              );
              setThumbVtt(thumbTrack ? (thumbTrack.file || thumbTrack.url || null) : null);

              // Background subtitle retry if missing
              const hasTracks = (result.tracks || []).filter((t: any) =>
                !["thumbnails", "thumbnail"].includes(t.kind || t.lang || "")
              ).length > 0;

              if (!hasTracks) {
                (async () => {
                  const apiPool: string[] = JSON.parse(localStorage.getItem("beat_api_endpoints") || "[]");
                  const fallback = "https://beat-anime-api-2.onrender.com/api/v1";
                  const bases    = apiPool.length > 0 ? apiPool : [fallback];
                  const chosenApi = bases[Math.floor(Math.random() * bases.length)];
                  const trackUrl  = `${chosenApi}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(fullEpisodeId)}&server=${server}&category=${apiCat}`;
                  for (let retryIdx = 0; retryIdx < 10; retryIdx++) {
                    if (cancelled) return;
                    await new Promise(r => setTimeout(r, 5000));
                    if (cancelled) return;
                    try {
                      const res = await fetch(trackUrl);
                      if (!res.ok) continue;
                      const data    = await res.json();
                      const newTracks: any[] = data?.data?.tracks || [];
                      const newSubs  = newTracks.filter(t => !["thumbnails","thumbnail"].includes(t.kind || t.lang || ""));
                      const newThumb = newTracks.find(t => ["thumbnails","thumbnail"].includes(t.kind || t.lang || ""));
                      if (newSubs.length > 0) {
                        setStreamResult(prev => prev ? { ...prev, tracks: newTracks } : prev);
                        if (newThumb) setThumbVtt(newThumb.file || newThumb.url || null);
                        break;
                      }
                    } catch {}
                  }
                })();
              }
              return;
            }
          } catch {}
        }
      }

      if (!cancelled) {
        // Try fallback language
        const didFallback = triggerFallback(category);
        if (!didFallback) { setStreamError("all_failed"); setStreamLoading(false); }
        else setStreamLoading(false);
      }
    };

    fetchStream();
    return () => { cancelled = true; };
  }, [fullEpisodeId, category, retryKey, triggerFallback]);

  const handleTimeUpdate = useCallback(
    (time: number, duration: number) => {
      if (!user || !animeId || !fullEpisodeId || !currentEp) return;
      if (Math.floor(time) % 10 === 0 && duration > 0) {
        store.updateContinueWatching({
          id: animeId, name: animeName, poster: animePoster,
          episodeId: fullEpisodeId, episodeNumber: currentEp.number || 0, progress: time, duration,
        });
      }
    },
    [user, animeId, fullEpisodeId, currentEp, animeName, animePoster]
  );

  const recommended = info?.recommendedAnimes || info?.relatedAnimes || [];
  const currentLang = LANGUAGES.find(l => l.code === category) || LANGUAGES[0];
  const [commentsExpanded, setCommentsExpanded] = useState(false);

  const buildEpLink = (ep: { episodeId?: string }) => {
    if (!ep.episodeId) return "#";
    return `/watch/${ep.episodeId}?lang=${category}`;
  };

  // ── Language label for streaming info bar ──────────────────────────────────
  const activeLangLabel = () => {
    if (category === "dub")  return { text: "🇮🇳 हिंदी DUB",     cls: "text-orange-400" };
    if (category === "raw")  return { text: "🇯🇵 Japanese RAW",   cls: "text-rose-400"   };
    if (category === "eng")  return { text: `🌐 ENG ${engMode.toUpperCase()}`, cls: "text-blue-400" };
    return                          { text: "🌐 ENG SUB",          cls: "text-blue-400"   };
  };
  const ll = activeLangLabel();

  // ── Player render ─────────────────────────────────────────────────────────
  const renderPlayer = () => {
    if (streamLoading) {
      return (
        <div className="aspect-video rounded-lg bg-secondary flex flex-col items-center justify-center gap-4 text-muted-foreground">
          {settings.loadingGif
            ? <img src={settings.loadingGif} alt="Loading" className="w-32 h-32 object-contain" />
            : <Loader2 className="w-10 h-10 animate-spin text-primary" />}
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Finding the best stream...</p>
            {retryMessage && <p className="text-xs text-muted-foreground mt-1">{retryMessage}</p>}
          </div>
        </div>
      );
    }

    if (streamError) {
      return (
        <div className="aspect-video rounded-lg bg-secondary flex flex-col items-center justify-center gap-4">
          {settings.errorGif
            ? <img src={settings.errorGif} alt="Error" className="w-40 h-40 object-contain" />
            : <div className="text-6xl">😔</div>}
          <div className="text-center px-4">
            <p className="text-foreground font-medium mb-1">Stream unavailable right now</p>
            <p className="text-sm text-muted-foreground mb-4">
              All servers tried. Please switch language or report this issue.
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              <button onClick={() => setRetryKey(k => k + 1)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:shadow-glow transition-all">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
              {LANGUAGES.filter(l => l.code !== category).map(l => (
                <button key={l.code} onClick={() => { setFallbackNote(null); setCategory(l.code); setRetryKey(k => k + 1); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">
                  {l.flag} Switch to {l.short}
                </button>
              ))}
              <AnimeReportButton animeId={animeId} animeName={animeName} />
            </div>
          </div>
        </div>
      );
    }

    if (category === "dub" && hindiHlsSrc) {
      return (
        <HindiVideoPlayer src={hindiHlsSrc} episodeId={fullEpisodeId} disableInternalMiniPlayer
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => { if (nextEp) navigate(buildEpLink(nextEp)); }} />
      );
    }
    if (category === "dub" && hindiIframeSrc) {
      return (
        <HindiVideoPlayer iframeSrc={hindiIframeSrc} episodeId={fullEpisodeId} disableInternalMiniPlayer
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => { if (nextEp) navigate(buildEpLink(nextEp)); }} />
      );
    }

    if (streamResult?.type === "hls") {
      const normalizedTracks = (streamResult.tracks || [])
        .filter((t: any) => !["thumbnails","thumbnail"].includes(t.kind || t.lang || ""))
        .map((t: any) => ({
          file:    t.file || t.url,
          label:   t.label || t.lang || "Unknown",
          kind:    (t.kind === "captions" ? "captions" : "subtitles") as "subtitles" | "captions",
          default: t.default || false,
        }))
        .filter((t: any) => !!t.file);

      return (
        <VideoPlayer src={streamResult.url} disableInternalMiniPlayer
          tracks={normalizedTracks}
          intro={streamResult.intro}
          outro={streamResult.outro}
          thumbnailsVtt={selectedServer === "server3" && thumbnailsVttUrl ? thumbnailsVttUrl : undefined}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => { if (nextEp) navigate(buildEpLink(nextEp)); }} />
      );
    }

    return (
      <div className="aspect-video rounded-lg bg-secondary flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  };

  return (
    <div className="container py-4 max-w-6xl">
      <BackButton />

      {/* Fallback notice banner */}
      {fallbackNote && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{fallbackNote}</span>
          <button onClick={() => setFallbackNote(null)} className="ml-auto text-primary/60 hover:text-primary">✕</button>
        </motion.div>
      )}

      {/* Available languages pill row */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground mr-1">Available:</span>
        {LANGUAGES.map(l => (
          <button key={l.code} onClick={() => { setFallbackNote(null); setCategory(l.code); setRetryKey(k => k + 1); }}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
              category === l.code
                ? `border-current ${LANG_COLORS[l.code]} bg-current/10`
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}>
            {l.flag} {l.short}
          </button>
        ))}
      </div>

      <div ref={playerAnchorRef} className="h-px w-full" aria-hidden="true" />
      <div ref={playerWrapperRef} className="mb-2" onClick={showPip ? scrollToPlayer : undefined}>
        {renderPlayer()}
      </div>
      {showPip && <div className="mb-2" style={{ aspectRatio: "16/9" }} />}

      {/* Stream info bar */}
      {(streamResult || hindiHlsSrc || hindiIframeSrc) && (
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          <Server className="w-3 h-3" />
          <span>
            Server: <span className="text-primary font-medium">
              {category === "dub" ? (selectedHindi?.displayName || "Hindi Server") : streamResult?.server}
            </span>
            {" · "}
            <span className={ll.cls + " font-medium"}>{ll.text}</span>
          </span>
        </div>
      )}

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          {prevEp && (
            <Link to={buildEpLink(prevEp)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors">
              <ChevronLeft className="w-4 h-4" /> Prev
            </Link>
          )}
          {nextEp && (
            <Link to={buildEpLink(nextEp)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors">
              Next <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {/* Language dropdown */}
        <div ref={langRef} className="relative">
          <button onClick={() => setLangMenu(!showLangMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors">
            <Globe className="w-4 h-4" />
            <span className={LANG_COLORS[category]}>{currentLang.flag} {currentLang.short}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showLangMenu ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {showLangMenu && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute top-full mt-1 left-0 w-52 bg-card border border-border rounded-lg shadow-card z-30 overflow-hidden">
                {LANGUAGES.map(lang => (
                  <button key={lang.code}
                    onClick={() => { setFallbackNote(null); setCategory(lang.code); setLangMenu(false); setRetryKey(k => k + 1); }}
                    className={`w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-secondary/80 flex items-center gap-2 ${
                      category === lang.code ? "bg-secondary/40 font-medium" : ""
                    }`}>
                    <span className={LANG_COLORS[lang.code]}>{lang.flag}</span>
                    <span className="text-foreground">{lang.label}</span>
                    {category === lang.code && <span className="ml-auto text-[10px] text-primary">Active</span>}
                  </button>
                ))}
                <div className="px-4 py-2 border-t border-border bg-secondary/20">
                  <p className="text-[10px] text-muted-foreground">
                    Auto-fallback: Hindi → English → Japanese
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Server selector */}
        {category === "dub" && hindiSources.length > 1 ? (
          <div className="flex items-center gap-1 border border-orange-500/30 rounded-lg p-0.5 flex-wrap">
            {hindiSources.map(src => (
              <button key={src.name} onClick={() => switchHindiSource(src)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedHindi?.name === src.name ? "bg-orange-500 text-white" : "text-muted-foreground hover:text-foreground"
                }`}>
                {src.displayName}
                {!src.isHLS && <span className="ml-1 text-[9px] opacity-60">EMBED</span>}
              </button>
            ))}
          </div>
        ) : category !== "dub" ? (
          <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
            {(["hd-1", "hd-2"] as const).map((srv, i) => (
              <button key={srv} onClick={() => { setServer(srv); setRetryKey(k => k + 1); }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedServer === srv ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                Server {i + 1}
              </button>
            ))}
            {thumbnailsVttUrl && (
              <button onClick={() => setServer("server3")} title="Server 3 — VTT thumbnail previews"
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedServer === "server3" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                Server 3
              </button>
            )}
          </div>
        ) : null}

        <button onClick={() => setShowEpList(!showEpList)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors ml-auto">
          <List className="w-4 h-4" /> Episodes
        </button>
      </div>

      {/* Episode info + download */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <Link to={`/anime/${animeId}`} className="text-primary hover:underline text-sm">{animeName}</Link>
          <h2 className="font-display text-lg font-bold text-foreground">
            Episode {currentEp?.number}{currentEp?.title ? ` — ${currentEp.title}` : ""}
          </h2>
          <span className={`text-xs font-medium ${ll.cls}`}>{ll.text}</span>
        </div>
        {currentEp?.episodeId && category !== "dub" && (
          <DownloadButton episodeId={currentEp.episodeId} episodeNumber={currentEp.number}
            animeName={animeName} streamUrl={streamResult?.url} />
        )}
      </div>

      {/* Episode list */}
      {showEpList && (
        <div className="mb-6 max-h-64 overflow-y-auto border border-border rounded-lg p-3">
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
            {episodes.map(ep => (
              <Link key={ep.episodeId} to={buildEpLink(ep)}
                className={`flex items-center justify-center h-9 rounded text-sm font-medium transition-colors ${
                  ep.episodeId === fullEpisodeId
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-primary/20"
                }`}>
                {ep.number}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      {episodeId && (
        <div className="mt-6 mb-2 border border-border rounded-lg overflow-hidden">
          <button onClick={() => setCommentsExpanded(!commentsExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-secondary/50 transition-colors">
            <span className="font-display text-sm font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" /> Comments
            </span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${commentsExpanded ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {commentsExpanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="px-4 pb-4">
                  <Suspense fallback={<div className="py-8 text-center text-muted-foreground text-sm">Loading comments...</div>}>
                    <CommentSection episodeId={fullEpisodeId} animeId={animeId} />
                  </Suspense>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Recommended + Regional */}
      {(recommended.length > 0 || user) && (
        <div className="mt-8 flex flex-col lg:flex-row gap-6">
          {recommended.length > 0 && (
            <div className="flex-1">
              <h2 className="font-display text-xl font-bold text-foreground mb-4">You might also like</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {recommended.slice(0, 12).map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
              </div>
            </div>
          )}
          {user && <RegionalPopularWidget className="lg:w-64 flex-shrink-0" />}
        </div>
      )}
    </div>
  );
}
