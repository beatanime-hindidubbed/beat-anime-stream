import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { store } from "@/lib/store";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import AnimeCard from "@/components/AnimeCard";
import BackButton from "@/components/BackButton";
import { BookmarkPlus, BookmarkCheck, Play, Star, Clock, Tv } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

export default function HindiAnimePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSupabaseAuth();
  const [inWatchlist, setInWatchlist] = useState(() => id ? store.isInWatchlist(id) : false);

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
      <div className="relative h-[40vh] overflow-hidden">
        <img src={anime.poster} alt={anime.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
      </div>

      <div className="container -mt-32 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row gap-6">
          <div className="shrink-0">
            <img src={anime.poster} alt={anime.name} className="w-48 h-auto rounded-lg shadow-card" />
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl md:text-4xl font-bold text-foreground mb-2">{anime.name}</h1>
            <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-orange-500 text-white mb-3">🇮🇳 Hindi Dubbed</span>

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
            </div>

            {anime.description && (
              <p className="text-sm text-muted-foreground mb-4 max-w-2xl line-clamp-3">{anime.description}</p>
            )}

            <div className="flex items-center gap-3 flex-wrap mb-6">
              {episodes.length > 0 && (
                <Link
                  to={`/hindi/watch/${id}/1`}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                >
                  <Play className="w-4 h-4" />
                  Watch in Hindi 🇮🇳
                </Link>
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

        {/* Episodes - link to Hindi watch page */}
        {episodes.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-xl font-bold text-foreground mb-4">Episodes ({episodes.length})</h2>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
              {episodes.map((ep) => (
                <Link
                  key={ep.episodeId || ep.number}
                  to={`/hindi/watch/${id}/${ep.number}`}
                  className={`flex items-center justify-center h-10 rounded-lg text-sm font-medium transition-colors ${
                    ep.isFiller ? "bg-accent/30 text-accent-foreground" : "bg-secondary text-secondary-foreground"
                  } hover:bg-orange-500 hover:text-white`}
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
                  to={`/hindi/anime/${s.id}`}
                  className={`shrink-0 w-28 group ${s.isCurrent ? "ring-2 ring-orange-500 rounded-lg" : ""}`}
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
