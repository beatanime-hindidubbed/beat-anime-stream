import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

interface Props {
  episodeId: string;
  episodeNumber?: number;
  animeName?: string;
  className?: string;
  /** If provided, skip the fetch and use this URL directly */
  streamUrl?: string;
}

const BASE = "https://beat-anime-api.onrender.com/api/v1";

export default function DownloadButton({ episodeId, episodeNumber, animeName = "anime", className = "", streamUrl }: Props) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      let directUrl = "";

      if (streamUrl) {
        // Use the currently playing stream URL directly via proxy
        directUrl = `${BASE}/hindiapi/proxy?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent("https://megacloud.blog/")}`;
      } else {
        // Fallback: fetch from API
        const servers = ["hd-2", "hd-1", "vidstreaming", "megacloud"];
        const categories = ["sub", "dub"];
        
        for (const server of servers) {
          for (const cat of categories) {
            try {
              const res = await fetch(
                `${BASE}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${server}&category=${cat}`
              );
              if (!res.ok) continue;
              const data = await res.json();
              const rawUrl = data?.data?.sources?.[0]?.url;
              if (rawUrl) {
                directUrl = `${BASE}/hindiapi/proxy?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent("https://megacloud.blog/")}`;
                break;
              }
            } catch { continue; }
          }
          if (directUrl) break;
        }
      }

      if (directUrl) {
        // Open download in new tab — the proxy serves the m3u8 which can be saved
        const link = document.createElement("a");
        link.href = directUrl;
        link.download = `${animeName}-EP${episodeNumber || 1}.m3u8`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        alert("Download link not available. Try a different server.");
      }
    } catch {
      alert("Could not fetch download link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 ${className}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      {episodeNumber ? `EP ${episodeNumber}` : "Download"}
    </button>
  );
}
