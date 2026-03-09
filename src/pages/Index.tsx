import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { store, ContinueWatchingItem, mergeCloudWatchHistory } from "@/lib/store";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import AnimeCard from "@/components/AnimeCard";
import AnimeSection from "@/components/AnimeSection";
import SkeletonCard from "@/components/SkeletonCard";
import SwipeableBanner from "@/components/SwipeableBanner";
import { RegionalPopularSection } from "@/components/RegionalPopular";
import { useQuery } from "@tanstack/react-query";
import { api, HomeData, AnimeItem } from "@/lib/api";
import { X, Trash2, Sparkles } from "lucide-react";

function dedup(arr?: any[]) {
  if (!arr) return [];
  const seen = new Set<string>();
  return arr.filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });
}

export default function Index() {
  const { data, isLoading } = useQuery({ queryKey: ["home"], queryFn: api.getHome, staleTime: 5 * 60 * 1000 });
  const { user } = useSupabaseAuth();
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);

  useEffect(() => {
    if (user) {
      // Merge cloud history then load
      mergeCloudWatchHistory().finally(() => {
        setContinueWatching(store.getContinueWatching());
      });
    } else {
      setContinueWatching([]);
    }
  }, [user]);

  const removeCW = (id: string) => {
    store.removeContinueWatching(id);
    setContinueWatching(store.getContinueWatching());
  };

  const clearAllCW = () => {
    store.clearAllContinueWatching();
    setContinueWatching([]);
  };

  // Personalization: track watched genres
  const personalizationEnabled = useMemo(() => {
    try {
      const d = localStorage.getItem("beat_user_prefs");
      if (!d) return true;
      return JSON.parse(d).personalization !== false;
    } catch { return true; }
  }, []);

  // Pick a genre from watched anime for personalized recs
  const watchedGenre = useMemo(() => {
    if (!personalizationEnabled || !user) return null;
    const genres = JSON.parse(localStorage.getItem("beat_watched_genres") || "[]") as string[];
    if (!genres.length) return null;
    // Pick random genre from recent ones
    return genres[Math.floor(Math.random() * Math.min(genres.length, 5))];
  }, [personalizationEnabled, user]);

  const { data: forYouData } = useQuery({
    queryKey: ["forYou", watchedGenre],
    queryFn: () => api.getGenre(watchedGenre!, 1),
    enabled: !!watchedGenre,
    staleTime: 10 * 60 * 1000,
  });

  const forYouAnimes = dedup(forYouData?.animes)?.slice(0, 6) || [];

  const spotlight = data?.spotlightAnimes || [];
  const grid = "grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4";
  const skeletons = Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />);

  return (
    <div>
      {spotlight.length > 0 && <SwipeableBanner items={spotlight} />}

      <div className="container space-y-2">
        {/* Continue Watching */}
        {continueWatching.length > 0 && (
          <AnimeSection
            title="Continue Watching"
            extra={
              <button onClick={clearAllCW} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            }
          >
            <div className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1">
              {continueWatching.map((item) => (
                <div key={item.id} className="shrink-0 w-32 sm:w-40 group relative">
                  <button
                    onClick={(e) => { e.preventDefault(); removeCW(item.id); }}
                    className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <Link to={`/watch/${item.episodeId}`}>
                    <div className="relative aspect-[3/4] rounded-lg overflow-hidden">
                      <img src={item.poster || "/placeholder.svg"} alt={item.name} className="w-full h-full object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary">
                        <div className="h-full bg-primary" style={{ width: `${(item.progress / item.duration) * 100}%` }} />
                      </div>
                    </div>
                    <p className="text-[11px] sm:text-xs text-foreground mt-1.5 line-clamp-1">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">EP {item.episodeNumber}</p>
                  </Link>
                </div>
              ))}
            </div>
          </AnimeSection>
        )}

        {/* Personalized For You */}
        {forYouAnimes.length > 0 && (
          <AnimeSection
            title={`For You — ${watchedGenre}`}
            linkTo={`/genre/${watchedGenre}`}
          >
            <div className={grid}>
              {forYouAnimes.map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
            </div>
          </AnimeSection>
        )}

        <AnimeSection title="Trending" linkTo="/category/trending">
          <div className={grid}>
            {isLoading ? skeletons : data?.trendingAnimes?.slice(0, 6).map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
          </div>
        </AnimeSection>

        <AnimeSection title="Latest Episodes" linkTo="/recent">
          <div className={grid}>
            {isLoading ? skeletons : data?.latestEpisodeAnimes?.slice(0, 6).map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
          </div>
        </AnimeSection>

        <AnimeSection title="Top Airing" linkTo="/category/top-airing">
          <div className={grid}>
            {isLoading ? skeletons : dedup(data?.topAiringAnimes).slice(0, 6).map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
          </div>
        </AnimeSection>

        <AnimeSection title="Most Popular" linkTo="/category/most-popular">
          <div className={grid}>
            {isLoading ? skeletons : dedup(data?.mostPopularAnimes).slice(0, 6).map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
          </div>
        </AnimeSection>
      </div>
    </div>
  );
}
