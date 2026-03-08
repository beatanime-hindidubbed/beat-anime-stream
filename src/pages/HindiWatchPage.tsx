import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import HindiVideoPlayer from "@/components/HindiVideoPlayer";
import DownloadButton from "@/components/DownloadButton";
import BackButton from "@/components/BackButton";
import { getApiPool, getNextApi, proxyUrl as makeProxyUrl } from "@/lib/streaming";
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, List, Loader2, Server, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

// Only allow these providers, mapped to friendly names
const ALLOWED_PROVIDERS: Record<string, string> = {
  "StreamHG": "Server 1",
  "EarnVids": "Server 2",
};

interface HindiSource {
  name: string;
  displayName: string;
  isHLS: boolean;
  url: string;
}

async function fetchHindiSourcesFromAllApis(anilistId: string | undefined, malId: string | undefined, episodeNumber: number): Promise<HindiSource[]> {
  if (!anilistId && !malId) throw new Error("No AniList/MAL ID");
  const paramName = anilistId ? "anilistId" : "malId";
  const paramValue = anilistId || malId;
  const apis = getApiPool();

  // Race ALL APIs simultaneously for fastest response
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const promises = apis.map(async (base) => {
    const url = `${base}/hindiapi/episode?${paramName}=${paramValue}&season=1&episode=${episodeNumber}&type=series`;
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json();
    if (!res.ok || data.status !== 200) throw new Error("Bad response");
    const sources = data.data?.streams || data.data?.sources || data.data?.servers || [];
    const mapped = sources
      .map((src: any) => {
        const provider = src.provider || src.serverName || src.name || "Unknown";
        const friendlyName = ALLOWED_PROVIDERS[provider];
        if (!friendlyName) return null;
        return {
          name: provider,
          displayName: friendlyName,
          isHLS: !!(src.isM3U8 || src.dhls || (src.url && src.url.includes(".m3u8")) || (src.streamUrl && src.streamUrl.includes(".m3u8"))),
          url: src.dhls || src.streamUrl || src.url || "",
        };
      })
      .filter((s: HindiSource | null): s is HindiSource => s !== null && s.url !== "");
    if (mapped.length === 0) throw new Error("No sources");
    return mapped;
  });

  // Use allSettled + find first fulfilled (compatible with all targets)
  try {
    const results = await Promise.allSettled(promises);
    clearTimeout(timeout);
    for (const r of results) {
      if (r.status === "fulfilled") return r.value;
    }
    throw new Error("No Hindi sources found");
  } catch {
    clearTimeout(timeout);
    throw new Error("No Hindi sources found");
  }
}

