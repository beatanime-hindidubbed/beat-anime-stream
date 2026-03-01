import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { api, AnimeItem } from "@/lib/api";
import AnimeCard from "@/components/AnimeCard";
import SkeletonCard from "@/components/SkeletonCard";
import { motion } from "framer-motion";
import { Zap, Search, Filter } from "lucide-react";

const CATEGORIES = [
  { key: "most-popular", label: "Popular" },
  { key: "top-airing", label: "Airing" },
  { key: "most-favorite", label: "Favorite" },
  { key: "top-upcoming", label: "Upcoming" },
  { key: "recently-updated", label: "Recent" },
];

const GENRES = [
  "action", "adventure", "comedy", "drama", "fantasy",
  "horror", "mystery", "romance", "sci-fi", "slice-of-life",
  "sports", "supernatural", "thriller", "ecchi", "mecha",
];

export default function ExplorePage() {
  const [activeCategory, setActiveCategory] = useState("most-popular");
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [allAnimes, setAllAnimes] = useState<AnimeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (pg: number, reset = false) => {
    setLoading(true);
    try {
      let data;
      if (activeGenre) {
        data = await api.getGenre(activeGenre, pg);
      } else if (searchQuery.trim()) {
        data = await api.search(searchQuery, pg);
      } else {
        data = await api.getCategory(activeCategory, pg);
      }
      const items = data?.animes || [];
      setAllAnimes(prev => reset ? items : [...prev, ...items]);
      setHasMore(items.length >= 20);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, activeGenre, searchQuery]);

  // Reset on filter change
  useEffect(() => {
    setPage(1);
    setAllAnimes([]);
    setHasMore(true);
    fetchPage(1, true);
  }, [activeCategory, activeGenre, searchQuery]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!loaderRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && hasMore) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchPage(nextPage);
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [loading, hasMore, page, fetchPage]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <div className="container py-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">Explore</h1>
            <p className="text-sm text-muted-foreground">Discover all anime — scroll endlessly</p>
          </div>
        </div>
      </motion.div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search all anime..."
          className="w-full h-10 pl-9 pr-4 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </form>

      {/* Category tabs */}
      {!searchQuery && (
        <>
          <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => { setActiveGenre(null); setActiveCategory(cat.key); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  activeCategory === cat.key && !activeGenre
                    ? "bg-gradient-primary text-primary-foreground shadow-glow"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Genre pills */}
          <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-2">
            <button
              onClick={() => setActiveGenre(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap border ${
                !activeGenre ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              All
            </button>
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => setActiveGenre(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap border capitalize ${
                  activeGenre === g ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mb-8">
        {allAnimes.map((a, i) => (
          <AnimeCard key={`${a.id}-${i}`} anime={a} index={i % 12} />
        ))}
        {loading && Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={`sk-${i}`} />)}
      </div>

      {/* Infinite scroll trigger + cyberpunk load more */}
      <div ref={loaderRef} className="flex justify-center py-8">
        {hasMore && !loading && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { const next = page + 1; setPage(next); fetchPage(next); }}
            className="relative px-8 py-3 text-sm font-bold text-primary border border-primary/60 rounded-none overflow-hidden group"
            style={{
              clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",
              background: "linear-gradient(135deg, rgba(0,255,200,0.05), rgba(0,255,200,0.02))",
            }}
          >
            <span className="relative z-10 tracking-widest uppercase">⚡ Load More</span>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "linear-gradient(135deg, rgba(0,255,200,0.15), rgba(0,200,255,0.1))" }} />
          </motion.button>
        )}
        {!hasMore && allAnimes.length > 0 && (
          <p className="text-muted-foreground text-sm">You've reached the end of the universe 🌌</p>
        )}
      </div>
    </div>
  );
}
