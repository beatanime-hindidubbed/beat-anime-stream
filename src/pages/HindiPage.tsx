import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, AnimeItem } from "@/lib/api";
import { getApiPool } from "@/lib/streaming";
import SkeletonCard from "@/components/SkeletonCard";
import { motion } from "framer-motion";
import { Globe, Play, Star } from "lucide-react";

const MIN_DUB_EPISODES = 3;
const VERIFIED_KEY = "hindi_verified_ids";
const FAILED_KEY = "hindi_failed_ids";

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); } catch { return new Set(); }
}
function saveSet(key: string, set: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

/** Check if anime has Hindi dub via any API */
async function verifyHindiAvailable(animeId: string, anilistId?: string, malId?: string): Promise<boolean> {
  if (!anilistId && !malId) return false;
  const paramName = anilistId ? "anilistId" : "malId";
  const paramValue = anilistId || malId;
  const apis = getApiPool();
  const results = await Promise.allSettled(
    apis.map(async (base) => {
      const res = await fetch(`${base}/hindiapi/episode?${paramName}=${paramValue}&season=1&episode=1&type=series`);
      const data = await res.json();
      const sources = data.data?.streams || data.data?.sources || data.data?.servers || [];
      return sources.length > 0;
    })
  );
  return results.some(r => r.status === "fulfilled" && r.value === true);
}

function DubAnimeCard({ anime, index }: { anime: AnimeItem; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.05, 0.5) }} className="group relative">
      <Link to={`/hindi/anime/${anime.id}`} className="block">
        <div className="relative aspect-[3/4] rounded-lg overflow-hidden shadow-card bg-secondary">
          <img src={anime.poster || "/placeholder.svg"} alt={anime.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="w-12 h-12 rounded-full bg-orange-500/90 flex items-center justify-center shadow-lg backdrop-blur-sm">
              <Play className="w-5 h-5 text-white ml-0.5" />
            </div>
          </div>
          <div className="absolute top-2 left-2">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500 text-white">🇮🇳 DUB</span>
          </div>
          {anime.episodes?.dub != null && (
            <div className="absolute bottom-2 right-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/70 text-white backdrop-blur-sm">{anime.episodes.dub} ep</span>
            </div>
          )}
          {anime.rating && (
            <div className="absolute top-2 right-2">
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/70 text-amber-400 backdrop-blur-sm">
                <Star className="w-2.5 h-2.5" /> {anime.rating}
              </span>
            </div>
          )}
        </div>
        <div className="mt-2 px-0.5">
          <h3 className="text-xs sm:text-sm font-medium text-foreground line-clamp-2 group-hover:text-orange-400 transition-colors">{anime.name}</h3>
          {anime.type && <p className="text-[10px] text-muted-foreground mt-0.5">{anime.type}</p>}
        </div>
      </Link>
    </motion.div>
  );
}

export default function HindiPage() {
  const [animes, setAnimes] = useState<AnimeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set<string>());
  const verifiedIds = useRef(loadSet(VERIFIED_KEY));
  const failedIds = useRef(loadSet(FAILED_KEY));

  const fetchDubbedAnime = useCallback(async (pg: number, reset = false) => {
    setLoading(true);
    if (reset) seenIds.current.clear();

    try {
      const results: AnimeItem[] = [];

      if (pg === 1) {
        const searches = await Promise.allSettled([
          api.getCategory("most-popular", 1),
          api.search("dub", 1),
          api.getCategory("top-airing", 1),
          api.getCategory("most-favorite", 1),
          api.search("dubbed", 1),
          api.getCategory("recently-updated", 1),
        ]);

        for (const s of searches) {
          if (s.status !== "fulfilled") continue;
          const items = s.value?.animes || [];
          items.forEach((a: AnimeItem) => {
            if (
              !seenIds.current.has(a.id) &&
              !failedIds.current.has(a.id) &&
              typeof a.episodes?.dub === "number" &&
              a.episodes.dub >= MIN_DUB_EPISODES
            ) {
              seenIds.current.add(a.id);
              results.push(a);
            }
          });
        }
        results.sort((a, b) => (b.episodes?.dub || 0) - (a.episodes?.dub || 0));
      } else {
        const [catData, searchData] = await Promise.allSettled([
          api.getCategory("most-popular", pg),
          api.search("dub", pg),
        ]);
        const allItems: AnimeItem[] = [
          ...((catData.status === "fulfilled" ? catData.value?.animes : null) || []),
          ...((searchData.status === "fulfilled" ? searchData.value?.animes : null) || []),
        ];
        allItems.forEach((a: AnimeItem) => {
          if (!seenIds.current.has(a.id) && !failedIds.current.has(a.id) && typeof a.episodes?.dub === "number" && a.episodes.dub >= MIN_DUB_EPISODES) {
            seenIds.current.add(a.id);
            results.push(a);
          }
        });
        setHasMore(allItems.length >= 10);
      }

      setAnimes(prev => reset ? results : [...prev, ...results]);

      // Background verify Hindi availability for non-verified items
      const toVerify = results.filter(a => !verifiedIds.current.has(a.id) && !failedIds.current.has(a.id));
      if (toVerify.length > 0) {
        // Fire and forget - verify in batches
        Promise.allSettled(toVerify.map(async (a) => {
          try {
            const infoData = await api.getAnimeInfo(a.id);
            const mi = infoData?.anime?.moreInfo || {};
            const ii = infoData?.anime?.info as any;
            const aid = (mi as any).anilistid || (mi as any).anilist_id || ii?.anilistId;
            const mid = (mi as any).malid || (mi as any).mal_id || ii?.malId;
            const available = await verifyHindiAvailable(a.id, aid, mid);
            if (available) {
              verifiedIds.current.add(a.id);
              saveSet(VERIFIED_KEY, verifiedIds.current);
            } else {
              failedIds.current.add(a.id);
              saveSet(FAILED_KEY, failedIds.current);
              setAnimes(prev => prev.filter(x => x.id !== a.id));
            }
          } catch { /* skip */ }
        }));
      }
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
    fetchDubbedAnime(1, true);
  }, []);

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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-center">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">Hindi Dubbed Anime</h1>
            <p className="text-sm text-muted-foreground">Watch anime in Hindi — verified dubs only</p>
          </div>
        </div>
      </motion.div>

      <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 mb-6">
        <p className="text-sm text-orange-400">
          🎙️ Showing anime with <span className="font-bold">verified Hindi DUB</span> available. Click any anime to watch in Hindi.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mb-8">
        {animes.map((a, i) => (
          <DubAnimeCard key={a.id} anime={a} index={i % 12} />
        ))}
        {loading && Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>

      {animes.length === 0 && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <Globe className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p>No Hindi dubbed anime found.</p>
        </div>
      )}

      <div ref={loaderRef} className="flex justify-center py-4">
        {!hasMore && animes.length > 0 && (
          <p className="text-muted-foreground text-sm">All Hindi dubbed anime loaded 🎙️</p>
        )}
      </div>
    </div>
  );
}
