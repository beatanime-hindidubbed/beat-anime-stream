import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import AnimeCard from "@/components/AnimeCard";
import SkeletonCard from "@/components/SkeletonCard";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";

export default function RecentPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["home"],
    queryFn: api.getHome,
    staleTime: 5 * 60 * 1000,
  });

  const latest = data?.latestEpisodeAnimes || [];
  const grid = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4";
  const skeletons = Array.from({ length: 18 }).map((_, i) => <SkeletonCard key={i} />);

  return (
    <div className="container py-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
            <Clock className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">Recently Updated</h1>
            <p className="text-sm text-muted-foreground">Latest episodes and new releases</p>
          </div>
        </div>
      </motion.div>

      <div className={grid}>
        {isLoading ? skeletons : latest.map((a, i) => <AnimeCard key={a.id} anime={a} index={i} />)}
      </div>
    </div>
  );
}
