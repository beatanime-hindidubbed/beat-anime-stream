import { useSearchParams, useNavigate } from "react-router-dom";
import BackButton from "@/components/BackButton";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import AnimeCard from "@/components/AnimeCard";
import SkeletonCard from "@/components/SkeletonCard";
import { useState, useMemo } from "react";
import { Globe } from "lucide-react";

// ── Fuzzy / typo correction helpers ──────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

const COMMON_FRAGMENTS: Record<string, string> = {
  "naurto": "naruto", "narotu": "naruto", "narruto": "naruto",
  "dargon bal": "dragon ball", "dragan ball": "dragon ball",
  "bleech": "bleach", "blech": "bleach",
  "onepice": "one piece", "one pece": "one piece",
  "attack on tittan": "attack on titan", "attak on titan": "attack on titan",
  "demen slayer": "demon slayer",
  "fullmetal alchimist": "fullmetal alchemist", "fullmetal alchemest": "fullmetal alchemist",
  "jujutsu kaissen": "jujutsu kaisen", "jujitsu kaisen": "jujutsu kaisen",
  "my hero acadamia": "my hero academia", "my hero acadimia": "my hero academia",
  "boruto naruto": "boruto", "dragonball": "dragon ball",
  "dbz": "dragon ball z", "dbs": "dragon ball super",
  "aot": "attack on titan", "mha": "my hero academia",
  "bnha": "my hero academia", "hxh": "hunter x hunter",
  "fma": "fullmetal alchemist", "snk": "attack on titan",
  "kny": "demon slayer", "jjk": "jujutsu kaisen",
};

function suggestCorrection(query: string): string | null {
  const lower = query.toLowerCase().trim();
  if (COMMON_FRAGMENTS[lower]) return COMMON_FRAGMENTS[lower];
  let best: string | null = null;
  let bestDist = 3;
  for (const [wrong, correct] of Object.entries(COMMON_FRAGMENTS)) {
    const d = levenshtein(lower, wrong);
    if (d < bestDist) { bestDist = d; best = correct; }
  }
  return best;
}

export default function SearchPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get("q") || "";
  const page = parseInt(params.get("page") || "1");
  const [filterDub, setFilterDub] = useState(false);

  // Fuzzy suggestion
  const suggestion = useMemo(() => suggestCorrection(q), [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["search", q, page],
    queryFn: () => api.search(q, page),
    enabled: !!q,
  });

  // Filter for Hindi dub if active
  const filtered = useMemo(() => {
    if (!data?.animes) return [];
    if (!filterDub) return data.animes;
    return data.animes.filter(a =>
      typeof a.episodes?.dub === "number" && a.episodes.dub > 0
    );
  }, [data?.animes, filterDub]);

  return (
    <div className="container py-8">
      <BackButton />
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Results for "<span className="text-gradient">{q}</span>"
        </h1>
        {/* Hindi/Dub filter toggle */}
        <button
          onClick={() => setFilterDub(!filterDub)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
            filterDub
              ? "border-orange-500 text-orange-400 bg-orange-500/10"
              : "border-border text-muted-foreground hover:border-orange-500/50"
          }`}
        >
          <Globe className="w-4 h-4" />
          🇮🇳 Hindi DUB only
        </button>
      </div>

      {/* Fuzzy "Did you mean?" suggestion */}
      {suggestion && suggestion !== q.toLowerCase() && (
        <div className="mb-4 text-sm text-muted-foreground">
          Did you mean{" "}
          <button
            onClick={() => navigate(`/search?q=${encodeURIComponent(suggestion)}`)}
            className="text-primary font-medium hover:underline"
          >
            {suggestion}
          </button>
          ?
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length > 0 ? (
        <>
          {filterDub && (
            <p className="text-xs text-muted-foreground mb-4">
              Showing {filtered.length} anime with Hindi dub available
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
          </div>
        </>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p className="font-medium mb-2">No results found{filterDub ? " with Hindi dub" : ""}.</p>
          {filterDub && (
            <button onClick={() => setFilterDub(false)} className="text-primary text-sm hover:underline">
              Show all results instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}
