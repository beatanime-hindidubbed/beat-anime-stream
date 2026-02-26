import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import AnimeCard from "@/components/AnimeCard";
import SkeletonCard from "@/components/SkeletonCard";

export default function GenrePage() {
  const { name } = useParams<{ name: string }>();
  const [params] = useSearchParams();
  const page = parseInt(params.get("page") || "1");

  const { data, isLoading } = useQuery({
    queryKey: ["genre", name, page],
    queryFn: () => api.getGenre(name!, page),
    enabled: !!name,
  });

  return (
    <div className="container py-8">
      <h1 className="font-display text-2xl font-bold text-foreground mb-6 capitalize">{name} Anime</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)
          : data?.animes?.map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)
        }
      </div>
    </div>
  );
}
