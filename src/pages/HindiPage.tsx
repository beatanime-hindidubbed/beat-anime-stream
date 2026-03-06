import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, AnimeItem } from "@/lib/api";
import SkeletonCard from "@/components/SkeletonCard";
import { motion } from "framer-motion";
import { Globe, Play, Star, Clock } from "lucide-react";

const LANGUAGES = [
  { key: "hindi", label: "🇮🇳 Hindi", searchTerms: ["hindi dub", "hindi"] },
  { key: "tamil", label: "Tamil", searchTerms: ["tamil dub"] },
  { key: "telugu", label: "Telugu", searchTerms: ["telugu dub"] },
];

// Minimum dub episodes to be considered a "real" dub (not just 1-2 episodes)
const MIN_DUB_EPISODES = 3;

// AnimeCard clone that always links with ?lang=dub so WatchPage opens in Hindi mode
function DubAnimeCard({ anime, index }: { anime: AnimeItem; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.5) }}
      className="group relative"
    >
      <Link to={`/anime/${anime.id}?lang=dub`} className="block">
        <div className="relative aspect-[3/4] rounded-lg overflow-hidden shadow-card bg-secondary">
          <img
            src={anime.poster || "/placeholder.svg"}
            alt={anime.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* Play button on hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg backdrop-blur-sm">
              <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
            </div>
          </div>

          {/* DUB badge */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500 text-white">
              🇮🇳 DUB
            </span>
          </div>

          {/* Episode count */}
          {anime.episodes?.dub != null && (
            <div className="absolute bottom-2 right-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/70 text-white backdrop-blur-sm">
                {anime.episodes.dub} ep
              </span>
            </div>
          )}

          {/* Rating */}
          {anime.rating && (
            <div className="absolute top-2 right-2">
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/70 text-amber-400 backdrop-blur-sm">
                <Star className="w-2.5 h-2.5" /> {anime.rating}
              </span>
            </div>
          )}
        </div>

        <div className="mt-2 px-0.5">
          <h3 className="text-xs sm:text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {anime.name}
          </h3>
          {anime.type && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{anime.type}</p>
          )}
        </div>
      </Link>
    </motion.div>
  );
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
        // Fetch from multiple sources in parallel for best coverage
        const searches = await Promise.allSettled([
          api.getCategory("most-popular", 1),
          api.search("dub", 1),
          api.getCategory("top-airing", 1),
          api.getCategory("most-favorite", 1),
          api.search("dubbed", 1),
        ]);

        for (const s of searches) {
          if (s.status !== "fulfilled") continue;
          const items = s.value?.animes || [];
          items.forEach((a: AnimeItem) => {
            // STRICT filter: only show if episodes.dub exists AND meets minimum threshold
            // This prevents anime with 0 or 1-2 dub episodes from showing up
            if (
              !seenIds.current.has(a.id) &&
              typeof a.episodes?.dub === "number" &&
              a.episodes.dub >= MIN_DUB_EPISODES
            ) {
              seenIds.current.add(a.id);
              results.push(a);
            }
          });
        }

        // Sort by dub episode count descending — most complete dubs first
        results.sort((a, b) => (b.episodes?.dub || 0) - (a.episodes?.dub || 0));
      } else {
        // Subsequent pages: fetch from multiple categories
        const [catData, searchData] = await Promise.allSettled([
          api.getCategory("most-popular", pg),
          api.search("dub", pg),
        ]);

        const allItems: AnimeItem[] = [
          ...((catData.status === "fulfilled" ? catData.value?.animes : null) || []),
          ...((searchData.status === "fulfilled" ? searchData.value?.animes : null) || []),
        ];

        allItems.forEach((a: AnimeItem) => {
          if (
            !seenIds.current.has(a.id) &&
            typeof a.episodes?.dub === "number" &&
            a.episodes.dub >= MIN_DUB_EPISODES
          ) {
            seenIds.current.add(a.id);
            results.push(a);
          }
        });

        setHasMore(allItems.length >= 10);
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
            <p className="text-sm text-muted-foreground">Anime with dub episodes — watch in your language</p>
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
          🎙️ Showing anime with <span className="font-bold">significant DUB</span> episodes available (3+ episodes).
          Clicking any anime will automatically open in <span className="font-bold">{langConfig.label} dub</span> mode.
        </p>
      </div>

      {/* Grid — uses DubAnimeCard with ?lang=dub links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mb-8">
        {animes.map((a, i) => (
          <DubAnimeCard key={`${a.id}-${i}`} anime={a} index={i % 12} />
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
