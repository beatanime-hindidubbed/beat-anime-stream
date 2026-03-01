import { useState, useEffect, useRef, useCallback } from "react";
import { api, AnimeItem } from "@/lib/api";
import AnimeCard from "@/components/AnimeCard";
import SkeletonCard from "@/components/SkeletonCard";
import { motion } from "framer-motion";

// Donghua = Chinese anime (中国动漫)
// HiAnime API: search "chinese" or "donghua" keyword + these genres
const DONGHUA_GENRES = [
  "action", "adventure", "fantasy", "martial-arts", "supernatural",
  "drama", "romance", "comedy", "isekai", "demons",
];

// Search keywords that pull Chinese anime from HiAnime
const DONGHUA_KEYWORDS = [
  "donghua", "chinese", "manhua", "chinese animation",
  "jade dynasty", "stellar transformation", "battle through the heavens",
  "soul land", "the king's avatar", "fog hill",
];

export default function ManhwaPage() {
  const [activeGenre, setActiveGenre] = useState<string>("action");
  const [page, setPage] = useState(1);
  const [animes, setAnimes] = useState<AnimeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (pg: number, reset = false) => {
    setLoading(true);
    try {
      // Search using "chinese" keyword + genre to pull donghua from HiAnime
      const [keywordData, genreData] = await Promise.allSettled([
        api.search(`chinese ${activeGenre}`, pg),
        api.getGenre(activeGenre, pg),
      ]);

      // Combine results and deduplicate
      const keywordItems = keywordData.status === "fulfilled"
        ? (keywordData.value?.animes || [])
        : [];
      const genreItems = genreData.status === "fulfilled"
        ? (genreData.value?.animes || [])
        : [];

      // Merge and deduplicate by id
      const seen = new Set<string>();
      const merged: AnimeItem[] = [];
      [...keywordItems, ...genreItems].forEach((a) => {
        if (!seen.has(a.id)) { seen.add(a.id); merged.push(a); }
      });

      setAnimes((prev) => reset ? merged : [...prev, ...merged]);
      setHasMore(merged.length >= 12);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [activeGenre]);

  useEffect(() => {
    setPage(1);
    setAnimes([]);
    setHasMore(true);
    fetchPage(1, true);
  }, [activeGenre]);

  useEffect(() => {
    if (!loaderRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && hasMore) {
          const next = page + 1;
          setPage(next);
          fetchPage(next);
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [loading, hasMore, page, fetchPage]);

  return (
    <div className="container py-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-accent flex items-center justify-center text-xl">
            🐉
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">
              Donghua
            </h1>
            <p className="text-sm text-muted-foreground">
              中国动漫 · Chinese Anime
            </p>
          </div>
        </div>

        {/* Popular donghua quick-search chips */}
        <div className="flex gap-2 mt-4 overflow-x-auto scrollbar-hide pb-1">
          {DONGHUA_KEYWORDS.map((kw) => (
            <button
              key={kw}
              onClick={() => {
                // Direct search for famous donghua titles
                setAnimes([]);
                setLoading(true);
                api.search(kw, 1)
                  .then((d) => { setAnimes(d?.animes || []); setHasMore(false); })
                  .catch(() => {})
                  .finally(() => setLoading(false));
              }}
              className="px-3 py-1 rounded-full text-xs font-medium bg-secondary/60 text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors whitespace-nowrap border border-border capitalize"
            >
              {kw}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Genre filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-2">
        {DONGHUA_GENRES.map((g) => (
          <button
            key={g}
            onClick={() => setActiveGenre(g)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap capitalize ${
              activeGenre === g
                ? "bg-gradient-accent text-accent-foreground shadow-glow"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mb-8">
        {animes.map((a, i) => (
          <AnimeCard key={`${a.id}-${i}`} anime={a} index={i % 12} />
        ))}
        {loading && Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>

      {animes.length === 0 && !loading && (
        <div className="text-center py-20 text-muted-foreground">
          <div className="text-5xl mb-4">🐲</div>
          <p className="font-medium">No Donghua found for this genre</p>
          <p className="text-sm mt-1">Try a different genre or use the search chips above</p>
        </div>
      )}

      <div ref={loaderRef} className="flex justify-center py-4">
        {!hasMore && animes.length > 0 && (
          <p className="text-muted-foreground text-sm">That's all for now 🐉</p>
        )}
      </div>
    </div>
  );
}
