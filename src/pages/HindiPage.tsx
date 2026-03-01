import { useState, useEffect, useRef, useCallback } from "react";
import { api, AnimeItem } from "@/lib/api";
import AnimeCard from "@/components/AnimeCard";
import SkeletonCard from "@/components/SkeletonCard";
import { motion } from "framer-motion";
import { Globe } from "lucide-react";

const LANGUAGES = [
  { key: "hindi", label: "🇮🇳 Hindi", searchTerm: "hindi dub" },
  { key: "tamil", label: "🎬 Tamil", searchTerm: "tamil dub" },
  { key: "telugu", label: "🎭 Telugu", searchTerm: "telugu dub" },
];

// Popular anime IDs to prioritize for dub content
const POPULAR_DUB_SEARCHES = [
  "dragon ball", "naruto", "one piece", "bleach", "attack on titan",
  "death note", "demon slayer", "my hero academia", "jujutsu kaisen",
  "fullmetal alchemist", "sword art online", "fairy tail", "black clover",
];

export default function HindiPage() {
  const [activeLang, setActiveLang] = useState("hindi");
  const [animes, setAnimes] = useState<AnimeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set<string>());

  const fetchDubbedAnime = useCallback(async (pg: number, reset = false) => {
    setLoading(true);
    if (reset) seenIds.current.clear();

    try {
      const results: AnimeItem[] = [];

      if (pg === 1) {
        // First page: search specifically for dub content
        const [dubCategory, searchResult] = await Promise.allSettled([
          api.getCategory("most-popular", 1),
          api.search("dub", 1),
        ]);

        const catItems = dubCategory.status === "fulfilled" ? dubCategory.value?.animes || [] : [];
        const searchItems = searchResult.status === "fulfilled" ? searchResult.value?.animes || [] : [];

        // Combine and filter to only dubbed anime
        [...catItems, ...searchItems].forEach((a) => {
          if (!seenIds.current.has(a.id) && a.episodes?.dub && a.episodes.dub > 0) {
            seenIds.current.add(a.id);
            results.push(a);
          }
        });

        // Also search popular titles
        const popularSearch = await api.search(
          activeLang === "hindi" ? "hindi" : activeLang === "tamil" ? "tamil" : "telugu",
          1
        ).catch(() => ({ animes: [] as AnimeItem[] }));

        (popularSearch?.animes || []).forEach((a) => {
          if (!seenIds.current.has(a.id)) {
            seenIds.current.add(a.id);
            results.push(a);
          }
        });
      } else {
        // Subsequent pages
        const data = await api.getCategory("most-popular", pg);
        (data?.animes || []).forEach((a) => {
          if (!seenIds.current.has(a.id) && a.episodes?.dub && a.episodes.dub > 0) {
            seenIds.current.add(a.id);
            results.push(a);
          }
        });
        setHasMore((data?.animes?.length || 0) >= 20);
      }

      setAnimes(prev => reset ? results : [...prev, ...results]);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [activeLang]);

  useEffect(() => {
    setPage(1);
    setAnimes([]);
    setHasMore(true);
    fetchDubbedAnime(1, true);
  }, [activeLang]);

  useEffect(() => {
    if (!loaderRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && hasMore) {
          const next = page + 1;
          setPage(next);
          fetchDubbedAnime(next);
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [loading, hasMore, page, fetchDubbedAnime]);

  return (
    <div className="container py-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-accent flex items-center justify-center">
            <Globe className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">Hindi & Regional</h1>
            <p className="text-sm text-muted-foreground">Only dubbed anime — watch in your language</p>
          </div>
        </div>
      </motion.div>

      {/* Language tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-2">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.key}
            onClick={() => setActiveLang(lang.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              activeLang === lang.key
                ? "bg-gradient-accent text-accent-foreground shadow-glow"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {lang.label}
          </button>
        ))}
      </div>

      {/* Info banner */}
      <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 mb-6">
        <p className="text-sm text-primary">
          🎙️ Showing only anime with dubbed episodes available. All anime below have{" "}
          <span className="font-bold">DUB</span> versions.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mb-8">
        {animes.map((a, i) => (
          <AnimeCard key={`${a.id}-${i}`} anime={a} index={i % 12} />
        ))}
        {loading && Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>

      {animes.length === 0 && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <Globe className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p>No dubbed anime found. Try a different language.</p>
        </div>
      )}

      <div ref={loaderRef} className="flex justify-center py-4">
        {!hasMore && animes.length > 0 && (
          <p className="text-muted-foreground text-sm">All dubbed anime loaded 🎙️</p>
        )}
      </div>
    </div>
  );
}
