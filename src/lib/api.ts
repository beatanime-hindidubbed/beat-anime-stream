/**
 * api.ts
 * All API calls go through racePool (all admin-configured endpoints in parallel).
 * Every method has a fallback chain so explore/genre/category/schedule
 * pages never show empty on a single endpoint failure.
 */
import { racePool, getNextApi } from "./apiPool";
import {
  searchWithFallback,
  getHomeWithFallback,
  getScheduleWithFallback,
  getAnimeInfoWithFallback,
} from "./apiFallback";

// ─── Generic fetcher ──────────────────────────────────────────────────────────

async function fetchApi<T>(path: string): Promise<T> {
  const data = await racePool<any>((base) => `${base}${path}`);
  return (data?.data ?? data) as T;
}

// ─── Proxy helper ─────────────────────────────────────────────────────────────

function getProxyUrl(url: string, referer = "https://megacloud.blog/"): string {
  const base = getNextApi();
  return `${base}/hindiapi/proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface AnimeItem {
  id: string;
  name: string;
  jname?: string;
  poster?: string;
  type?: string;
  duration?: string;
  rating?: string;
  episodes?: { sub?: number; dub?: number };
  description?: string;
}

export interface HomeData {
  spotlightAnimes?: AnimeItem[];
  trendingAnimes?: AnimeItem[];
  latestEpisodeAnimes?: AnimeItem[];
  topAiringAnimes?: AnimeItem[];
  mostPopularAnimes?: AnimeItem[];
  mostFavoriteAnimes?: AnimeItem[];
  topUpcomingAnimes?: AnimeItem[];
}

export interface AnimeInfo {
  anime?: {
    info?: {
      id?: string;
      name?: string;
      poster?: string;
      description?: string;
      stats?: {
        rating?: string;
        quality?: string;
        episodes?: { sub?: number; dub?: number };
        type?: string;
        duration?: string;
      };
      promotionalVideos?: { title?: string; source?: string }[];
    };
    moreInfo?: Record<string, string>;
  };
  seasons?: { id?: string; name?: string; title?: string; poster?: string; isCurrent?: boolean }[];
  relatedAnimes?: AnimeItem[];
  recommendedAnimes?: AnimeItem[];
}

export interface Episode {
  title?: string;
  episodeId?: string;
  number?: number;
  isFiller?: boolean;
}

export interface EpisodeSource {
  sources?: { url: string; type?: string }[];
  tracks?: { file: string; label?: string; kind?: string; default?: boolean }[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}

export interface SearchResult {
  animes?: AnimeItem[];
  currentPage?: number;
  totalPages?: number;
  hasNextPage?: boolean;
}

export interface ScheduleItem {
  id?: string;
  name?: string;
  jname?: string;
  poster?: string;
  time?: string;
  episode?: number;
  airingTimestamp?: number;
}

export interface ScheduleData {
  scheduledAnimes?: ScheduleItem[];
}

// ─── Helper: check if result has meaningful data ──────────────────────────────

function hasItems(data: any, keys: string[]): boolean {
  return keys.some((k) => Array.isArray(data?.[k]) && data[k].length > 0);
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const api = {
  // ── Home ──────────────────────────────────────────────────────────────────
  getHome: async (): Promise<HomeData> => {
    try {
      const data = await fetchApi<HomeData>("/hianime/home");
      if (hasItems(data, ["trendingAnimes", "latestEpisodeAnimes", "spotlightAnimes"])) {
        return data;
      }
      throw new Error("empty");
    } catch {
      try {
        const fb = await getHomeWithFallback();
        return {
          trendingAnimes: fb.trending as AnimeItem[],
          latestEpisodeAnimes: fb.latest as AnimeItem[],
          topAiringAnimes: fb.popular as AnimeItem[],
          mostPopularAnimes: fb.popular as AnimeItem[],
          spotlightAnimes: fb.trending.slice(0, 5) as AnimeItem[],
        };
      } catch {
        return {};
      }
    }
  },

  // ── Anime Info ────────────────────────────────────────────────────────────
  getAnimeInfo: async (id: string): Promise<AnimeInfo> => {
    try {
      const data = await fetchApi<AnimeInfo>(`/hianime/anime/${id}`);
      if ((data as any)?.anime?.info?.name) return data;
      throw new Error("empty");
    } catch {
      try {
        const fb = await getAnimeInfoWithFallback(id);
        return {
          anime: {
            info: {
              id: fb.id,
              name: fb.name,
              poster: fb.poster,
              description: fb.description,
              stats: {
                rating: fb.rating,
                type: fb.type,
                episodes: fb.episodes,
              },
            },
            moreInfo: {
              ...(fb.status ? { status: fb.status } : {}),
              ...(fb.genres?.length ? { genres: fb.genres.join(", ") } : {}),
            },
          },
          seasons: [],
          relatedAnimes: [],
          recommendedAnimes: [],
        };
      } catch {
        return {};
      }
    }
  },

  // ── Episodes ──────────────────────────────────────────────────────────────
  getEpisodes: (id: string) =>
    fetchApi<{ episodes: Episode[]; totalEpisodes: number }>(
      `/hianime/anime/${id}/episodes`
    ),

  // ── Episode sources ───────────────────────────────────────────────────────
  getEpisodeSources: (episodeId: string, category = "sub") =>
    fetchApi<EpisodeSource>(
      `/hianime/episode/sources?animeEpisodeId=${episodeId}&category=${category}`
    ),

  // ── Proxy ──────────────────────────────────────────────────────────────────
  proxyUrl: (url: string, referer = "https://megacloud.blog/") =>
    getProxyUrl(url, referer),

  // ── Search ────────────────────────────────────────────────────────────────
  search: async (q: string, page = 1): Promise<SearchResult> => {
    try {
      const data = await fetchApi<SearchResult>(
        `/hianime/search?q=${encodeURIComponent(q)}&page=${page}`
      );
      if (hasItems(data, ["animes"])) return data;
      throw new Error("empty");
    } catch {
      try {
        const results = await searchWithFallback(q, page);
        return {
          animes: results as AnimeItem[],
          currentPage: page,
          totalPages: 1,
          hasNextPage: false,
        };
      } catch {
        return { animes: [], currentPage: page, totalPages: 1, hasNextPage: false };
      }
    }
  },

  // ── Search suggestions ────────────────────────────────────────────────────
  searchSuggestions: (q: string) =>
    fetchApi<{ suggestions: AnimeItem[] }>(
      `/hianime/search/suggestion?q=${encodeURIComponent(q)}`
    ),

  // ── Category (explore, manhwa, hindi, etc.) ───────────────────────────────
  getCategory: async (name: string, page = 1): Promise<SearchResult> => {
    try {
      const data = await fetchApi<SearchResult>(
        `/hianime/category/${name}?page=${page}`
      );
      if (hasItems(data, ["animes"])) return data;
      throw new Error("empty");
    } catch {
      // Try animelok category as fallback
      try {
        const data = await racePool<any>(
          (base) => `${base}/animelok/category/${encodeURIComponent(name)}?page=${page}`
        );
        const animes = data?.data?.animes || data?.data?.results || data?.data || [];
        if (animes.length > 0) {
          return {
            animes: animes.map((a: any) => ({
              id: a.id || a.slug,
              name: a.title || a.name,
              poster: a.image || a.poster,
              type: a.type,
              episodes: a.episodes,
            })) as AnimeItem[],
            currentPage: page,
            totalPages: data?.data?.totalPages ?? 1,
            hasNextPage: data?.data?.hasNextPage ?? false,
          };
        }
      } catch {}
      return { animes: [], currentPage: page, totalPages: 1, hasNextPage: false };
    }
  },

  // ── Genre ─────────────────────────────────────────────────────────────────
  getGenre: async (name: string, page = 1): Promise<SearchResult> => {
    try {
      const data = await fetchApi<SearchResult>(
        `/hianime/genre/${name}?page=${page}`
      );
      if (hasItems(data, ["animes"])) return data;
      throw new Error("empty");
    } catch {
      // Try animelok genre as fallback
      try {
        const data = await racePool<any>(
          (base) => `${base}/animelok/genre/${encodeURIComponent(name)}?page=${page}`
        );
        const animes = data?.data?.animes || data?.data?.results || data?.data || [];
        if (animes.length > 0) {
          return {
            animes: animes.map((a: any) => ({
              id: a.id || a.slug,
              name: a.title || a.name,
              poster: a.image || a.poster,
              type: a.type,
              episodes: a.episodes,
            })) as AnimeItem[],
            currentPage: page,
            totalPages: data?.data?.totalPages ?? 1,
            hasNextPage: data?.data?.hasNextPage ?? false,
          };
        }
      } catch {}
      return { animes: [], currentPage: page, totalPages: 1, hasNextPage: false };
    }
  },

  // ── Schedule ──────────────────────────────────────────────────────────────
  getSchedule: async (date: string): Promise<ScheduleData> => {
    try {
      const data = await fetchApi<ScheduleData>(`/hianime/schedule?date=${date}`);
      if (hasItems(data, ["scheduledAnimes"])) return data;
      throw new Error("empty");
    } catch {
      try {
        const items = await getScheduleWithFallback(date);
        return {
          scheduledAnimes: items.map((i) => ({
            id: i.id,
            name: i.name,
            poster: i.poster,
            time: i.time,
            episode: i.episode,
          })),
        };
      } catch {
        return { scheduledAnimes: [] };
      }
    }
  },
};
