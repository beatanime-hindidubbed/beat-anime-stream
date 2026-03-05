import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { store } from "@/lib/store";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import AnimeCard from "@/components/AnimeCard";
import AnimeDownloadButton from "@/components/AnimeDownloadButton";
import DownloadButton from "@/components/DownloadButton";
import BackButton from "@/components/BackButton";
import { BookmarkPlus, BookmarkCheck, Play, Star, Clock, Tv } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

export default function AnimeDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useSupabaseAuth();
  const [inWatchlist, setInWatchlist] = useState(() => id ? store.isInWatchlist(id) : false);

  // ── Read dub preference set by HindiPage (sessionStorage) or ?lang=dub URL param ──
  const preferDub =
    sessionStorage.getItem("preferDub") === "true" ||
    searchParams.get("lang") === "dub";
  const langParam = preferDub ? "?lang=dub" : "";

  const { data: info, isLoading } = useQuery({
    queryKey: ["info", id],
    queryFn: () => api.getAnimeInfo(id!),
    enabled: !!id,
  });

  const { data: epData } = useQuery({
    queryKey: ["episodes", id],
    queryFn: () => api.getEpisodes(id!),
    enabled: !!id,
  });

  const anime = info?.anime?.info;
  const moreInfo = info?.anime?.moreInfo;
  const episodes = epData?.episodes || [];

  const toggleWatchlist = () => {
    if (!id || !anime) return;
    if (inWatchlist) {
      store.removeFromWatchlist(id);
      setInWatchlist(false);
    } else {
      store.addToWatchlist({ id, name: anime.name || "", poster: anime.poster });
      setInWatchlist(true);
    }
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-64 rounded-lg bg-secondary" />
          <div className="h-6 w-1/3 rounded bg-secondary" />
          <div className="h-4 w-2/3 rounded bg-secondary" />
        </div>
      </div>
    );
  }

  if (!anime) {
    return <div className="container py-16 text-center text-muted-foreground">Anime not found.</div>;
  }

  return (
    <div>
      <div className="container pt-4">
        <BackButton />
      </div>
      {/* Banner */}
      <div className="relative h-[40vh] overflow-hidden">
        <img src={anime.poster} alt={anime.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
      </div>

      <div className="container -mt-32 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row gap-6">
          {/* Poster */}
          <div className="shrink-0">
            <img src={anime.poster} alt={anime.name} className="w-48 h-auto rounded-lg shadow-card" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl md:text-4xl font-bold text-foreground mb-2">{anime.name}</h1>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              {anime.stats?.rating && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Star className="w-4 h-4 text-primary" /> {anime.stats.rating}
                </span>
              )}
              {anime.stats?.type && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Tv className="w-4 h-4" /> {anime.stats.type}
                </span>
              )}
              {anime.stats?.duration && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" /> {anime.stats.duration}
                </span>
              )}
              {anime.stats?.episodes && (
                <div className="flex gap-1">
                  {anime.stats.episodes.sub != null && (
                    <span className="px-2 py-0.5 rounded text-xs bg-primary text-primary-foreground">SUB {anime.stats.episodes.sub}</span>
                  )}
                  {anime.stats.episodes.dub != null && (
                    <span className="px-2 py-0.5 rounded text-xs bg-accent text-accent-foreground">DUB {anime.stats.episodes.dub}</span>
                  )}
                </div>
              )}
            </div>

            {anime.description && (
              <p className="text-sm text-muted-foreground mb-4 max-w-2xl line-clamp-3">{anime.description}</p>
            )}

            <div className="flex items-center gap-3 flex-wrap mb-6">
              {episodes.length > 0 && (
                <Link
                  to={`/watch/${episodes[0].episodeId}${langParam}`}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-primary text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  <Play className="w-4 h-4" />
                  {langParam ? "Watch in Hindi" : "Watch Now"}
                </Link>
              )}
              {id && episodes.length > 0 && (
                <AnimeDownloadButton
                  animeId={id}
                  animeName={anime.name || "anime"}
                  totalEpisodes={episodes.length}
                />
              )}
              {user && (
                <button
                  onClick={toggleWatchlist}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    inWatchlist ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {inWatchlist ? <BookmarkCheck className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
                  {inWatchlist ? "In Watchlist" : "Add to Watchlist"}
                </button>
              )}
            </div>

            {/* More info */}
            {moreInfo && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                {Object.entries(moreInfo).map(([key, val]) => (
                  <div key={key}>
                    <span className="text-muted-foreground">{key}: </span>
                    <span className="text-foreground">{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Episodes */}
        {episodes.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-xl font-bold text-foreground mb-4">Episodes ({episodes.length})</h2>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
              {episodes.map((ep) => (
                <Link
                  key={ep.episodeId}
                  to={`/watch/${ep.episodeId}${langParam}`}
                  className={`flex items-center justify-center h-10 rounded-lg text-sm font-medium transition-colors ${
                    ep.isFiller ? "bg-accent/30 text-accent-foreground" : "bg-secondary text-secondary-foreground"
                  } hover:bg-primary hover:text-primary-foreground`}
                  title={ep.title || `Episode ${ep.number}`}
                >
                  {ep.number}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Seasons */}
        {info?.seasons && info.seasons.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-xl font-bold text-foreground mb-4">Seasons</h2>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
              {info.seasons.map((s) => (
                <Link
                  key={s.id}
                  to={`/anime/${s.id}`}
                  className={`shrink-0 w-28 group ${s.isCurrent ? "ring-2 ring-primary rounded-lg" : ""}`}
                >
                  <img src={s.poster} alt={s.name} className="w-full aspect-[3/4] object-cover rounded-lg" />
                  <p className="text-xs text-foreground mt-1 line-clamp-1">{s.name || s.title}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recommended */}
        {info?.recommendedAnimes && info.recommendedAnimes.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-xl font-bold text-foreground mb-4">Recommended</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {info.recommendedAnimes.slice(0, 6).map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
