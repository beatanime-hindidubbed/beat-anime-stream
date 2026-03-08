import { Link } from "react-router-dom";
import { AnimeItem } from "@/lib/api";
import { motion } from "framer-motion";
import { Play } from "lucide-react";

interface Props {
  anime: AnimeItem;
  index?: number;
}

export default function AnimeCard({ anime, index = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Link to={`/anime/${anime.id}`} className="group block">
        <div className="relative aspect-[3/4] rounded-lg overflow-hidden shadow-card">
          <img
            src={anime.poster || "/placeholder.svg"}
            alt={anime.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/90 flex items-center justify-center">
              <Play className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground ml-0.5" />
            </div>
          </div>
          {anime.episodes && (
            <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 flex gap-1">
              {anime.episodes.sub != null && (
                <span className="px-1 sm:px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-medium bg-primary text-primary-foreground">
                  SUB {anime.episodes.sub}
                </span>
              )}
              {anime.episodes.dub != null && (
                <span className="px-1 sm:px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-medium bg-accent text-accent-foreground">
                  DUB {anime.episodes.dub}
                </span>
              )}
            </div>
          )}
          {anime.rating && (
            <span className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 px-1 sm:px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-medium bg-secondary text-secondary-foreground">
              {anime.rating}
            </span>
          )}
        </div>
        <div className="mt-1.5 sm:mt-2">
          <h3 className="text-xs sm:text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors leading-tight">
            {anime.name}
          </h3>
          {anime.type && (
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{anime.type}{anime.duration ? ` · ${anime.duration}` : ""}</p>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
