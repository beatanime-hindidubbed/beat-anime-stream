import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { store } from "@/lib/store";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import VideoPlayer from "@/components/VideoPlayer";
import HindiVideoPlayer from "@/components/HindiVideoPlayer";
import DownloadButton from "@/components/DownloadButton";
import BackButton from "@/components/BackButton";
import AnimeCard from "@/components/AnimeCard";
import { getWorkingStream, StreamResult, HIANIME_SERVERS } from "@/lib/streaming";
import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, List, Loader2, Server, RefreshCw, Globe, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const HINDI_API_BASE = "https://beat-anime-api.onrender.com/api/v1";

const LANGUAGES = [
  { code: "sub", label: "English (Sub)", short: "ENG SUB" },
  { code: "dub", label: "Hindi (Dub)", short: "HINDI" },
  { code: "raw", label: "Japanese (Raw)", short: "RAW" },
] as const;

interface HindiSource {
  name: string;
  isHLS: boolean;
  url: string;
  headers: Record<string, string>;
}

async function fetchHindiSources(animeInfo: any, episodeNumber: number): Promise<HindiSource[]> {
  const moreInfo = animeInfo?.anime?.moreInfo || animeInfo?.moreInfo || {};
  const info = animeInfo?.anime?.info || {};

  const anilistId = moreInfo.anilistid || moreInfo.anilist_id || info.anilistId;
  const malId = moreInfo.malid || moreInfo.mal_id || info.malId;

  if (!anilistId && !malId) throw new Error("No AniList/MAL ID found for this anime");

  const paramName = anilistId ? "anilistId" : "malId";
  const paramValue = anilistId || malId;

  const url = `${HINDI_API_BASE}/hindiapi/episode?${paramName}=${paramValue}&season=1&episode=${episodeNumber}&type=series`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok || data.status !== 200) throw new Error(data.error || "No Hindi sources found");

  const sources = data.data?.streams || data.data?.sources || data.data?.servers || [];
  if (!sources.length) throw new Error("No Hindi sources found");

  return sources.map((src: any) => ({
    name: src.provider || src.serverName || src.name || "Unknown",
    isHLS: !!(src.dhls || src.isM3U8 || (src.url && src.url.includes(".m3u8")) || (src.streamUrl && src.streamUrl.includes(".m3u8"))),
    url: src.dhls || src.streamUrl || src.url || "",
    headers: src.headers || {},
  }));
}

