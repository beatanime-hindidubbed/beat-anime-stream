import { useParams, Link } from "react-router-dom";
import AnimeReviews from "@/components/AnimeReviews";
import AnimeReportButton from "@/components/AnimeReportButton";
import { useQuery } from "@tanstack/react-query";
import { api, AnimeInfo, AnimeItem } from "@/lib/api";
import { store } from "@/lib/store";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import AnimeCard from "@/components/AnimeCard";
import SkeletonCard from "@/components/SkeletonCard";
import BackButton from "@/components/BackButton";
import DownloadButton from "@/components/DownloadButton";
import { useState, useEffect } from "react";
import {
  Play, Bookmark, BookmarkCheck, Star, Clock, Tv, Calendar,
  ChevronDown, ChevronUp, Loader2, Globe, Mic
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AnimeDetail() {
  const { id } = useParams<{ id: string }>();
  const { isHidden } = useSiteSettings();
  const [inWatchlist, setInWatchlist] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);

  const { data: info, isLoading, error } = useQuery({
    queryKey: ["anime-info", id],
    queryFn: () => api.getAnimeInfo(id!),
    enabled: !!id,
  });

  const { data: episodesData, isLoading: epsLoading } = useQuery({
    queryKey: ["anime-episodes", selectedSeason || id],
    queryFn: () => api.getEpisodes(selectedSeason || id!),
    enabled: !!(selectedSeason || id),
  });

  useEffect(() => {
    if (id) setInWatchlist(store.isInWatchlist(id));
  }, [id]);

  if (isHidden(id || "", info?.anime?.info?.name)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">This anime is currently unavailable.</p>
      </div>
    );
  }

  const anime = info?.anime?.info;
  const moreInfo = info?.anime?.moreInfo;
  const stats = anime?.stats;
  const episodes = episodesData?.episodes || [];
  const seasons = info?.seasons || [];
  const related = info?.relatedAnimes || [];
  const recommended = info?.recommendedAnimes || [];

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <p className="text-destructive text-lg font-medium mb-2">Failed to load anime</p>
          <p className="text-muted-foreground text-sm mb-4">The anime might not exist or the server is down.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link to="/" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              Go Home
            </Link>
            {id && <AnimeReportButton animeId={id} />}
          </div>
        </div>
      </div>
    );
  }

  const description = anime.description || "";
  const shortDesc = description.length > 300 ? description.slice(0, 300) + "..." : description;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Banner */}
      <div className="relative w-full h-[40vh] sm:h-[50vh] overflow-hidden">
        <img
          src={anime.poster || "/placeholder.svg"}
          alt={anime.name}
          className="w-full h-full object-cover blur-sm scale-110 opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      </div>

      <div className="container -mt-32 sm:-mt-40 relative z-10 pb-12">
        <BackButton />

        <div className="flex flex-col sm:flex-row gap-6 mt-4">
          {/* Poster */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-shrink-0 w-40 sm:w-52 mx-auto sm:mx-0"
          >
            <img
              src={anime.poster || "/placeholder.svg"}
              alt={anime.name}
              className="w-full rounded-xl shadow-2xl border border-border"
            />
          </motion.div>

          {/* Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex-1 min-w-0"
          >
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-2">
              {anime.name}
            </h1>

            {/* Stats badges */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {stats?.rating && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent/20 text-accent text-xs font-medium">
                  <Star className="w-3 h-3" /> {stats.rating}
                </span>
              )}
              {stats?.type && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/20 text-primary text-xs font-medium">
                  <Tv className="w-3 h-3" /> {stats.type}
                </span>
              )}
              {stats?.duration && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium">
                  <Clock className="w-3 h-3" /> {stats.duration}
                </span>
              )}
              {stats?.quality && (
                <span className="px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium">
                  {stats.quality}
                </span>
              )}
              {stats?.episodes?.sub != null && (
                <span className="px-2 py-1 rounded-md bg-primary/20 text-primary text-xs font-medium">
                  SUB {stats.episodes.sub}
                </span>
              )}
              {stats?.episodes?.dub != null && (
                <span className="px-2 py-1 rounded-md bg-accent/20 text-accent text-xs font-medium">
                  DUB {stats.episodes.dub}
                </span>
              )}
            </div>

            {/* More info */}
            {moreInfo && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 mb-4 text-xs">
                {Object.entries(moreInfo).slice(0, 9).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}: </span>
                    <span className="text-foreground">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Description */}
            <div className="mb-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {showFullDesc ? description : shortDesc}
              </p>
              {description.length > 300 && (
                <button
                  onClick={() => setShowFullDesc(!showFullDesc)}
                  className="flex items-center gap-1 text-xs text-primary mt-1 hover:underline"
                >
                  {showFullDesc ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Read more</>}
                </button>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              {episodes.length > 0 && (
                <Link
                  to={`/watch/${episodes[0].episodeId}`}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity"
                >
                  <Play className="w-4 h-4" /> Watch Now
                </Link>
              )}
              <button
                onClick={toggleWatchlist}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  inWatchlist
                    ? "bg-accent/20 text-accent border border-accent/30"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {inWatchlist ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                {inWatchlist ? "In Watchlist" : "Add to Watchlist"}
              </button>
            </div>
          </motion.div>
        </div>

        {/* Seasons */}
        {seasons.length > 1 && (
          <div className="mt-8">
            <h2 className="font-display text-lg font-bold text-foreground mb-3">Seasons</h2>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {seasons.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSeason(s.id || null)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    (selectedSeason || id) === s.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {s.poster && <img src={s.poster} alt="" className="w-6 h-8 rounded object-cover" />}
                  {s.title || s.name || "Season"}
                  {s.isCurrent && <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded">Current</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Episodes */}
        <div className="mt-8">
          <h2 className="font-display text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            Episodes {episodesData?.totalEpisodes ? `(${episodesData.totalEpisodes})` : ""}
          </h2>
          {epsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading episodes...
            </div>
          ) : episodes.length === 0 ? (
            <p className="text-muted-foreground text-sm">No episodes available yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {episodes.map((ep) => (
                <Link
                  key={ep.episodeId}
                  to={`/watch/${ep.episodeId}`}
                  className={`flex flex-col items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-primary hover:text-primary-foreground ${
                    ep.isFiller
                      ? "bg-accent/10 text-accent border border-accent/20"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  <span className="text-base font-bold">{ep.number}</span>
                  {ep.title && <span className="text-[10px] text-muted-foreground truncate max-w-full mt-0.5">{ep.title}</span>}
                  {ep.isFiller && <span className="text-[9px] text-accent">Filler</span>}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Related Anime */}
        {related.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-lg font-bold text-foreground mb-4">Related</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {related.slice(0, 8).map((a, i) => (
                <AnimeCard key={a.id} anime={a} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Reviews */}
        {id && (
          <div className="mt-10">
            <AnimeReviews animeId={id} />
          </div>
        )}

        {/* Recommended */}
        {recommended.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-lg font-bold text-foreground mb-4">Recommended</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {recommended.slice(0, 8).map((a, i) => (
                <AnimeCard key={a.id} anime={a} index={i} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
