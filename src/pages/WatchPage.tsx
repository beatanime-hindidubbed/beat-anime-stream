import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, Episode } from "@/lib/api";
import { store } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import VideoPlayer from "@/components/VideoPlayer";
import IframePlayer from "@/components/IframePlayer";
import BackButton from "@/components/BackButton";
import AnimeCard from "@/components/AnimeCard";
import { getWorkingStream, StreamResult } from "@/lib/streaming";
import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, List, Loader2, AlertTriangle, Server } from "lucide-react";

export default function WatchPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fullEpisodeId = episodeId ? `${episodeId}${searchParams.get("ep") ? `?ep=${searchParams.get("ep")}` : ""}` : "";

  const [preferredLang, setPreferredLang] = useState<string>("hi");
  const [showEpList, setShowEpList] = useState(false);
  const [streamResult, setStreamResult] = useState<StreamResult | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const animeId = fullEpisodeId.split("?")[0];

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

  const { user } = useAuth();
  const animeName = info?.anime?.info?.name || animeId;
  const animePoster = info?.anime?.info?.poster;

  // Fetch stream with multi-provider fallback
  useEffect(() => {
    if (!fullEpisodeId || !animeName) return;
    let cancelled = false;

    const fetchStream = async () => {
      setStreamLoading(true);
      setStreamError(null);
      setStreamResult(null);

      try {
        const result = await getWorkingStream({
          episodeId: fullEpisodeId,
          animeName,
          episodeNumber: currentEp?.number || 1,
          preferredLang,
          preferredCategory: preferredLang === "hi" ? "dub" : "sub",
        });

        if (cancelled) return;
        if (result) {
          setStreamResult(result);
        } else {
          setStreamError("All servers failed. Try again in a moment.");
        }
      } catch {
        if (!cancelled) setStreamError("Failed to load stream.");
      } finally {
        if (!cancelled) setStreamLoading(false);
      }
    };

    fetchStream();
    return () => { cancelled = true; };
  }, [fullEpisodeId, animeName, currentEp?.number, preferredLang]);

  const handleTimeUpdate = useCallback(
    (time: number, duration: number) => {
      if (!user || !animeId || !fullEpisodeId || !currentEp) return;
      if (Math.floor(time) % 10 === 0 && duration > 0) {
        store.updateContinueWatching({
          id: animeId,
          name: animeName,
          poster: animePoster,
          episodeId: fullEpisodeId,
          episodeNumber: currentEp.number || 0,
          progress: time,
          duration,
        });
      }
    },
    [user, animeId, fullEpisodeId, currentEp, animeName, animePoster]
  );

  // Genre-based recommendations
  const genres = info?.anime?.moreInfo?.genres;
  const genreList = typeof genres === "string"
    ? genres.split(",").map(g => g.trim().toLowerCase())
    : [];

  const recommended = info?.recommendedAnimes || info?.relatedAnimes || [];

  const langOptions = [
    { code: "hi", label: "HINDI" },
    { code: "en", label: "SUB" },
    { code: "ja", label: "RAW" },
  ];

  return (
    <div className="container py-4 max-w-6xl">
      <BackButton />

      {/* Player */}
      <div className="mb-4">
        {streamLoading ? (
          <div className="aspect-video rounded-lg bg-secondary flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Finding best server...</span>
          </div>
        ) : streamError ? (
          <div className="aspect-video rounded-lg bg-secondary flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <AlertTriangle className="w-8 h-8" />
            <span className="text-sm">{streamError}</span>
            <button onClick={() => setPreferredLang(prev => prev)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">
              Retry
            </button>
          </div>
        ) : streamResult?.type === "iframe" ? (
          <IframePlayer src={streamResult.url} />
        ) : streamResult?.type === "hls" ? (
          <VideoPlayer
            src={streamResult.url}
            tracks={streamResult.tracks}
            intro={streamResult.intro}
            outro={streamResult.outro}
            onTimeUpdate={handleTimeUpdate}
          />
        ) : (
          <div className="aspect-video rounded-lg bg-secondary flex items-center justify-center text-muted-foreground">
            No source available.
          </div>
        )}
      </div>

      {/* Server info */}
      {streamResult && (
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          <Server className="w-3 h-3" />
          <span>Playing via <span className="text-primary font-medium">{streamResult.provider}</span> / {streamResult.server} ({streamResult.category})</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
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

        <div className="flex items-center gap-2">
          {langOptions.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setPreferredLang(lang.code)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${preferredLang === lang.code ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
            >
              {lang.label}
            </button>
          ))}
          <button
            onClick={() => setShowEpList(!showEpList)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            <List className="w-4 h-4" /> Episodes
          </button>
        </div>
      </div>

      {/* Episode info */}
      <div className="mb-4">
        <Link to={`/anime/${animeId}`} className="text-primary hover:underline text-sm">{animeName}</Link>
        <h2 className="font-display text-lg font-bold text-foreground">
          Episode {currentEp?.number}{currentEp?.title ? ` - ${currentEp.title}` : ""}
        </h2>
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

      {/* Recommended / Same genre */}
      {recommended.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-xl font-bold text-foreground mb-4">Recommended</h2>
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
