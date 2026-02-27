import { useSearchParams } from "react-router-dom";
import BackButton from "@/components/BackButton";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import AnimeCard from "@/components/AnimeCard";
import SkeletonCard from "@/components/SkeletonCard";

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const page = parseInt(params.get("page") || "1");

  const { data, isLoading } = useQuery({
    queryKey: ["search", q, page],
    queryFn: () => api.search(q, page),
    enabled: !!q,
  });

  return (
    <div className="container py-8">
      <BackButton />
      <h1 className="font-display text-2xl font-bold text-foreground mb-6">
        Results for "<span className="text-gradient">{q}</span>"
      </h1>
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : data?.animes && data.animes.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {data.animes.map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
        </div>
      ) : (
        <p className="text-muted-foreground">No results found.</p>
      )}
    </div>
  );
}
