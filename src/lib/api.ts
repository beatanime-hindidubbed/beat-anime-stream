const BASE_URL = "https://beat-anime-api.onrender.com/api/v1";

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

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

export const api = {
  getHome: () => fetchApi<HomeData>("/hianime/home"),
  getAnimeInfo: (id: string) => fetchApi<AnimeInfo>(`/hianime/anime/${id}`),
  getEpisodes: (id: string) => fetchApi<{ episodes: Episode[]; totalEpisodes: number }>(`/hianime/anime/${id}/episodes`),
  getEpisodeSources: (episodeId: string, category = "sub") =>
    fetchApi<EpisodeSource>(`/hianime/episode/sources?animeEpisodeId=${episodeId}&category=${category}`),
  proxyUrl: (url: string, referer = "https://megacloud.blog/") =>
    `${BASE_URL}/hindiapi/proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`,
  search: (q: string, page = 1) => fetchApi<SearchResult>(`/hianime/search?q=${encodeURIComponent(q)}&page=${page}`),
  searchSuggestions: (q: string) => fetchApi<{ suggestions: AnimeItem[] }>(`/hianime/search/suggestion?q=${encodeURIComponent(q)}`),
  getCategory: (name: string, page = 1) => fetchApi<SearchResult>(`/hianime/category/${name}?page=${page}`),
  getGenre: (name: string, page = 1) => fetchApi<SearchResult>(`/hianime/genre/${name}?page=${page}`),
  getSchedule: (date: string) => fetchApi<ScheduleData>(`/hianime/schedule?date=${date}`),
};
