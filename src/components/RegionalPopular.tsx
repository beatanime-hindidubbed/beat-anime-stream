import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useRegion, getRegionalPopular } from "@/hooks/useRegion";
import { MapPin, TrendingUp, Loader2 } from "lucide-react";

interface PopularAnime {
  id: string;
  name: string;
  poster: string | null;
  count: number;
}

// Homepage section - horizontal scrollable list
export function RegionalPopularSection() {
  const { region, loading: regionLoading } = useRegion();
  const [popular, setPopular] = useState<PopularAnime[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!region) return;
    setLoading(true);
    getRegionalPopular(region.countryCode, 12).then((data) => {
      setPopular(data);
      setLoading(false);
    });
  }, [region]);

  if (regionLoading || loading) return null;
  if (popular.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">
          Popular in {region?.countryName || "Your Region"}
        </h2>
        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
          Based on user activity
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-3 px-3 snap-x">
        {popular.map((anime) => (
          <Link
            key={anime.id}
            to={`/anime/${anime.id}`}
            className="flex-shrink-0 w-32 sm:w-40 snap-start group"
          >
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-secondary mb-2">
              {anime.poster ? (
                <img
                  src={anime.poster}
                  alt={anime.name}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  No Image
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <div className="flex items-center gap-1 text-xs text-primary">
                  <TrendingUp className="w-3 h-3" />
                  <span>{anime.count} views</span>
                </div>
              </div>
            </div>
            <p className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
              {anime.name}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

// Sidebar widget - vertical compact list
export function RegionalPopularWidget({ className = "" }: { className?: string }) {
  const { region, loading: regionLoading } = useRegion();
  const [popular, setPopular] = useState<PopularAnime[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!region) return;
    setLoading(true);
    getRegionalPopular(region.countryCode, 5).then((data) => {
      setPopular(data);
      setLoading(false);
    });
  }, [region]);

  if (regionLoading || loading) {
    return (
      <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (popular.length === 0) return null;

  return (
    <div className={`rounded-xl border border-border bg-card overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary/30">
        <MapPin className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">
          Popular in {region?.countryName}
        </h3>
      </div>

      <div className="p-2 space-y-1">
        {popular.map((anime, idx) => (
          <Link
            key={anime.id}
            to={`/anime/${anime.id}`}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors group"
          >
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
              {idx + 1}
            </span>
            <div className="w-10 h-14 rounded overflow-hidden bg-secondary flex-shrink-0">
              {anime.poster ? (
                <img src={anime.poster} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full bg-muted" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                {anime.name}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> {anime.count} views
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
