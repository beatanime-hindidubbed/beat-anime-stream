import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

interface Props {
  episodeId: string;
  episodeNumber?: number;
  className?: string;
}

export default function DownloadButton({ episodeId, episodeNumber, className = "" }: Props) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const base = "https://beat-anime-api.onrender.com/api/v1";
      const res = await fetch(
        `${base}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=hd-2&category=sub`
      );
      const data = await res.json();
      const url = data?.data?.sources?.[0]?.url;
      if (url) {
        const proxyUrl = `${base}/hindiapi/proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent("https://megacloud.blog/")}`;
        const a = document.createElement("a");
        a.href = proxyUrl;
        a.download = `episode-${episodeNumber || "unknown"}.m3u8`;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error("Download failed:", err);
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
