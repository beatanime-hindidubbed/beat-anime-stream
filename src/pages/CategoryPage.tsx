import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import AnimeCard from "@/components/AnimeCard";
import SkeletonCard from "@/components/SkeletonCard";

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
  const [params] = useSearchParams();
  const page = parseInt(params.get("page") || "1");

  const { data, isLoading } = useQuery({
    queryKey: ["category", name, page],
    queryFn: () => api.getCategory(name!, page),
    enabled: !!name,
  });

  return (
    <div className="container py-8">
      <h1 className="font-display text-2xl font-bold text-foreground mb-6">
        {CATEGORY_TITLES[name || ""] || name}
      </h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)
          : data?.animes?.map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)
        }
      </div>
      {!isLoading && (!data?.animes || data.animes.length === 0) && (
        <p className="text-muted-foreground">No anime found.</p>
      )}
    </div>
  );
}
