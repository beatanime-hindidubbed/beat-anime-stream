import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, AnimeItem } from "@/lib/api";
import SkeletonCard from "@/components/SkeletonCard";
import { motion } from "framer-motion";
import { Globe, Play, Star, Loader2, CheckCircle2, XCircle } from "lucide-react";

// ── All Hindi API base URLs — we race them for fastest response ──────────────
const HINDI_API_BASES = [
  "https://beat-anime-api.onrender.com/api/v1",
  "https://beat-anime-api-2.onrender.com/api/v1",
  "https://beat-anime-api-3.onrender.com/api/v1",
  "https://beat-anime-api-4.onrender.com/api/v1",
];

const LANGUAGES = [
  { key: "hindi", label: "🇮🇳 Hindi" },
  { key: "tamil", label: "🎬 Tamil" },
  { key: "telugu", label: "🎬 Telugu" },
];

// Minimum dub episodes to even bother checking
const MIN_DUB_EPISODES = 3;

// ── Check if anime actually has Hindi stream in ANY of our APIs ──────────────
// Races all API bases — resolves true as soon as any one succeeds
async function checkHindiInApi(
  anilistId: string | number | null,
  malId: string | number | null
): Promise<boolean> {
  if (!anilistId && !malId) return false;

  const paramName  = anilistId ? "anilistId" : "malId";
  const paramValue = anilistId ?? malId;

  const checks = HINDI_API_BASES.map(async (base) => {
    try {
      const res = await fetch(
        `${base}/hindiapi/episode?${paramName}=${paramValue}&season=1&episode=1&type=series`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) return false;
      const data = await res.json();
      if (data.status !== 200) return false;
      const sources =
        data.data?.streams || data.data?.sources || data.data?.servers || [];
      return sources.length > 0;
    } catch {
      return false;
    }
  });

  // Wait for all — if any is true, anime is available
  const results = await Promise.allSettled(checks);
  return results.some(
    (r) => r.status === "fulfilled" && r.value === true
  );
}

