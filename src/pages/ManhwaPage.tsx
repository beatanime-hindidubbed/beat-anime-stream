import { useState, useEffect, useRef, useCallback } from "react";
import { api, AnimeItem } from "@/lib/api";
import AnimeCard from "@/components/AnimeCard";
import SkeletonCard from "@/components/SkeletonCard";
import { motion } from "framer-motion";

// Known donghua titles for accurate filtering
const DONGHUA_TITLES = [
  "soul land", "battle through the heavens", "stellar transformation",
  "martial universe", "the king's avatar", "fog hill", "jade dynasty",
  "perfect world", "swallowed star", "wu dong qian kun", "douluo dalu",
  "spirit sword sovereign", "tales of demons and gods", "immortality",
  "martial peak", "against the gods", "the daily life of the immortal king",
  "link click", "scissor seven", "heaven official's blessing",
  "mo dao zu shi", "grandmaster of demonic cultivation",
  "dragon prince yuan", "renegade immortal", "a record of mortal's journey",
];

export default function ManhwaPage() {
  const [page, setPage] = useState(1);
  const [animes, setAnimes] = useState<AnimeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchIdx, setSearchIdx] = useState(0);
  const loaderRef = useRef<HTMLDivElement>(null);

  const fetchDonghua = useCallback(async (pg: number, idx: number, reset = false) => {
    setLoading(true);
    try {
      // Search specific donghua titles to ensure only Chinese anime
      const keyword = DONGHUA_TITLES[idx % DONGHUA_TITLES.length];
      const data = await api.search(keyword, pg);
      const items = data?.animes || [];

      setAnimes((prev) => reset ? items : [...prev, ...items]);
      setHasMore(items.length >= 6);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    setAnimes([]);
    setHasMore(true);
    setSearchIdx(0);
    fetchDonghua(1, 0, true);
  }, []);

  const loadMore = () => {
    const nextIdx = searchIdx + 1;
    setSearchIdx(nextIdx);
    setPage((p) => p + 1);
    fetchDonghua(1, nextIdx);
  };

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
              中国动漫 · Chinese Anime Only
            </p>
          </div>
        </div>

        {/* Quick-search chips */}
        <div className="flex gap-2 mt-4 overflow-x-auto scrollbar-hide pb-1">
          {DONGHUA_TITLES.slice(0, 12).map((kw) => (
            <button
              key={kw}
              onClick={() => {
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
          <p className="font-medium">No Donghua found</p>
          <p className="text-sm mt-1">Try a different search above</p>
        </div>
      )}

      <div className="flex justify-center py-4">
        {hasMore && !loading && animes.length > 0 && (
          <button
            onClick={loadMore}
            className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Load More
          </button>
        )}
        {!hasMore && animes.length > 0 && (
          <p className="text-muted-foreground text-sm">That's all for now 🐉</p>
        )}
      </div>
    </div>
  );
}
