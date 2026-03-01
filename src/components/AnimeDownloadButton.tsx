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

export default function AnimeDownloadButton({ animeId, animeName, totalEpisodes, className = "" }: Props) {
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

      const links: { epNum: number; title: string; m3u8Url: string; proxyUrl: string }[] = [];

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
            const proxiedUrl = `${BASE}/hindiapi/proxy?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent("https://megacloud.blog/")}`;
            links.push({
              epNum: ep.number || i + 1,
              title: ep.title || `Episode ${ep.number || i + 1}`,
              m3u8Url: rawUrl,
              proxyUrl: proxiedUrl,
            });
          }
        } catch {}

        setProgress(Math.round(((i + 1) / episodes.length) * 100));
        await new Promise((r) => setTimeout(r, 200));
      }

      if (!links.length) {
        alert("No download links found. Try again later.");
        setLoading(false);
        return;
      }

      openDownloadIndex(animeName, links);
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

function openDownloadIndex(
  animeName: string,
  links: { epNum: number; title: string; m3u8Url: string; proxyUrl: string }[]
) {
  const rows = links
    .map(
      (l) => `
    <div class="ep-row" data-search="${esc(l.title)} episode ${l.epNum}">
      <div class="ep-info">
        <span class="ep-num">EP ${l.epNum}</span>
        <span class="ep-title">${esc(l.title)}</span>
      </div>
      <div class="ep-actions">
        <a href="${l.proxyUrl}" download="${esc(animeName)}-EP${l.epNum}.ts" class="btn dl">⬇ Download</a>
        <a href="vlc://${l.proxyUrl}" class="btn vlc">🎬 VLC</a>
        <button onclick="copyLink('${l.proxyUrl}')" class="btn copy">📋 Copy</button>
      </div>
    </div>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(animeName)} — Download All Episodes</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;background:#090912;color:#e0e0f0;min-height:100vh;padding:28px 16px}
    .header{max-width:820px;margin:0 auto 24px;text-align:center}
    .site-badge{display:inline-block;padding:4px 14px;background:rgba(80,200,255,0.1);color:#50c8ff;border-radius:20px;font-size:.76rem;font-weight:700;letter-spacing:.08em;margin-bottom:12px}
    h1{font-size:1.7rem;font-weight:800;color:#fff;margin-bottom:6px}
    .sub{color:#555;font-size:.88rem;margin-bottom:4px}
    .count{color:#50c8ff;font-weight:700;font-size:.85rem}
    .search-wrap{max-width:820px;margin:0 auto 20px}
    .search-wrap input{width:100%;padding:10px 16px;background:#12121e;border:1px solid #2a2a40;border-radius:10px;color:#fff;font-size:.9rem;outline:none;transition:border .2s}
    .search-wrap input:focus{border-color:#50c8ff}
    .list{max-width:820px;margin:0 auto}
    .ep-row{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#12121e;border:1px solid #1e1e30;border-radius:12px;margin-bottom:8px;gap:12px;flex-wrap:wrap;transition:border .15s}
    .ep-row:hover{border-color:#2a2a50}
    .ep-info{display:flex;align-items:center;gap:12px;flex:1;min-width:0}
    .ep-num{background:#1a1a2e;color:#50c8ff;padding:3px 10px;border-radius:6px;font-size:.78rem;font-weight:800;white-space:nowrap;border:1px solid #2a2a50}
    .ep-title{color:#bbb;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ep-actions{display:flex;gap:8px;flex-wrap:wrap}
    .btn{padding:7px 14px;border-radius:8px;font-size:.78rem;font-weight:700;text-decoration:none;transition:all .15s;white-space:nowrap;cursor:pointer;border:none}
    .dl{background:linear-gradient(135deg,#50c8ff,#6080ff);color:#000}
    .dl:hover{opacity:.85;transform:translateY(-1px)}
    .vlc{background:#1a1a2e;color:#ff8800;border:1px solid #ff8800}
    .vlc:hover{background:#ff8800;color:#000}
    .copy{background:#1a1a2e;color:#888;border:1px solid #333}
    .copy:hover{color:#fff;border-color:#555}
    .tip{max-width:820px;margin:20px auto 0;padding:12px 18px;background:#0e0e1a;border:1px solid #1e1e30;border-radius:10px;font-size:.77rem;color:#555}
    .toast{position:fixed;bottom:20px;right:20px;background:#50c8ff;color:#000;padding:10px 18px;border-radius:10px;font-weight:700;font-size:.85rem;opacity:0;transition:opacity .3s;pointer-events:none}
    .toast.show{opacity:1}
  </style>
</head>
<body>
  <div class="header">
    <div class="site-badge">BEAT ANISTREAM</div>
    <h1>${esc(animeName)}</h1>
    <p class="sub">Direct stream links — play in VLC or download</p>
    <p class="count">${links.length} episodes</p>
  </div>
  <div class="search-wrap">
    <input type="text" id="s" placeholder="🔍 Search episodes..." oninput="filter(this.value)" />
  </div>
  <div class="list" id="list">${rows}</div>
  <div class="tip">
    💡 <strong>How to download:</strong> Click ⬇ Download to save the stream file, then open in VLC → Media → Open File.<br>
    🎬 <strong>VLC Direct:</strong> Click 🎬 VLC button to open directly in VLC app (requires VLC installed).<br>
    📋 <strong>Copy Link:</strong> Copy the stream URL to use in any media player or IDM.
  </div>
  <div class="toast" id="toast">Link copied!</div>
  <script>
    function filter(q){
      document.querySelectorAll('.ep-row').forEach(r=>{
        r.style.display=r.dataset.search.toLowerCase().includes(q.toLowerCase())?'flex':'none';
      });
    }
    function copyLink(url){
      navigator.clipboard.writeText(url).then(()=>{
        const t=document.getElementById('toast');
        t.classList.add('show');
        setTimeout(()=>t.classList.remove('show'),2000);
      });
    }
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const blobUrl = URL.createObjectURL(blob);
  const w = window.open(blobUrl, "_blank");
  if (w) setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