export default function WatchPage() {
  const navigate = useNavigate();
  const { episodeId } = useParams<{ episodeId: string }>();
  const [searchParams] = useSearchParams();
  const fullEpisodeId = episodeId ? `${episodeId}${searchParams.get("ep") ? `?ep=${searchParams.get("ep")}` : ""}` : "";

  const [category, setCategory] = useState<string>("sub");
  const [selectedServer, setSelectedServer] = useState<string>("hd-2");
  const [showEpList, setShowEpList] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [streamResult, setStreamResult] = useState<StreamResult | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [retryMessage, setRetryMessage] = useState("");

  // Hindi-specific state
  const [hindiSources, setHindiSources] = useState<HindiSource[]>([]);
  const [selectedHindiSource, setSelectedHindiSource] = useState<HindiSource | null>(null);

  // Derived: what the HindiVideoPlayer actually receives
  const [hindiHlsSrc, setHindiHlsSrc] = useState<string | undefined>(undefined);
  const [hindiEmbedSrc, setHindiEmbedSrc] = useState<string | undefined>(undefined);

  const langRef = useRef<HTMLDivElement>(null);
  const { settings } = useSiteSettings();

  const animeId = fullEpisodeId.split("?")[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setShowLangMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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

  const episodes = epData?.episodes || [];
  const currentEp = episodes.find((e) => e.episodeId === fullEpisodeId);
  const currentIdx = episodes.findIndex((e) => e.episodeId === fullEpisodeId);
  const prevEp = currentIdx > 0 ? episodes[currentIdx - 1] : null;
  const nextEp = currentIdx < episodes.length - 1 ? episodes[currentIdx + 1] : null;

  const { user } = useSupabaseAuth();
  const animeName = info?.anime?.info?.name || animeId;
  const animePoster = info?.anime?.info?.poster;

  // ── Apply hindi source to player state ─────────────────────────────────
  const applyHindiSource = (src: HindiSource) => {
    setSelectedHindiSource(src);
    setStreamResult(null);
    if (src.isHLS) {
      setHindiHlsSrc(src.url);
      setHindiEmbedSrc(undefined);
    } else {
      // Embed source — no sandbox, no proxy needed
      setHindiHlsSrc(undefined);
      setHindiEmbedSrc(src.url);
    }
  };

  // ── Hindi stream loader ──────────────────────────────────────────────────
  useEffect(() => {
    if (category !== "dub" || !info || !currentEp) return;
    let cancelled = false;

    const load = async () => {
      setStreamLoading(true);
      setStreamError(null);
      setStreamResult(null);
      setHindiSources([]);
      setSelectedHindiSource(null);
      setHindiHlsSrc(undefined);
      setHindiEmbedSrc(undefined);
      setRetryMessage("Fetching Hindi sources...");

      try {
        const sources = await fetchHindiSources(info, currentEp.number || 1);
        if (cancelled) return;

        setHindiSources(sources);

        // Prefer HLS sources first, fall back to embed
        const firstHLS = sources.find((s) => s.isHLS) || sources[0];
        if (firstHLS) {
          applyHindiSource(firstHLS);
        } else {
          setStreamError("all_failed");
        }
      } catch (err: any) {
        if (!cancelled) setStreamError(err.message || "all_failed");
      } finally {
        if (!cancelled) { setStreamLoading(false); setRetryMessage(""); }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [category, info, currentEp, retryKey]);

  // ── HiAnime (sub/raw) stream loader ──────────────────────────────────────
  useEffect(() => {
    if (category === "dub" || !fullEpisodeId) return;
    let cancelled = false;

    const fetchStream = async () => {
      setStreamLoading(true);
      setStreamError(null);
      setStreamResult(null);
      setHindiSources([]);
      setHindiHlsSrc(undefined);
      setHindiEmbedSrc(undefined);
      setRetryMessage("");

      for (let i = 0; i < HIANIME_SERVERS.length; i++) {
        if (cancelled) return;
        const server = HIANIME_SERVERS[i];
        if (i > 0) {
          setRetryMessage(`Trying server ${i + 1}/${HIANIME_SERVERS.length}: ${server.toUpperCase()}...`);
          await new Promise((r) => setTimeout(r, 800));
        }
        try {
          const result = await getWorkingStream({ episodeId: fullEpisodeId, category: category === "raw" ? "sub" : category, server });
          if (cancelled) return;
          if (result) { setSelectedServer(server); setStreamResult(result); setStreamLoading(false); setRetryMessage(""); return; }
        } catch {}
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
              {category === "dub" ? "No Hindi stream found for this episode" : "Stream unavailable right now"}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {category === "dub"
                ? streamError !== "all_failed" ? streamError : "This anime may not have a Hindi dub available"
                : "Try switching the language or come back later"}
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              <button onClick={() => setRetryKey((k) => k + 1)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">
                <RefreshCw className="w-4 h-4" /> Try Again
              </button>
              {category !== "sub" && (
                <button onClick={() => setCategory("sub")} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm">
                  Switch to SUB
                </button>
              )}
              {category !== "dub" && (
                <button onClick={() => setCategory("dub")} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm">
                  Switch to HINDI
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── Hindi DUB mode → use HindiVideoPlayer ──────────────────────────
    if (category === "dub" && (hindiHlsSrc || hindiEmbedSrc)) {
      return (
        <HindiVideoPlayer
          src={hindiHlsSrc}
          embedSrc={hindiEmbedSrc}
          sources={hindiSources}
          onSourceChange={applyHindiSource}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => { if (nextEp) navigate(`/watch/${nextEp.episodeId}`); }}
        />
      );
    }

    // ── Sub / Raw → use standard VideoPlayer ───────────────────────────
    if (streamResult?.type === "hls") {
      return (
        <VideoPlayer
          src={streamResult.url}
          tracks={streamResult.tracks}
          intro={streamResult.intro}
          outro={streamResult.outro}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => { if (nextEp) navigate(`/watch/${nextEp.episodeId}`); }}
        />
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

      {/* Player */}
      <div className="mb-4">{renderPlayer()}</div>

      {/* Stream info */}
      {(streamResult || hindiHlsSrc || hindiEmbedSrc) && (
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          <Server className="w-3 h-3" />
          <span>
            Streaming via{" "}
            <span className="text-primary font-medium">
              {category === "dub" ? (selectedHindiSource?.name || "Hindi Server") : streamResult?.server}
            </span>
            {" · "}
            <span className={category === "dub" ? "text-orange-400 font-medium" : ""}>
              {category === "dub"
                ? `🇮🇳 हिंदी DUB${selectedHindiSource && !selectedHindiSource.isHLS ? " (Embed)" : " (HLS)"}`
                : (streamResult?.category || category).toUpperCase()}
            </span>
          </span>
        </div>
      )}

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Prev / Next */}
        <div className="flex items-center gap-2">
          {prevEp && (
            <Link to={`/watch/${prevEp.episodeId}`} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors">
              <ChevronLeft className="w-4 h-4" /> Prev
            </Link>
          )}
          {nextEp && (
            <Link to={`/watch/${nextEp.episodeId}`} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors">
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
            {currentLang.short}
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
                    onClick={() => { setCategory(lang.code); setShowLangMenu(false); }}
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
                onClick={() => applyHindiSource(src)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedHindiSource?.name === src.name
                    ? "bg-orange-500 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {src.name}
                {!src.isHLS && <span className="ml-1 text-[9px] opacity-60">EMBED</span>}
              </button>
            ))}
          </div>
        ) : category !== "dub" ? (
          <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
            {HIANIME_SERVERS.map((srv) => (
              <button
                key={srv}
                onClick={() => { setSelectedServer(srv); setRetryKey((k) => k + 1); }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedServer === srv ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {srv.toUpperCase()}
              </button>
            ))}
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
        {currentEp?.episodeId && (
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
                to={`/watch/${ep.episodeId}`}
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

      {/* Recommended */}
      {recommended.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-xl font-bold text-foreground mb-4">You might also like</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {recommended.slice(0, 12).map((a, i) => (
              <AnimeCard key={a.id} anime={a} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
