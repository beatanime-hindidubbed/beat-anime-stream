import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { store } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import VideoPlayer from "@/components/VideoPlayer";
import BackButton from "@/components/BackButton";
import AnimeCard from "@/components/AnimeCard";
import { getWorkingStream, StreamResult, HIANIME_SERVERS } from "@/lib/streaming";
import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, List, Loader2, AlertTriangle, Server, RefreshCw } from "lucide-react";

export default function WatchPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const [searchParams] = useSearchParams();
  const fullEpisodeId = episodeId ? `${episodeId}${searchParams.get("ep") ? `?ep=${searchParams.get("ep")}` : ""}` : "";

  const [category, setCategory] = useState<"sub" | "dub">("sub");
  const [selectedServer, setSelectedServer] = useState<string>("hd-2");
  const [showEpList, setShowEpList] = useState(false);
  const [streamResult, setStreamResult] = useState<StreamResult | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

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

  // Fetch stream
  useEffect(() => {
    if (!fullEpisodeId) return;
    let cancelled = false;

    const fetchStream = async () => {
      setStreamLoading(true);
      setStreamError(null);
      setStreamResult(null);

      try {
        const result = await getWorkingStream({
          episodeId: fullEpisodeId,
          category,
          server: selectedServer,
        });

        if (cancelled) return;
        if (result) {
          setStreamResult(result);
        } else {
          setStreamError("All servers failed. Try switching server or category.");
        }
      } catch {
        if (!cancelled) setStreamError("Failed to load stream.");
      } finally {
        if (!cancelled) setStreamLoading(false);
      }
    };

    fetchStream();
    return () => { cancelled = true; };
  }, [fullEpisodeId, category, selectedServer, retryKey]);

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

  const recommended = info?.recommendedAnimes || info?.relatedAnimes || [];

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
            <button onClick={() => setRetryKey(k => k + 1)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
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
            No source available. Try another server.
          </div>
        )}
      </div>

      {/* Server info */}
      {streamResult && (
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          <Server className="w-3 h-3" />
          <span>Playing via <span className="text-primary font-medium">{streamResult.server}</span> ({streamResult.category})</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Prev/Next */}
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

        {/* Category: SUB / DUB */}
        <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
          {(["sub", "dub"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${category === cat ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {cat.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Server selector */}
        <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
          {HIANIME_SERVERS.map((srv) => (
            <button
              key={srv}
              onClick={() => setSelectedServer(srv)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${selectedServer === srv ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {srv.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Episodes toggle */}
        <button
          onClick={() => setShowEpList(!showEpList)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors ml-auto"
        >
          <List className="w-4 h-4" /> Episodes
        </button>
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

      {/* Recommended */}
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
