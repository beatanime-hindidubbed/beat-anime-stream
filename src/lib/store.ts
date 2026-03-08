// Simple localStorage-based store for auth, watchlist, continue watching
// With optional cloud sync for continue watching

import { supabase } from "@/integrations/supabase/client";

export interface User {
  username: string;
  email: string;
}

export interface WatchlistItem {
  id: string;
  name: string;
  poster?: string;
  addedAt: number;
}

export interface ContinueWatchingItem {
  id: string;
  name: string;
  poster?: string;
  episodeId: string;
  episodeNumber: number;
  progress: number; // seconds
  duration: number;
  updatedAt: number;
}

const KEYS = {
  user: "beat_user",
  watchlist: "beat_watchlist",
  continueWatching: "beat_continue",
};

function getCloudSyncEnabled(): boolean {
  try {
    const d = localStorage.getItem("beat_user_prefs");
    if (!d) return true;
    const prefs = JSON.parse(d);
    return prefs.cloudSync !== false;
  } catch { return true; }
}

// Debounce cloud sync to avoid spamming
let syncTimeout: ReturnType<typeof setTimeout> | null = null;

async function syncToCloud(item: ContinueWatchingItem) {
  if (!getCloudSyncEnabled()) return;
  
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      await supabase.from("continue_watching").upsert({
        user_id: session.user.id,
        anime_id: item.id,
        anime_name: item.name,
        poster: item.poster || null,
        episode_id: item.episodeId,
        episode_number: item.episodeNumber,
        progress: item.progress,
        duration: item.duration,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,anime_id" });
    } catch {}
  }, 5000); // 5s debounce
}

export async function loadCloudContinueWatching(): Promise<ContinueWatchingItem[]> {
  if (!getCloudSyncEnabled()) return [];
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return [];

    const { data } = await supabase
      .from("continue_watching")
      .select("*")
      .eq("user_id", session.user.id)
      .order("updated_at", { ascending: false })
      .limit(20);

    if (!data) return [];

    return data.map((row: any) => ({
      id: row.anime_id,
      name: row.anime_name,
      poster: row.poster,
      episodeId: row.episode_id,
      episodeNumber: row.episode_number,
      progress: row.progress,
      duration: row.duration,
      updatedAt: new Date(row.updated_at).getTime(),
    }));
  } catch { return []; }
}

export async function mergeCloudWatchHistory() {
  if (!getCloudSyncEnabled()) return;
  try {
    const cloudItems = await loadCloudContinueWatching();
    const localItems = store.getContinueWatching();

    // Merge: cloud wins for same anime if newer
    const merged = new Map<string, ContinueWatchingItem>();
    localItems.forEach(item => merged.set(item.id, item));
    cloudItems.forEach(item => {
      const existing = merged.get(item.id);
      if (!existing || item.updatedAt > existing.updatedAt) {
        merged.set(item.id, item);
      }
    });

    const sorted = Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);
    localStorage.setItem(KEYS.continueWatching, JSON.stringify(sorted));
  } catch {}
}

export const store = {
  // Auth
  getUser: (): User | null => {
    const d = localStorage.getItem(KEYS.user);
    return d ? JSON.parse(d) : null;
  },
  login: (user: User) => localStorage.setItem(KEYS.user, JSON.stringify(user)),
  logout: () => {
    localStorage.removeItem(KEYS.user);
  },
  register: (user: User) => {
    localStorage.setItem(KEYS.user, JSON.stringify(user));
  },

  // Watchlist
  getWatchlist: (): WatchlistItem[] => {
    const d = localStorage.getItem(KEYS.watchlist);
    return d ? JSON.parse(d) : [];
  },
  addToWatchlist: (item: Omit<WatchlistItem, "addedAt">) => {
    const list = store.getWatchlist().filter((i) => i.id !== item.id);
    list.unshift({ ...item, addedAt: Date.now() });
    localStorage.setItem(KEYS.watchlist, JSON.stringify(list));
  },
  removeFromWatchlist: (id: string) => {
    const list = store.getWatchlist().filter((i) => i.id !== id);
    localStorage.setItem(KEYS.watchlist, JSON.stringify(list));
  },
  isInWatchlist: (id: string) => store.getWatchlist().some((i) => i.id === id),

  // Continue Watching
  getContinueWatching: (): ContinueWatchingItem[] => {
    const d = localStorage.getItem(KEYS.continueWatching);
    return d ? JSON.parse(d) : [];
  },
  updateContinueWatching: (item: Omit<ContinueWatchingItem, "updatedAt">) => {
    const full = { ...item, updatedAt: Date.now() };
    const list = store.getContinueWatching().filter((i) => i.id !== item.id);
    list.unshift(full);
    if (list.length > 20) list.pop();
    localStorage.setItem(KEYS.continueWatching, JSON.stringify(list));
    // Sync to cloud in background
    syncToCloud(full);
  },
  removeContinueWatching: (id: string) => {
    const list = store.getContinueWatching().filter((i) => i.id !== id);
    localStorage.setItem(KEYS.continueWatching, JSON.stringify(list));
    // Also remove from cloud
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await supabase.from("continue_watching").delete().eq("user_id", session.user.id).eq("anime_id", id);
        }
      } catch {}
    })();
  },
  clearAllContinueWatching: () => {
    localStorage.setItem(KEYS.continueWatching, JSON.stringify([]));
    // Also clear from cloud
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await supabase.from("continue_watching").delete().eq("user_id", session.user.id);
        }
      } catch {}
    })();
  },
};
