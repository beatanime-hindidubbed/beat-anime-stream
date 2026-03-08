import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import BackButton from "@/components/BackButton";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import AnimeCard from "@/components/AnimeCard";
import SkeletonCard from "@/components/SkeletonCard";
import { Loader2 } from "lucide-react";
import { AnimeItem } from "@/lib/api";

const CATEGORY_TITLES: Record<string, string> = {
  "most-popular": "Most Popular",
  "most-favorite": "Most Favorite",
  "top-airing": "Top Airing",
  "top-upcoming": "Top Upcoming",
  "recently-updated": "Recently Updated",
  "recently-added": "Recently Added",
  trending: "Trending",
};

export default function CategoryPage() {
  const { name } = useParams<{ name: string }>();
  const [page, setPage] = useState(1);
  const [allAnimes, setAllAnimes] = useState<AnimeItem[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const { isLoading } = useQuery({
    queryKey: ["category", name, page],
    queryFn: async () => {
      const data = await api.getCategory(name!, page);
      const items = data?.animes || [];
      setAllAnimes(prev => page === 1 ? items : [...prev, ...items]);
      setHasMore(items.length >= 20);
      return data;
    },
    enabled: !!name,
  });

  const loadMore = () => setPage(p => p + 1);

  return (
    <div className="container py-8">
      <BackButton />
      <h1 className="font-display text-2xl font-bold text-foreground mb-6">
        {CATEGORY_TITLES[name || ""] || name}
      </h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {allAnimes.map((a, i) => <AnimeCard key={`${a.id}-${i}`} anime={a} index={i} />)}
        {isLoading && Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      {!isLoading && allAnimes.length === 0 && (
        <p className="text-muted-foreground">No anime found.</p>
      )}
      {hasMore && !isLoading && allAnimes.length > 0 && (
        <div className="flex justify-center py-8">
          <button
            onClick={loadMore}
            className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
