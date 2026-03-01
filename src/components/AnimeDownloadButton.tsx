import { useState } from "react";
import { Download, Loader2, Package } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  animeId: string;
  animeName: string;
  totalEpisodes?: number;
  className?: string;
}

export default function AnimeDownloadButton({ animeId, animeName, totalEpisodes, className = "" }: Props) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDownloadAll = async () => {
    setLoading(true);
    setProgress(0);

    try {
      const epData = await api.getEpisodes(animeId);
      const episodes = epData?.episodes || [];
      if (!episodes.length) return;

      const base = "https://beat-anime-api.onrender.com/api/v1";

      for (let i = 0; i < episodes.length; i++) {
        const ep = episodes[i];
        if (!ep.episodeId) continue;

        try {
          const res = await fetch(
            `${base}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(ep.episodeId)}&server=hd-2&category=sub`
          );
          const data = await res.json();
          const url = data?.data?.sources?.[0]?.url;
          if (url) {
            const proxyUrl = `${base}/hindiapi/proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent("https://megacloud.blog/")}`;
            const a = document.createElement("a");
            a.href = proxyUrl;
            a.download = `${animeName}-EP${ep.number || i + 1}.m3u8`;
            a.target = "_blank";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        } catch {}

        setProgress(Math.round(((i + 1) / episodes.length) * 100));
        // Small delay between downloads
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      console.error("Batch download failed:", err);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  return (
    <button
      onClick={handleDownloadAll}
      disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-accent text-sm font-medium text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60 ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{progress}%</span>
        </>
      ) : (
        <>
          <Package className="w-4 h-4" />
          <span>Download All {totalEpisodes ? `(${totalEpisodes} eps)` : ""}</span>
        </>
      )}
    </button>
  );
}
