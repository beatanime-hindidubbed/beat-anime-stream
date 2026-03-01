import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, AnimeItem } from "@/lib/api";
import AnimeCard from "@/components/AnimeCard";
import AnimeSection from "@/components/AnimeSection";
import SkeletonCard from "@/components/SkeletonCard";
import { motion } from "framer-motion";
import { Globe, Film } from "lucide-react";

const HINDI_CATEGORIES = [
  { key: "hindi-dub", label: "Hindi Dubbed", icon: "🇮🇳" },
  { key: "tamil-dub", label: "Tamil Dubbed", icon: "🎬" },
  { key: "telugu-dub", label: "Telugu Dubbed", icon: "🎭" },
] as const;

// These are popular anime known to have Hindi dubs - we search for them
const HINDI_SEARCH_TERMS = [
  "hindi", "dubbed hindi", "dragon ball hindi", "naruto hindi",
  "one piece hindi", "attack on titan hindi", "death note hindi",
  "demon slayer hindi", "jujutsu kaisen hindi", "my hero academia hindi",
];

async function fetchHindiContent(): Promise<AnimeItem[]> {
  // Search for Hindi dubbed content using the API
  const results: AnimeItem[] = [];
  const seen = new Set<string>();

  // Try fetching from category endpoints for dubbed content
  try {
    const dubRes = await api.getCategory("dubbed", 1);
    if (dubRes?.animes) {
      dubRes.animes.forEach((a) => {
        if (!seen.has(a.id)) { seen.add(a.id); results.push(a); }
      });
    }
  } catch {}

  // Also search specifically for "hindi"
  try {
    const searchRes = await api.search("hindi dub", 1);
    if (searchRes?.animes) {
      searchRes.animes.forEach((a) => {
        if (!seen.has(a.id)) { seen.add(a.id); results.push(a); }
      });
    }
  } catch {}

  return results;
}

export default function HindiPage() {
  const [activeTab, setActiveTab] = useState<string>("hindi-dub");
  const grid = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4";
  const skeletons = Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />);

  const { data: hindiAnimes, isLoading } = useQuery({
    queryKey: ["hindi-content"],
    queryFn: fetchHindiContent,
    staleTime: 10 * 60 * 1000,
  });

  const { data: trendingDub } = useQuery({
    queryKey: ["trending-dub"],
    queryFn: () => api.getCategory("most-popular", 1),
    staleTime: 10 * 60 * 1000,
  });

  // Filter results that likely have dubs
  const dubbedAnimes = (hindiAnimes || []).filter(
    (a) => a.episodes?.dub && a.episodes.dub > 0
  );

  const popularDubbed = (trendingDub?.animes || []).filter(
    (a) => a.episodes?.dub && a.episodes.dub > 0
  );

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
              Hindi & Regional
            </h1>
            <p className="text-sm text-muted-foreground">
              Watch anime in Hindi, Tamil, Telugu and more
            </p>
          </div>
        </div>
      </motion.div>

      {/* Language Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-2">
        {HINDI_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveTab(cat.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === cat.key
                ? "bg-gradient-accent text-accent-foreground shadow-glow"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <span>{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Hindi Dubbed Section */}
      {activeTab === "hindi-dub" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <AnimeSection title="🇮🇳 Hindi Dubbed Anime">
            <div className={grid}>
              {isLoading
                ? skeletons
                : dubbedAnimes.length > 0
                ? dubbedAnimes.map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)
                : popularDubbed.slice(0, 12).map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
            </div>
          </AnimeSection>

          {popularDubbed.length > 0 && dubbedAnimes.length > 0 && (
            <AnimeSection title="🔥 Popular with Dubs">
              <div className={grid}>
                {popularDubbed.slice(0, 12).map((a, i) => (
                  <AnimeCard key={a.id} anime={a} index={i} />
                ))}
              </div>
            </AnimeSection>
          )}
        </motion.div>
      )}

      {/* Tamil/Telugu - show dubbed content */}
      {(activeTab === "tamil-dub" || activeTab === "telugu-dub") && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="text-center py-16">
            <Film className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-display text-xl font-bold text-foreground mb-2">
              {activeTab === "tamil-dub" ? "Tamil" : "Telugu"} Dubbed Content
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              Browse dubbed anime below. More {activeTab === "tamil-dub" ? "Tamil" : "Telugu"} content coming soon!
            </p>
            <div className={grid}>
              {isLoading
                ? skeletons
                : popularDubbed.slice(0, 18).map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