// ── Fetch moreInfo (anilistId/malId) for a given anime ──────────────────────
// Uses whichever API responds first
async function fetchAnimeIds(
  animeId: string
): Promise<{ anilistId: string | null; malId: string | null }> {
  const tries = HINDI_API_BASES.map(async (base) => {
    const res = await fetch(`${base}/hianime/anime/${encodeURIComponent(animeId)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("bad");
    const data = await res.json();
    const moreInfo = data?.data?.anime?.moreInfo || {};
    const info     = data?.data?.anime?.info || {};
    const anilistId =
      moreInfo.anilistid || moreInfo.anilist_id || info.anilistId || null;
    const malId =
      moreInfo.malid || moreInfo.mal_id || info.malId || null;
    if (!anilistId && !malId) throw new Error("no ids");
    return { anilistId: String(anilistId || ""), malId: String(malId || "") };
  });

  try {
    return await Promise.any(tries);
  } catch {
    return { anilistId: null, malId: null };
  }
}

// ── Card component — clicking sets sessionStorage so WatchPage opens dub ────
function DubAnimeCard({
  anime,
  status,
  index,
}: {
  anime: AnimeItem;
  status: "pending" | "verified" | "failed";
  index: number;
}) {
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Store dub preference — AnimeDetail and WatchPage read this
    sessionStorage.setItem("preferDub", "true");
    navigate(`/anime/${anime.id}`);
  };

  if (status === "failed") return null; // Remove unavailable anime silently

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
      className="group relative"
    >
      <a href={`/anime/${anime.id}`} onClick={handleClick} className="block">
        <div className="relative aspect-[3/4] rounded-lg overflow-hidden shadow-card bg-secondary">
          <img
            src={anime.poster || "/placeholder.svg"}
            alt={anime.name}
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
              status === "pending" ? "opacity-70" : ""
            }`}
            loading="lazy"
          />

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

          {/* Play */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg backdrop-blur-sm">
              <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
            </div>
          </div>

          {/* DUB badge */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500 text-white shadow">
              🇮🇳 DUB
            </span>
          </div>

          {/* Verification status */}
          <div className="absolute top-2 right-2">
            {status === "pending" ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-black/60 text-white/70 backdrop-blur-sm flex items-center gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
              </span>
            ) : status === "verified" ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/80 text-white backdrop-blur-sm flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> Live
              </span>
            ) : null}
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
            <div className="absolute bottom-2 left-2">
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-black/70 text-amber-400 backdrop-blur-sm">
                <Star className="w-2.5 h-2.5" />
                {anime.rating}
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
      </a>
    </motion.div>
  );
}

// ── Verification status map ──────────────────────────────────────────────────
type VerifyStatus = "pending" | "verified" | "failed";

export default function HindiPage() {
  const [activeLang, setActiveLang] = useState("hindi");
  const [animes, setAnimes]         = useState<AnimeItem[]>([]);
  const [statuses, setStatuses]     = useState<Record<string, VerifyStatus>>({});
  const [loading, setLoading]       = useState(false);
  const [page, setPage]             = useState(1);
  const [hasMore, setHasMore]       = useState(true);
  const [verifyingCount, setVerifyingCount] = useState(0);

  const loaderRef     = useRef<HTMLDivElement>(null);
  const seenIds       = useRef(new Set<string>());
  const verifyQueue   = useRef<AnimeItem[]>([]);
  const verifyActive  = useRef(false);

  // ── Background verifier — processes queue in batches of 3 ───────────────
  const processQueue = useCallback(async () => {
    if (verifyActive.current) return;
    verifyActive.current = true;

    while (verifyQueue.current.length > 0) {
      // Take 3 at a time — one per API in parallel
      const batch = verifyQueue.current.splice(0, 3);
      setVerifyingCount(verifyQueue.current.length + batch.length);

      await Promise.all(
        batch.map(async (anime) => {
          try {
            // First get the anilistId/malId for this anime
            const { anilistId, malId } = await fetchAnimeIds(anime.id);
            // Then check if Hindi API has it
            const available = await checkHindiInApi(anilistId, malId);

            setStatuses((prev) => ({
              ...prev,
              [anime.id]: available ? "verified" : "failed",
            }));
          } catch {
            setStatuses((prev) => ({ ...prev, [anime.id]: "failed" }));
          }
        })
      );
    }

    verifyActive.current = false;
    setVerifyingCount(0);
  }, []);

  // ── Fetch dubbed anime from hianime (multiple sources in parallel) ───────
  const fetchAnimes = useCallback(
    async (pg: number, reset = false) => {
      setLoading(true);
      if (reset) {
        seenIds.current.clear();
        verifyQueue.current = [];
        verifyActive.current = false;
      }

      try {
        let newItems: AnimeItem[] = [];

        if (pg === 1) {
          // Parallel fetch from 5 different sources on first page
          const [popular, search1, topAiring, fav, search2] =
            await Promise.allSettled([
              api.getCategory("most-popular", 1),
              api.search("dub", 1),
              api.getCategory("top-airing", 1),
              api.getCategory("most-favorite", 1),
              api.search("dubbed", 1),
            ]);

          const allItems: AnimeItem[] = [
            ...((popular.status === "fulfilled"
              ? popular.value?.animes
              : null) || []),
            ...((search1.status === "fulfilled"
              ? search1.value?.animes
              : null) || []),
            ...((topAiring.status === "fulfilled"
              ? topAiring.value?.animes
              : null) || []),
            ...((fav.status === "fulfilled" ? fav.value?.animes : null) ||
              []),
            ...((search2.status === "fulfilled"
              ? search2.value?.animes
              : null) || []),
          ];

          allItems.forEach((a) => {
            if (
              !seenIds.current.has(a.id) &&
              typeof a.episodes?.dub === "number" &&
              a.episodes.dub >= MIN_DUB_EPISODES
            ) {
              seenIds.current.add(a.id);
              newItems.push(a);
            }
          });

          // Sort by most dub episodes first
          newItems.sort(
            (a, b) => (b.episodes?.dub ?? 0) - (a.episodes?.dub ?? 0)
          );
        } else {
          const [r1, r2] = await Promise.allSettled([
            api.getCategory("most-popular", pg),
            api.search("dub", pg),
          ]);
          const allItems: AnimeItem[] = [
            ...((r1.status === "fulfilled" ? r1.value?.animes : null) || []),
            ...((r2.status === "fulfilled" ? r2.value?.animes : null) || []),
          ];
          allItems.forEach((a) => {
            if (
              !seenIds.current.has(a.id) &&
              typeof a.episodes?.dub === "number" &&
              a.episodes.dub >= MIN_DUB_EPISODES
            ) {
              seenIds.current.add(a.id);
              newItems.push(a);
            }
          });
          if (newItems.length < 4) setHasMore(false);
        }

        // Set all new items as "pending" verification
        const pendingMap: Record<string, VerifyStatus> = {};
        newItems.forEach((a) => {
          pendingMap[a.id] = "pending";
        });

        setStatuses((prev) => (reset ? pendingMap : { ...prev, ...pendingMap }));
        setAnimes((prev) => (reset ? newItems : [...prev, ...newItems]));

        // Queue for Hindi API verification
        verifyQueue.current.push(...newItems);
        processQueue();
      } catch {
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [processQueue]
  );

  // Reset on language change
  useEffect(() => {
    setPage(1);
    setAnimes([]);
    setHasMore(true);
    setStatuses({});
    fetchAnimes(1, true);
  }, [activeLang]);

  // Infinite scroll
  useEffect(() => {
    if (!loaderRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loading && hasMore) {
          const next = page + 1;
          setPage(next);
          fetchAnimes(next);
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [loading, hasMore, page, fetchAnimes]);

  // Only show non-failed items
  const visibleAnimes = animes.filter((a) => statuses[a.id] !== "failed");

  return (
    <div className="container py-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-accent flex items-center justify-center">
            <Globe className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">
              Hindi &amp; Regional Anime
            </h1>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              Only anime confirmed available in your API
              {verifyingCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-primary">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Verifying {verifyingCount} remaining…
                </span>
              )}
            </p>
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
      <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 mb-6 text-sm text-orange-400">
        🎙️ Showing anime with <strong>3+ dub episodes</strong>. Each is checked live
        against your API — anime not available are automatically hidden.
        Clicking any card opens it in <strong>Hindi dub</strong> by default.
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mb-8">
        {visibleAnimes.map((a, i) => (
          <DubAnimeCard
            key={a.id}
            anime={a}
            status={statuses[a.id] ?? "pending"}
            index={i % 12}
          />
        ))}
        {loading &&
          Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>

      {visibleAnimes.length === 0 && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <Globe className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p>No dubbed anime found for this language.</p>
        </div>
      )}

      <div ref={loaderRef} className="flex justify-center py-4">
        {!hasMore && visibleAnimes.length > 0 && (
          <p className="text-muted-foreground text-sm">All dubbed anime loaded 🎙️</p>
        )}
      </div>
    </div>
  );
}
