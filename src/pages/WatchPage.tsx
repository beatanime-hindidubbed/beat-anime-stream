import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, Episode } from "@/lib/api";
import { store } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import VideoPlayer from "@/components/VideoPlayer";
import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, List } from "lucide-react";

export default function WatchPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const [searchParams] = useSearchParams();
  // episodeId can contain "?" from URL pattern like "anime-id?ep=123"
  // The route param captures everything, so we reconstruct
  const fullEpisodeId = episodeId ? `${episodeId}${searchParams.get("ep") ? `?ep=${searchParams.get("ep")}` : ""}` : "";

  const [category, setCategory] = useState<"sub" | "dub">("sub");
  const [showEpList, setShowEpList] = useState(false);

  const { data: sources, isLoading } = useQuery({
    queryKey: ["sources", fullEpisodeId, category],
    queryFn: () => api.getEpisodeSources(fullEpisodeId, category),
    enabled: !!fullEpisodeId,
  });

  // Extract anime ID from episodeId (format: "anime-id?ep=xxx")
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

  const handleTimeUpdate = useCallback(
    (time: number, duration: number) => {
      if (!user || !animeId || !fullEpisodeId || !currentEp) return;
      // Save every 10 seconds
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

  const streamUrl = sources?.sources?.[0]?.url || "";

  return (
    <div className="container py-4 max-w-6xl">
      {/* Player */}
      <div className="mb-4">
        {isLoading ? (
          <div className="aspect-video rounded-lg bg-secondary animate-pulse" />
        ) : streamUrl ? (
          <VideoPlayer
            src={streamUrl}
            tracks={sources?.tracks}
            intro={sources?.intro}
            outro={sources?.outro}
            onTimeUpdate={handleTimeUpdate}
          />
        ) : (
          <div className="aspect-video rounded-lg bg-secondary flex items-center justify-center text-muted-foreground">
            No source available. Try switching sub/dub.
          </div>
        )}
      </div>

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
          <button
            onClick={() => setCategory("sub")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${category === "sub" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
          >
            SUB
          </button>
          <button
            onClick={() => setCategory("dub")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${category === "dub" ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"}`}
          >
            DUB
          </button>
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
    </div>
  );
}
