import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, HomeData, AnimeItem } from "@/lib/api";
import { store } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import AnimeCard from "@/components/AnimeCard";
import AnimeSection from "@/components/AnimeSection";
import SkeletonCard from "@/components/SkeletonCard";
import { motion, AnimatePresence } from "framer-motion";
import { Play, ChevronLeft, ChevronRight } from "lucide-react";

export default function Index() {
  const { data, isLoading } = useQuery({ queryKey: ["home"], queryFn: api.getHome, staleTime: 5 * 60 * 1000 });
  const { user } = useAuth();
  const [spotIndex, setSpotIndex] = useState(0);
  const continueWatching = user ? store.getContinueWatching() : [];

  const spotlight = data?.spotlightAnimes || [];

  useEffect(() => {
    if (spotlight.length <= 1) return;
    const timer = setInterval(() => setSpotIndex((i) => (i + 1) % spotlight.length), 6000);
    return () => clearInterval(timer);
  }, [spotlight.length]);

  const currentSpot = spotlight[spotIndex];

  const grid = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4";
  const skeletons = Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />);

  return (
    <div>
      {/* Spotlight */}
      {currentSpot && (
        <div className="relative h-[50vh] md:h-[60vh] overflow-hidden mb-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={spotIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0"
            >
              <img src={currentSpot.poster} alt={currentSpot.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />
            </motion.div>
          </AnimatePresence>

          <div className="absolute bottom-0 left-0 right-0 container pb-8 z-10">
            <motion.div key={spotIndex} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <span className="text-xs font-medium text-primary mb-2 block">#{spotIndex + 1} Spotlight</span>
              <h1 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-3 max-w-xl">{currentSpot.name}</h1>
              {currentSpot.description && (
                <p className="text-sm text-muted-foreground max-w-lg line-clamp-3 mb-4">{currentSpot.description}</p>
              )}
              <div className="flex items-center gap-3">
                <Link to={`/anime/${currentSpot.id}`} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-primary text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">
                  <Play className="w-4 h-4" /> Watch Now
                </Link>
              </div>
            </motion.div>
          </div>

          {spotlight.length > 1 && (
            <div className="absolute bottom-8 right-4 md:right-8 flex items-center gap-2 z-10">
              <button onClick={() => setSpotIndex((i) => (i - 1 + spotlight.length) % spotlight.length)} className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setSpotIndex((i) => (i + 1) % spotlight.length)} className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="container">
        {/* Continue Watching */}
        {continueWatching.length > 0 && (
          <AnimeSection title="Continue Watching">
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
              {continueWatching.map((item) => (
                <Link key={item.id} to={`/watch/${item.episodeId}`} className="shrink-0 w-40 group">
                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden">
                    <img src={item.poster || "/placeholder.svg"} alt={item.name} className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary">
                      <div className="h-full bg-primary" style={{ width: `${(item.progress / item.duration) * 100}%` }} />
                    </div>
                  </div>
                  <p className="text-xs text-foreground mt-1.5 line-clamp-1">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">EP {item.episodeNumber}</p>
                </Link>
              ))}
            </div>
          </AnimeSection>
        )}

        {/* Trending */}
        <AnimeSection title="Trending" linkTo="/category/trending">
          <div className={grid}>
            {isLoading ? skeletons : data?.trendingAnimes?.slice(0, 6).map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
          </div>
        </AnimeSection>

        {/* Latest Episodes */}
        <AnimeSection title="Latest Episodes" linkTo="/category/recently-updated">
          <div className={grid}>
            {isLoading ? skeletons : data?.latestEpisodeAnimes?.slice(0, 6).map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
          </div>
        </AnimeSection>

        {/* Top Airing */}
        <AnimeSection title="Top Airing" linkTo="/category/top-airing">
          <div className={grid}>
            {isLoading ? skeletons : data?.topAiringAnimes?.slice(0, 6).map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
          </div>
        </AnimeSection>

        {/* Most Popular */}
        <AnimeSection title="Most Popular" linkTo="/category/most-popular">
          <div className={grid}>
            {isLoading ? skeletons : data?.mostPopularAnimes?.slice(0, 6).map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
          </div>
        </AnimeSection>
      </div>
    </div>
  );
}
