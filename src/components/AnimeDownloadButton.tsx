import { useState } from "react";
import { Loader2, Package } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  animeId: string;
  animeName: string;
  totalEpisodes?: number;
  className?: string;
}

const BASE = "https://beat-anime-api.onrender.com/api/v1";

export default function AnimeDownloadButton({
  animeId,
  animeName,
  totalEpisodes,
  className = "",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDownloadAll = async () => {
    setLoading(true);
    setProgress(0);

    try {
      const epData = await api.getEpisodes(animeId);
      const episodes = epData?.episodes || [];
      if (!episodes.length) {
        alert("No episodes found.");
        setLoading(false);
        return;
      }

      const links: { epNum: number; title: string; url: string }[] = [];

      for (let i = 0; i < episodes.length; i++) {
        const ep = episodes[i];
        if (!ep.episodeId) continue;

        try {
          const res = await fetch(
            `${BASE}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(ep.episodeId)}&server=hd-2&category=sub`
          );
          const data = await res.json();
          const rawUrl = data?.data?.sources?.[0]?.url;
          if (rawUrl) {
            const directUrl = `${BASE}/hindiapi/proxy?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent("https://megacloud.blog/")}`;
            links.push({
              epNum: ep.number || i + 1,
              title: ep.title || `Episode ${ep.number || i + 1}`,
              url: directUrl,
            });
          }
        } catch {}

        setProgress(Math.round(((i + 1) / episodes.length) * 100));
        await new Promise((r) => setTimeout(r, 250));
      }

      if (!links.length) {
        alert("No download links found. Try again later.");
        setLoading(false);
        return;
      }

      openIndexPage(animeName, links);
    } catch {
      alert("Failed to fetch episode links. Please try again.");
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
          <span>Fetching {progress}%</span>
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

function openIndexPage(
  animeName: string,
  links: { epNum: number; title: string; url: string }[]
) {
  const rows = links
    .map(
      (l) => `
    <div class="ep-row">
      <div class="ep-info">
        <span class="ep-num">EP ${l.epNum}</span>
        <span class="ep-title">${esc(l.title)}</span>
      </div>
      <div class="ep-actions">
        <a href="${l.url}" download="${esc(animeName)}-EP${l.epNum}.m3u8" class="btn dl">⬇ Download</a>
        <a href="${l.url}" target="_blank" class="btn play">▶ Play</a>
      </div>
    </div>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(animeName)} — All Episodes Download</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;background:#090912;color:#e0e0f0;min-height:100vh;padding:28px 16px}
    .header{max-width:780px;margin:0 auto 24px;text-align:center}
    .site-badge{display:inline-block;padding:4px 14px;background:rgba(80,200,255,0.1);color:#50c8ff;border-radius:20px;font-size:.76rem;font-weight:700;letter-spacing:.08em;margin-bottom:12px}
    h1{font-size:1.7rem;font-weight:800;color:#fff;margin-bottom:6px}
    .sub{color:#555;font-size:.88rem;margin-bottom:4px}
    .count{color:#50c8ff;font-weight:700;font-size:.85rem}
    .search-wrap{max-width:780px;margin:0 auto 20px}
    .search-wrap input{width:100%;padding:10px 16px;background:#12121e;border:1px solid #2a2a40;border-radius:10px;color:#fff;font-size:.9rem;outline:none;transition:border .2s}
    .search-wrap input:focus{border-color:#50c8ff}
    .list{max-width:780px;margin:0 auto}
    .ep-row{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#12121e;border:1px solid #1e1e30;border-radius:12px;margin-bottom:8px;gap:12px;flex-wrap:wrap;transition:border .15s}
    .ep-row:hover{border-color:#2a2a50}
    .ep-info{display:flex;align-items:center;gap:12px;flex:1;min-width:0}
    .ep-num{background:#1a1a2e;color:#50c8ff;padding:3px 10px;border-radius:6px;font-size:.78rem;font-weight:800;white-space:nowrap;border:1px solid #2a2a50}
    .ep-title{color:#bbb;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ep-actions{display:flex;gap:8px}
    .btn{padding:8px 16px;border-radius:8px;font-size:.8rem;font-weight:700;text-decoration:none;transition:all .15s;white-space:nowrap}
    .dl{background:linear-gradient(135deg,#50c8ff,#6080ff);color:#000}
    .dl:hover{opacity:.85;transform:translateY(-1px)}
    .play{background:#1a1a2e;color:#888;border:1px solid #333}
    .play:hover{color:#fff;border-color:#555}
    .tip{max-width:780px;margin:20px auto 0;padding:12px 18px;background:#0e0e1a;border:1px solid #1e1e30;border-radius:10px;font-size:.77rem;color:#444}
  </style>
</head>
<body>
  <div class="header">
    <div class="site-badge">BEAT ANISTREAM</div>
    <h1>${esc(animeName)}</h1>
    <p class="sub">All episodes with direct download links</p>
    <p class="count">${links.length} episodes found</p>
  </div>
  <div class="search-wrap">
    <input type="text" id="s" placeholder="Search episodes..." oninput="filter(this.value)" />
  </div>
  <div class="list" id="list">${rows}</div>
  <div class="tip">💡 <strong>Tip:</strong> Download links are direct M3U8 streams. Open in VLC via Media → Open Network Stream for full quality download.</div>
  <script>
    function filter(q){
      document.querySelectorAll('.ep-row').forEach(r=>{
        r.style.display=r.textContent.toLowerCase().includes(q.toLowerCase())?'':'none';
      });
    }
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const blobUrl = URL.createObjectURL(blob);
  const w = window.open(blobUrl, "_blank");
  if (w) setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
