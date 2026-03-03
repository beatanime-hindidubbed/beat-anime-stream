import { store, WatchlistItem } from "@/lib/store";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Link, Navigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useState } from "react";

export default function WatchlistPage() {
  const { user } = useSupabaseAuth();
  const [list, setList] = useState<WatchlistItem[]>(store.getWatchlist());

  if (!user) return <Navigate to="/login" replace />;

  const remove = (id: string) => {
    store.removeFromWatchlist(id);
    setList(store.getWatchlist());
  };

  return (
    <div className="container py-8">
      <h1 className="font-display text-2xl font-bold text-foreground mb-6">My Watchlist</h1>
      {list.length === 0 ? (
        <p className="text-muted-foreground">Your watchlist is empty. Browse anime and add some!</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {list.map((item) => (
            <div key={item.id} className="group relative">
              <Link to={`/anime/${item.id}`}>
                <div className="aspect-[3/4] rounded-lg overflow-hidden shadow-card">
                  <img src={item.poster || "/placeholder.svg"} alt={item.name} className="w-full h-full object-cover" />
                </div>
                <p className="text-sm text-foreground mt-2 line-clamp-2">{item.name}</p>
              </Link>
              <button
                onClick={() => remove(item.id)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-destructive/80 flex items-center justify-center text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
