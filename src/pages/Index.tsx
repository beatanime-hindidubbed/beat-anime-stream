import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { store, ContinueWatchingItem } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import AnimeCard from "@/components/AnimeCard";
import AnimeSection from "@/components/AnimeSection";
import SkeletonCard from "@/components/SkeletonCard";
import SwipeableBanner from "@/components/SwipeableBanner";
import { useQuery } from "@tanstack/react-query";
import { api, HomeData } from "@/lib/api";
import { X, Trash2 } from "lucide-react";

export default function Index() {
  const { data, isLoading } = useQuery({ queryKey: ["home"], queryFn: api.getHome, staleTime: 5 * 60 * 1000 });
  const { user } = useAuth();
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);

  useEffect(() => {
    if (user) setContinueWatching(store.getContinueWatching());
  }, [user]);

  const removeCW = (id: string) => {
    store.removeContinueWatching(id);
    setContinueWatching(store.getContinueWatching());
  };

  const clearAllCW = () => {
    store.clearAllContinueWatching();
    setContinueWatching([]);
  };

  const spotlight = data?.spotlightAnimes || [];
  const grid = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4";
  const skeletons = Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />);

  return (
    <div>
      {spotlight.length > 0 && <SwipeableBanner items={spotlight} />}

      <div className="container">
        {/* Continue Watching */}
        {continueWatching.length > 0 && (
          <AnimeSection
            title="Continue Watching"
            extra={
              <button onClick={clearAllCW} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-3 h-3" /> Clear All
              </button>
            }
          >
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
              {continueWatching.map((item) => (
                <div key={item.id} className="shrink-0 w-40 group relative">
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
                    <p className="text-xs text-foreground mt-1.5 line-clamp-1">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">EP {item.episodeNumber}</p>
                  </Link>
                </div>
              ))}
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
            {isLoading ? skeletons : data?.topAiringAnimes?.slice(0, 6).map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
          </div>
        </AnimeSection>

        <AnimeSection title="Most Popular" linkTo="/category/most-popular">
          <div className={grid}>
            {isLoading ? skeletons : data?.mostPopularAnimes?.slice(0, 6).map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
          </div>
        </AnimeSection>
      </div>
    </div>
  );
}
