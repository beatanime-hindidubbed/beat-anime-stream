import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseAuth } from "./useSupabaseAuth";

interface RegionInfo {
  countryCode: string;
  countryName: string;
}

const CACHE_KEY = "beat_user_region";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function useRegion() {
  const { user } = useSupabaseAuth();
  const [region, setRegion] = useState<RegionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const detectRegion = async () => {
      // Check cache first
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setRegion(data);
            setLoading(false);
            return;
          }
        }
      } catch {}

      // Detect via IP geolocation API
      try {
        const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          const regionInfo: RegionInfo = {
            countryCode: data.country_code || "US",
            countryName: data.country_name || "United States",
          };
          setRegion(regionInfo);
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: regionInfo, timestamp: Date.now() }));

          // Update user profile if logged in
          if (user) {
            await supabase
              .from("profiles")
              .update({ country_code: regionInfo.countryCode, country_name: regionInfo.countryName })
              .eq("user_id", user.id);
          }
        }
      } catch {
        // Fallback to US
        setRegion({ countryCode: "US", countryName: "United States" });
      } finally {
        setLoading(false);
      }
    };

    detectRegion();
  }, [user]);

  const trackView = useCallback(
    async (anime: { id: string; name: string; poster?: string }) => {
      if (!user || !region) return;

      try {
        await supabase.from("regional_views").upsert(
          {
            user_id: user.id,
            anime_id: anime.id,
            anime_name: anime.name,
            anime_poster: anime.poster || null,
            country_code: region.countryCode,
            country_name: region.countryName,
            view_date: new Date().toISOString().split("T")[0],
          },
          { onConflict: "user_id,anime_id,view_date" }
        );
      } catch (e) {
        console.error("Failed to track regional view:", e);
      }
    },
    [user, region]
  );

  return { region, loading, trackView };
}

// Get popular anime by region
export async function getRegionalPopular(countryCode: string, limit = 10) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data, error } = await supabase
    .from("regional_views")
    .select("anime_id, anime_name, anime_poster")
    .eq("country_code", countryCode)
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  // Aggregate by anime_id and count views
  const counts: Record<string, { id: string; name: string; poster: string | null; count: number }> = {};
  for (const row of data) {
    if (!counts[row.anime_id]) {
      counts[row.anime_id] = { id: row.anime_id, name: row.anime_name, poster: row.anime_poster, count: 0 };
    }
    counts[row.anime_id].count++;
  }

  // Sort by count and return top N
  return Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