export default function HindiWatchPage() {
  const navigate = useNavigate();
  const { animeId, episodeNumber } = useParams<{ animeId: string; episodeNumber: string }>();
  const epNum = parseInt(episodeNumber || "1", 10);
  const { settings } = useSiteSettings();

  const [sources, setSources] = useState<HindiSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<HindiSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [showEpList, setShowEpList] = useState(false);
  const [subtitleTracks, setSubtitleTracks] = useState<{ file: string; label?: string; kind?: string; default?: boolean }[]>([]);

  const { data: info } = useQuery({
    queryKey: ["info", animeId],
    queryFn: () => api.getAnimeInfo(animeId!),
    enabled: !!animeId,
  });

  const { data: epData } = useQuery({
    queryKey: ["episodes", animeId],
    queryFn: () => api.getEpisodes(animeId!),
    enabled: !!animeId,
  });

  const episodes = epData?.episodes || [];
  const currentEp = episodes.find((e) => e.number === epNum);
  const animeName = info?.anime?.info?.name || animeId || "";

  // Extract anilistId/malId
  const moreInfo = info?.anime?.moreInfo || {};
  const infoObj = info?.anime?.info as any;
  const anilistId = (moreInfo as any).anilistid || (moreInfo as any).anilist_id || infoObj?.anilistId;
  const malId = (moreInfo as any).malid || (moreInfo as any).mal_id || infoObj?.malId;

  useEffect(() => {
    if (!info) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setSources([]);
      setSelectedSource(null);

      try {
        const srcs = await fetchHindiSourcesFromAllApis(anilistId, malId, epNum);
        if (cancelled) return;
        setSources(srcs);
        const firstHLS = srcs.find((s) => s.isHLS) || srcs[0];
        if (firstHLS) setSelectedSource(firstHLS);
        else setError("No playable sources");
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [info, epNum, retryKey, anilistId, malId]);

  // Fetch subtitles from English HiAnime endpoint
  useEffect(() => {
    if (!currentEp?.episodeId) { setSubtitleTracks([]); return; }
    let cancelled = false;
    const fetchSubs = async () => {
      const apiBase = getNextApi();
      try {
        const res = await fetch(
          `${apiBase}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(currentEp.episodeId!)}&server=hd-2&category=sub`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const rawTracks = data?.data?.tracks || [];
        const subs = rawTracks
          .filter((t: any) => (t.kind || t.lang) !== "thumbnails" && t.lang !== "thumbnails")
          .map((t: any) => ({
            file: makeProxyUrl(t.url || t.file, "https://megacloud.blog/", apiBase),
            label: t.label || t.lang || "Unknown",
            kind: t.kind || "subtitles",
            default: t.default || false,
          }));
        if (!cancelled) setSubtitleTracks(subs);
      } catch { /* silent */ }
    };
    fetchSubs();
    return () => { cancelled = true; };
  }, [currentEp?.episodeId]);

  const hindiHlsSrc = selectedSource?.isHLS ? selectedSource.url : null;
  const hindiIframeSrc = selectedSource && !selectedSource.isHLS ? selectedSource.url : null;

  const renderPlayer = () => {
    if (loading) {
      return (
        <div className="aspect-video rounded-lg bg-secondary flex flex-col items-center justify-center gap-4 text-muted-foreground">
          {settings.loadingGif ? (
            <img src={settings.loadingGif} alt="Loading" className="w-32 h-32 object-contain" />
          ) : (
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          )}
          <p className="text-sm font-medium text-foreground">Finding Hindi stream...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="aspect-video rounded-lg bg-secondary flex flex-col items-center justify-center gap-4">
          <div className="text-6xl">😔</div>
          <p className="text-foreground font-medium">No Hindi stream found</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button onClick={() => setRetryKey((k) => k + 1)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        </div>
      );
    }

    if (hindiHlsSrc) {
      return <HindiVideoPlayer src={hindiHlsSrc} onEnded={() => navigate(`/hindi/watch/${animeId}/${epNum + 1}`)} />;
    }
    if (hindiIframeSrc) {
      return <HindiVideoPlayer iframeSrc={hindiIframeSrc} onEnded={() => navigate(`/hindi/watch/${animeId}/${epNum + 1}`)} />;
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

      <div className="mb-4">{renderPlayer()}</div>

      {/* Stream info */}
      {selectedSource && (
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          <Server className="w-3 h-3" />
          <span>
            Streaming via <span className="text-orange-400 font-medium">{selectedSource.displayName}</span>
            {" · "}<span className="text-orange-400 font-medium">🇮🇳 हिंदी DUB</span>
          </span>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          {epNum > 1 && (
            <Link to={`/hindi/watch/${animeId}/${epNum - 1}`}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80">
              <ChevronLeft className="w-4 h-4" /> Prev
            </Link>
          )}
          {epNum < episodes.length && (
            <Link to={`/hindi/watch/${animeId}/${epNum + 1}`}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80">
              Next <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {/* Server selector */}
        {sources.length > 1 && (
          <div className="flex items-center gap-1 border border-orange-500/30 rounded-lg p-0.5 flex-wrap">
            {sources.map((src) => (
              <button
                key={src.name}
                onClick={() => setSelectedSource(src)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedSource?.name === src.name ? "bg-orange-500 text-white" : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {src.displayName} {!src.isHLS && <span className="ml-1 text-[10px] opacity-60">EMBED</span>}
              </button>
            ))}
          </div>
        )}

        {/* Download — same logic as English player */}
        {hindiHlsSrc && (
          <DownloadButton
            episodeId={`hindi-${animeId}-${epNum}`}
            episodeNumber={epNum}
            animeName={animeName}
            streamUrl={hindiHlsSrc}
          />
        )}

        <button onClick={() => setShowEpList(!showEpList)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80">
          <List className="w-4 h-4" /> Episodes
        </button>
      </div>

      {/* Episode info */}
      <div className="mb-4">
        <Link to={`/hindi/anime/${animeId}`} className="text-primary hover:underline text-lg font-bold">{animeName}</Link>
        <h2 className="text-foreground font-medium">
          Episode {epNum}{currentEp?.title ? ` — ${currentEp.title}` : ""}
        </h2>
        <span className="text-xs text-orange-400 font-medium">🇮🇳 Hindi Dubbed</span>
      </div>

      {/* Episode list */}
      <AnimatePresence>
        {showEpList && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-4">
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5 p-3 bg-secondary/50 rounded-lg max-h-64 overflow-y-auto">
              {episodes.map((ep) => (
                <Link
                  key={ep.number}
                  to={`/hindi/watch/${animeId}/${ep.number}`}
                  className={`flex items-center justify-center h-9 rounded text-xs font-medium transition-colors ${
                    ep.number === epNum ? "bg-orange-500 text-white" : "bg-card text-foreground hover:bg-orange-500/20"
                  }`}
                  title={ep.title || `Episode ${ep.number}`}
                >
                  {ep.number}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
