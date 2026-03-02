// Simple localStorage-based store for auth, watchlist, continue watching

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
    const list = store.getContinueWatching().filter((i) => i.id !== item.id);
    list.unshift({ ...item, updatedAt: Date.now() });
    if (list.length > 20) list.pop();
    localStorage.setItem(KEYS.continueWatching, JSON.stringify(list));
  },
  removeContinueWatching: (id: string) => {
    const list = store.getContinueWatching().filter((i) => i.id !== id);
    localStorage.setItem(KEYS.continueWatching, JSON.stringify(list));
  },
  clearAllContinueWatching: () => {
    localStorage.setItem(KEYS.continueWatching, JSON.stringify([]));
  },
};
