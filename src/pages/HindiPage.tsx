import { useState, useEffect, useRef, useCallback } from "react";
import { api, AnimeItem } from "@/lib/api";
import AnimeCard from "@/components/AnimeCard";
import SkeletonCard from "@/components/SkeletonCard";
import { motion } from "framer-motion";
import { Globe } from "lucide-react";

const LANGUAGES = [
  { key: "hindi", label: "🇮🇳 Hindi", searchTerms: ["hindi dub", "hindi"] },
  { key: "tamil", label: "Tamil", searchTerms: ["tamil dub"] },
  { key: "telugu", label: "Telugu", searchTerms: ["telugu dub"] },
];

// Strict filter: only show anime that has at least 1 dub episode confirmed
function hasDub(a: AnimeItem): boolean {
  return typeof a.episodes?.dub === "number" && a.episodes.dub > 0;
}

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
        // Pull from multiple categories and strictly filter for dub
        const searches = await Promise.allSettled([
          api.getCategory("most-popular", 1),
          api.getCategory("top-airing", 1),
          api.getCategory("most-favorite", 1),
          api.search("dub", 1),
        ]);

        for (const s of searches) {
          if (s.status !== "fulfilled") continue;
          const items = s.value?.animes || [];
          items.forEach((a: AnimeItem) => {
            // Strict check: must have dub episodes property > 0
            if (!seenIds.current.has(a.id) && hasDub(a)) {
              seenIds.current.add(a.id);
              results.push(a);
            }
          });
        }
      } else {
        // Paginate through most-popular (reliable dub data)
        const [popData, favData] = await Promise.allSettled([
          api.getCategory("most-popular", pg),
          api.getCategory("most-favorite", pg),
        ]);

        for (const d of [popData, favData]) {
          if (d.status !== "fulfilled") continue;
          (d.value?.animes || []).forEach((a: AnimeItem) => {
            if (!seenIds.current.has(a.id) && hasDub(a)) {
              seenIds.current.add(a.id);
              results.push(a);
            }
          });
        }

        // If we got no dub anime from this page, we're likely at the end
        const rawCount = (popData.status === "fulfilled" ? popData.value?.animes?.length : 0) || 0;
        setHasMore(rawCount >= 20);
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

  const langConfig = LANGUAGES.find(l => l.key === activeLang) || LANGUAGES[0];

  return (
    <div className="container py-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-accent flex items-center justify-center">
            <Globe className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">Hindi & Regional Anime</h1>
            <p className="text-sm text-muted-foreground">Only anime with confirmed Hindi dub episodes</p>
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
          🎙️ Only showing anime with <span className="font-bold">confirmed DUB</span> episodes.
          Switch to <span className="font-bold">Hindi (Dub)</span> on the watch page for {langConfig.label} audio.
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
