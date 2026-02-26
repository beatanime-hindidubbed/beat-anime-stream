import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Play } from "lucide-react";

export default function SchedulePage() {
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  const { data, isLoading } = useQuery({
    queryKey: ["schedule", date],
    queryFn: () => api.getSchedule(date),
  });

  const items = data?.scheduledAnimes || [];

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Schedule</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 px-3 rounded-lg bg-secondary text-sm text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-secondary animate-pulse" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/anime/${item.id}`}
              className="flex items-center gap-4 p-3 rounded-lg bg-card border border-border hover:border-primary/40 transition-colors"
            >
              {item.poster && (
                <img src={item.poster} alt={item.name} className="w-14 h-20 object-cover rounded" />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground line-clamp-1">{item.name}</h3>
                {item.jname && <p className="text-xs text-muted-foreground line-clamp-1">{item.jname}</p>}
                {item.episode && <p className="text-xs text-primary mt-1">Episode {item.episode}</p>}
              </div>
              {item.time && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                  <Clock className="w-4 h-4" /> {item.time}
                </div>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">No anime scheduled for this date.</p>
      )}
    </div>
  );
}
