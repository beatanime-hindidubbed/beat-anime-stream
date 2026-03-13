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
import { ChevronLeft, ChevronRight, List, Loader2, Server, RefreshCw, Globe, ChevronDown, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { AnimatePresence, motion } from "framer-motion";

const HINDI_API_BASE = "https://beat-anime-api.onrender.com/api/v1";

// Race multiple API endpoints for faster Hindi source fetching
async function raceHindiFetch(url: string): Promise<any> {
  const apis = JSON.parse(localStorage.getItem("beat_api_endpoints") || "[]");
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

const LANGUAGES = [
  { code: "dub", label: "Hindi (Dub)", short: "🇮🇳 HINDI" },
  { code: "eng", label: "English (Sub/Dub)", short: "ENG" },
  { code: "raw", label: "Japanese (Raw)", short: "RAW" },
] as const;

interface HindiSource {
  name: string;
  displayName: string;
  isHLS: boolean;
  url: string;
  headers: Record<string, string>;
}

const ALLOWED_HINDI_PROVIDERS: Record<string, string> = {
  "StreamHG": "Server 1",
  "EarnVids": "Server 2 Embedded",
};

/**
 * Detect correct season number from seasons array and current animeId.
 * Fixes bug where Season 2 fetches Season 1 episodes from Hindi API.
 */
function detectSeasonNumber(seasons: any[], currentAnimeId: string): number {
  if (!seasons || seasons.length === 0) return 1;

  // Find which index in seasons array matches the current animeId
  const currentSeasonIdx = seasons.findIndex((s: any) => s.id === currentAnimeId);

  if (currentSeasonIdx === -1) {
    // Current anime not found by id — try isCurrent flag
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

  // Found by id — extract from title or use positional index
  const season = seasons[currentSeasonIdx];
  const titleMatch = (season.title || season.name || "").match(/season\s*(\d+)/i);
  if (titleMatch) return parseInt(titleMatch[1], 10);

  // Count TV-type seasons only up to this index
  const tvSeasons = seasons.filter((s: any) => {
    const t = (s.title || s.name || "").toLowerCase();
    return t.includes("season") || (!t.includes("movie") && !t.includes("special") && !t.includes("ova"));
  });
  const tvIdx = tvSeasons.findIndex((s: any) => s.id === currentAnimeId);
  return tvIdx >= 0 ? tvIdx + 1 : currentSeasonIdx + 1;
}

async function fetchHindiSources(animeInfo: any, episodeNumber: number, currentAnimeId: string): Promise<HindiSource[]> {
  const moreInfo = animeInfo?.anime?.moreInfo || animeInfo?.moreInfo || {};
  const info = animeInfo?.anime?.info || {};

  const anilistId = moreInfo.anilistid || moreInfo.anilist_id || info.anilistId;
  const malId = moreInfo.malid || moreInfo.mal_id || info.malId;

  if (!anilistId && !malId) throw new Error("No AniList/MAL ID found for this anime");

  const paramName = anilistId ? "anilistId" : "malId";
  const paramValue = anilistId || malId;

  // Use the fixed season detection logic
  const seasons = animeInfo?.seasons || [];
  const seasonNumber = detectSeasonNumber(seasons, currentAnimeId);

  const url = `${HINDI_API_BASE}/hindiapi/episode?${paramName}=${paramValue}&season=${seasonNumber}&episode=${episodeNumber}&type=series`;
  const data = await raceHindiFetch(url);

  const sources = data.data?.streams || data.data?.sources || data.data?.servers || [];
  if (!sources.length) throw new Error("No Hindi sources found");

  return sources
    .map((src: any) => {
      const provider = src.provider || src.serverName || src.name || "Unknown";
      const displayName = ALLOWED_HINDI_PROVIDERS[provider];
      if (!displayName) return null;
      return {
        name: provider,
        displayName,
        isHLS: !!(
          src.isM3U8 || src.dhls ||
          (src.url && src.url.includes(".m3u8")) ||
          (src.streamUrl && src.streamUrl.includes(".m3u8"))
        ),
        url: src.dhls || src.streamUrl || src.url || "",
        headers: src.headers || {},
      };
    })
    .filter((s: HindiSource | null): s is HindiSource => s !== null && s.url !== "");
}

export default function WatchPage() {
  const navigate = useNavigate();
  const { episodeId } = useParams<{ episodeId: string }>();
  const [searchParams] = useSearchParams();
  const fullEpisodeId = episodeId
    ? `${episodeId}${searchParams.get("ep") ? `?ep=${searchParams.get("ep")}` : ""}`
    : "";

  // Default to Hindi dub unless explicitly set otherwise
  const initialCategory = (() => {
    const lang = searchParams.get("lang");
    if (lang === "sub" || lang === "engdub" || lang === "eng") return "eng";
    if (lang === "raw") return "raw";
    // Default is Hindi dub
    return "dub";
  })();

  const [category, setCategory] = useState<string>(initialCategory);
  const [selectedServer, setSelectedServer] = useState<string>("hd-2");
  const [showEpList, setShowEpList] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [streamResult, setStreamResult] = useState<StreamResult | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [retryMessage, setRetryMessage] = useState("");
  const [thumbnailsVttUrl, setThumbnailsVttUrl] = useState<string | null>(null);

  // Hindi state
  const [hindiSources, setHindiSources] = useState<HindiSource[]>([]);
  const [selectedHindiSource, setSelectedHindiSource] = useState<HindiSource | null>(null);
  const [hindiHlsSrc, setHindiHlsSrc] = useState<string | null>(null);
  const [hindiIframeSrc, setHindiIframeSrc] = useState<string | null>(null);

  const langRef = useRef<HTMLDivElement>(null);
  const playerAnchorRef = useRef<HTMLDivElement>(null);
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  const [showPip, setShowPip] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { settings } = useSiteSettings();

  const animeId = fullEpisodeId.split("?")[0];

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setShowLangMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // PiP: decide visibility from anchor position
  useEffect(() => {
    const updatePip = () => {
      const anchor = playerAnchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setShowPip(rect.top < -250);
    };

    window.addEventListener("scroll", updatePip, { passive: true });
    window.addEventListener("resize", updatePip);
    updatePip();

    return () => {
      window.removeEventListener("scroll", updatePip);
      window.removeEventListener("resize", updatePip);
    };
  }, []);

  const scrollToPlayer = () => {
    playerAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // PiP: directly mutate DOM style to avoid React re-renders/flickering
  useEffect(() => {
    const el = playerWrapperRef.current;
    if (!el) return;
    if (showPip) {
      el.style.position = "fixed";
      el.style.bottom = "12px";
      el.style.right = "12px";
      el.style.width = isMobile ? "160px" : "320px";
      el.style.zIndex = "50";
      el.style.borderRadius = "12px";
      el.style.overflow = "hidden";
      el.style.boxShadow = "0 8px 30px rgba(0,0,0,0.6)";
      el.style.border = "1px solid hsl(var(--border))";
      el.style.cursor = "pointer";
      el.style.maxHeight = "";
      const inner = el.querySelector("div, video, iframe");
      if (inner) (inner as HTMLElement).style.pointerEvents = "none";
    } else {
      el.style.position = "";
      el.style.bottom = "";
      el.style.right = "";
      el.style.width = "";
      el.style.zIndex = "";
      el.style.borderRadius = "";
      el.style.overflow = "";
      el.style.boxShadow = "";
      el.style.border = "";
      el.style.cursor = "";
      const inner = el.querySelector("div, video, iframe");
      if (inner) (inner as HTMLElement).style.pointerEvents = "";
    }
  }, [showPip, isMobile]);

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

  // Track genres for personalization
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

  const episodes = epData?.episodes || [];
  const currentEp = episodes.find((e) => e.episodeId === fullEpisodeId);
  const currentIdx = episodes.findIndex((e) => e.episodeId === fullEpisodeId);
  const prevEp = currentIdx > 0 ? episodes[currentIdx - 1] : null;
  const nextEp = currentIdx < episodes.length - 1 ? episodes[currentIdx + 1] : null;

  const { user } = useSupabaseAuth();
  const { trackView } = useRegion();
  const animeName = info?.anime?.info?.name || animeId;
  const animePoster = info?.anime?.info?.poster;

  // Track regional view when anime info loads
  useEffect(() => {
    if (!info || !animeName || !animeId) return;
    trackView({ id: animeId, name: animeName, poster: animePoster });
  }, [info, animeId, animeName, animePoster, trackView]);

  // Switch between Hindi sources
  const switchHindiSource = (src: HindiSource) => {
    setSelectedHindiSource(src);
    setStreamResult(null);
    setHindiHlsSrc(null);
    setHindiIframeSrc(null);
    if (src.isHLS) {
      setHindiHlsSrc(src.url);
    } else {
      setHindiIframeSrc(src.url);
    }
  };

  // ── Hindi stream loader ─────────────────────────────────────────────
  useEffect(() => {
    if (category !== "dub" || !info || !currentEp) return;
    let cancelled = false;

    const load = async () => {
      setStreamLoading(true);
      setStreamError(null);
      setStreamResult(null);
      setHindiSources([]);
      setSelectedHindiSource(null);
      setHindiHlsSrc(null);
      setHindiIframeSrc(null);
      setRetryMessage("Fetching Hindi sources...");

      try {
        // Pass animeId so season detection works correctly
        const sources = await fetchHindiSources(info, currentEp.number || 1, animeId);
        if (cancelled) return;

        setHindiSources(sources);

        const firstHLS = sources.find((s) => s.isHLS) || sources[0];
        if (firstHLS) {
          switchHindiSource(firstHLS);
        } else {
          if (!cancelled) {
            toast.warning("Hindi Dub not available for this episode. Switching to English...", { duration: 5000 });
            setCategory("eng");
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          toast.warning("Hindi Dub not available for this episode. Switching to English...", { duration: 5000 });
          setCategory("eng");
        }
      } finally {
        if (!cancelled) { setStreamLoading(false); setRetryMessage(""); }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [category, info, currentEp, retryKey, animeId]);

  // ── HiAnime (sub/engdub/raw) stream loader ─────────────────────────
  const [engMode, setEngMode] = useState<"sub" | "dub">("sub");

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
      setThumbnailsVttUrl(null);

      // Check cache first (1hr TTL)
      const cacheKey = `eng_${fullEpisodeId}_${category}`;
      const cached = getCachedStream<StreamResult>(cacheKey);
      if (cached && retryKey === 0) {
        setSelectedServer(cached.server as any);
        setStreamResult(cached);
        setStreamLoading(false);
        if (category === "eng") setEngMode(cached.category as "sub" | "dub");
        return;
      }

      const categoriesToTry = category === "eng" ? ["sub", "dub"] : ["sub"];

      // Retry helper: retries a fetch up to maxRetries times on non-success, with backoff
      const fetchWithRetry = async (fn: () => Promise<any>, maxRetries = 4, baseDelay = 800) => {
        let lastErr: any;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            const result = await fn();
            if (result) return result;
          } catch (e) {
            lastErr = e;
          }
          if (attempt < maxRetries - 1) {
            await new Promise(r => setTimeout(r, baseDelay * Math.pow(1.5, attempt)));
          }
        }
        throw lastErr ?? new Error("All retries failed");
      };

      for (const apiCat of categoriesToTry) {
        for (let i = 0; i < HIANIME_SERVERS.length; i++) {
          if (cancelled) return;
          const server = HIANIME_SERVERS[i];
          setRetryMessage(`Trying ${apiCat.toUpperCase()} on ${server.toUpperCase()}...`);
          try {
            const result = await fetchWithRetry(
              () => getWorkingStream({ episodeId: fullEpisodeId, category: apiCat, server }),
              4, 800
            );
            if (cancelled) return;
            if (result) {
              setCachedStream(cacheKey, result);
              setSelectedServer(server);
              setStreamResult(result);
              setStreamLoading(false);
              setRetryMessage("");
              if (category === "eng") setEngMode(apiCat as "sub" | "dub");

              // Extract thumbnails VTT from tracks if present
              const thumbTrack = (result.tracks || []).find((t: any) =>
                (t.kind || t.lang || "") === "thumbnails" || (t.kind || t.lang || "") === "thumbnail"
              );
              setThumbnailsVttUrl(thumbTrack ? (thumbTrack.file || thumbTrack.url || null) : null);

              // If tracks are missing (API returned 404 on first try but video loaded),
              // retry fetching tracks-only in the background for up to 5 more attempts
              const hasTracks = (result.tracks || []).filter((t: any) => {
                const k = t.kind || t.lang || "";
                return k !== "thumbnails" && k !== "thumbnail";
              }).length > 0;

              if (!hasTracks) {
                (async () => {
                  for (let retryIdx = 0; retryIdx < 5; retryIdx++) {
                    if (cancelled) return;
                    await new Promise(r => setTimeout(r, 1200 * Math.pow(1.4, retryIdx)));
                    try {
                      const apis = JSON.parse(localStorage.getItem("beat_api_endpoints") || "[]");
                      const apiBase = apis[0] || "https://beat-anime-api-2.onrender.com/api/v1";
                      const res = await fetch(
                        `${apiBase}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(fullEpisodeId)}&server=${server}&category=${apiCat}`
                      );
                      if (!res.ok) continue;
                      const data = await res.json();
                      if (cancelled) return;
                      const newTracks = (data?.data?.tracks || []);
                      const subtitleTracks = newTracks.filter((t: any) => {
                        const k = t.kind || t.lang || "";
                        return k !== "thumbnails" && k !== "thumbnail";
                      });
                      const newThumbTrack = newTracks.find((t: any) =>
                        (t.kind || t.lang || "") === "thumbnails" || (t.kind || t.lang || "") === "thumbnail"
                      );
                      if (subtitleTracks.length > 0) {
                        setStreamResult(prev => prev ? { ...prev, tracks: newTracks } : prev);
                      }
                      if (newThumbTrack) {
                        setThumbnailsVttUrl(newThumbTrack.file || newThumbTrack.url || null);
                      }
                      if (subtitleTracks.length > 0) break; // success
                    } catch {}
                  }
                })();
              }

              return;
            }
          } catch {}
        }
      }

      if (!cancelled) { setStreamError("all_failed"); setStreamLoading(false); }
    };

    fetchStream();
    return () => { cancelled = true; };
  }, [fullEpisodeId, category, retryKey]);

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
  const currentLang = LANGUAGES.find((l) => l.code === category) || LANGUAGES[0];
  const engLabel = category === "eng" ? (engMode === "dub" ? "ENG DUB" : "ENG SUB") : "";

  const buildEpLink = (ep: { episodeId?: string }) => {
    if (!ep.episodeId) return "#";
    if (category !== "sub") return `/watch/${ep.episodeId}?lang=${category}`;
    return `/watch/${ep.episodeId}`;
  };

  const renderPlayer = () => {
    if (streamLoading) {
      return (
        <div className="aspect-video rounded-lg bg-secondary flex flex-col items-center justify-center gap-4 text-muted-foreground">
          {settings.loadingGif ? (
            <img src={settings.loadingGif} alt="Loading" className="w-32 h-32 object-contain" />
          ) : (
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          )}
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
          {settings.errorGif ? (
            <img src={settings.errorGif} alt="Error" className="w-40 h-40 object-contain" />
          ) : (
            <div className="text-6xl">😔</div>
          )}
          <div className="text-center px-4">
            <p className="text-foreground font-medium mb-1">
              {category === "dub" ? "Hindi Dub Not Available" : "Stream unavailable right now"}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {category === "dub"
                ? "This episode doesn't have a Hindi dub yet"
                : "Try switching the language or come back later"}
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              <button onClick={() => setRetryKey((k) => k + 1)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:shadow-glow transition-all duration-200">
                <RefreshCw className="w-4 h-4" /> Try Again
              </button>
              {category === "dub" && (
                <button onClick={() => setCategory("eng")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">
                  Switch to English Dub/Sub
                </button>
              )}
              {category !== "dub" && category !== "sub" && (
                <button onClick={() => setCategory("sub")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">
                  Switch to SUB
                </button>
              )}
              {category !== "dub" && (
                <button onClick={() => setCategory("dub")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">
                  Switch to HINDI
                </button>
              )}
              <AnimeReportButton animeId={animeId} animeName={animeName} />
            </div>
          </div>
        </div>
      );
    }

    // ── FIXED: episodeId passed so HindiVideoPlayer can fetch intro/outro/captions internally ──
    if (category === "dub" && hindiHlsSrc) {
      return (
        <HindiVideoPlayer
          src={hindiHlsSrc}
          episodeId={fullEpisodeId}
          disableInternalMiniPlayer
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => { if (nextEp) navigate(buildEpLink(nextEp)); }}
        />
      );
    }

    if (category === "dub" && hindiIframeSrc) {
      return (
        <HindiVideoPlayer
          iframeSrc={hindiIframeSrc}
          episodeId={fullEpisodeId}
          disableInternalMiniPlayer
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => { if (nextEp) navigate(buildEpLink(nextEp)); }}
        />
      );
    }

    if (streamResult?.type === "hls") {
      const normalizedTracks = (streamResult.tracks || [])
        .filter((t: any) => {
          const kind = t.kind || t.lang || "";
          return kind !== "thumbnails" && kind !== "thumbnail";
        })
        .map((t: any) => ({
          file: t.file || t.url,
          label: t.label || t.lang || "Unknown",
          kind: (t.kind === "captions" ? "captions" : "subtitles") as "subtitles" | "captions",
          default: t.default || false,
        }))
        .filter((t: any) => !!t.file);

      return (
        <VideoPlayer
          src={streamResult.url}
          disableInternalMiniPlayer
          tracks={normalizedTracks}
          intro={streamResult.intro}
          outro={streamResult.outro}
          thumbnailsVtt={selectedServer === "server3" && thumbnailsVttUrl ? thumbnailsVttUrl : undefined}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => { if (nextEp) navigate(buildEpLink(nextEp)); }}
        />
      );
    }

    return (
      <div className="aspect-video rounded-lg bg-secondary flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  };

  const [commentsExpanded, setCommentsExpanded] = useState(false);

  return (
    <div className="container py-4 max-w-6xl">
      <BackButton />

      <div ref={playerAnchorRef} className="h-px w-full" aria-hidden="true" />

      {/* Player — DOM style mutated directly for PiP (no React re-render) */}
      <div
        ref={playerWrapperRef}
        className="mb-2"
        onClick={showPip ? scrollToPlayer : undefined}
      >
        {renderPlayer()}
      </div>
      {/* Spacer so content doesn't jump when player is fixed */}
      {showPip && <div className="mb-2" style={{ aspectRatio: "16/9" }} />}

      {/* Stream info */}
      {(streamResult || hindiHlsSrc || hindiIframeSrc) && (
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          <Server className="w-3 h-3" />
          <span>
            Streaming via{" "}
            <span className="text-primary font-medium">
            {category === "dub" ? (selectedHindiSource?.displayName || "Hindi Server") : streamResult?.server}
            </span>
            {" · "}
            <span className={category === "dub" ? "text-orange-400 font-medium" : ""}>
              {category === "dub" ? "🇮🇳 हिंदी DUB" : category === "eng" ? engLabel : (streamResult?.category || category).toUpperCase()}
            </span>
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
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
          >
            <Globe className="w-4 h-4" />
            {category === "eng" ? engLabel || "ENG" : currentLang.short}
            <ChevronDown className={`w-3 h-3 transition-transform ${showLangMenu ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {showLangMenu && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full mt-1 left-0 w-48 bg-card border border-border rounded-lg shadow-card z-30 overflow-hidden"
              >
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setCategory(lang.code);
                      setShowLangMenu(false);
                      setRetryKey(k => k + 1);
                    }}
                    className={`w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-secondary/80 ${
                      category === lang.code ? "text-primary font-medium bg-secondary/40" : "text-foreground"
                    }`}
                  >
                    {lang.label}
                    {lang.code === "dub" && <span className="ml-2 text-xs text-orange-400">🇮🇳</span>}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Server selector */}
        {category === "dub" && hindiSources.length > 1 ? (
          <div className="flex items-center gap-1 border border-orange-500/30 rounded-lg p-0.5 flex-wrap">
            {hindiSources.map((src) => (
              <button
                key={src.name}
                onClick={() => switchHindiSource(src)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedHindiSource?.name === src.name
                    ? "bg-orange-500 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {src.displayName}
                {!src.isHLS && <span className="ml-1 text-[9px] opacity-60">EMBED</span>}
              </button>
            ))}
          </div>
        ) : category !== "dub" ? (
          <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
            {(["hd-1", "hd-2"] as const).map((srv, i) => (
              <button
                key={srv}
                onClick={() => { setSelectedServer(srv); setRetryKey((k) => k + 1); }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedServer === srv ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Server {i + 1}
              </button>
            ))}
            {thumbnailsVttUrl && (
              <button
                onClick={() => setSelectedServer("server3")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedServer === "server3" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                title="Server 3 — VTT thumbnail previews"
              >
                Server 3
              </button>
            )}
          </div>
        ) : null}

        <button
          onClick={() => setShowEpList(!showEpList)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors ml-auto"
        >
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
          {category === "dub" && (
            <span className="text-xs text-orange-400 font-medium">🇮🇳 Hindi Dubbed</span>
          )}
        </div>
        {currentEp?.episodeId && category !== "dub" && (
          <DownloadButton
            episodeId={currentEp.episodeId}
            episodeNumber={currentEp.number}
            animeName={animeName}
            streamUrl={streamResult?.url}
          />
        )}
      </div>

      {/* Episode list */}
      {showEpList && (
        <div className="mb-6 max-h-64 overflow-y-auto border border-border rounded-lg p-3">
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
            {episodes.map((ep) => (
              <Link
                key={ep.episodeId}
                to={buildEpLink(ep)}
                className={`flex items-center justify-center h-9 rounded text-sm font-medium transition-colors ${
                  ep.episodeId === fullEpisodeId
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-primary/20"
                }`}
              >
                {ep.number}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Comments — collapsed by default */}
      {episodeId && (
        <div className="mt-6 mb-2 border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setCommentsExpanded(!commentsExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-secondary/50 transition-colors"
          >
            <span className="font-display text-sm font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Comments
            </span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${commentsExpanded ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {commentsExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
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

      {/* Recommended + Regional sidebar */}
      {(recommended.length > 0 || user) && (
        <div className="mt-8 flex flex-col lg:flex-row gap-6">
          {recommended.length > 0 && (
            <div className="flex-1">
              <h2 className="font-display text-xl font-bold text-foreground mb-4">You might also like</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {recommended.slice(0, 12).map((a, i) => (
                  <AnimeCard key={a.id} anime={a} index={i} />
                ))}
              </div>
            </div>
          )}
          {user && <RegionalPopularWidget className="lg:w-64 flex-shrink-0" />}
        </div>
      )}
    </div>
  );
}
