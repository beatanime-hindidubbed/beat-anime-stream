import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

interface Props {
  episodeId: string;
  episodeNumber?: number;
  animeName?: string;
  className?: string;
}

const BASE = "https://beat-anime-api.onrender.com/api/v1";

export default function DownloadButton({ episodeId, episodeNumber, animeName = "anime", className = "" }: Props) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${BASE}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=hd-2&category=sub`
      );
      const data = await res.json();
      const rawUrl = data?.data?.sources?.[0]?.url;

      if (rawUrl) {
        // Direct proxy URL — works as a streamable AND downloadable link
        const directUrl = `${BASE}/hindiapi/proxy?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent("https://megacloud.blog/")}`;
        openDownloadPage(episodeNumber || 1, animeName, directUrl);
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

function openDownloadPage(epNum: number, animeName: string, url: string) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(animeName)} — Episode ${epNum} Download</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;background:#090912;color:#e0e0f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#12121e;border:1px solid #2a2a40;border-radius:18px;padding:40px;max-width:500px;width:100%;text-align:center;box-shadow:0 0 60px rgba(80,150,255,0.06)}
    .badge{display:inline-block;padding:4px 14px;background:rgba(80,200,255,0.12);color:#50c8ff;border-radius:20px;font-size:.78rem;font-weight:700;letter-spacing:.05em;margin-bottom:18px}
    h1{font-size:1.5rem;font-weight:700;color:#fff;margin-bottom:6px}
    .sub{color:#666;font-size:.88rem;margin-bottom:28px}
    .btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;border-radius:10px;font-weight:700;font-size:.9rem;text-decoration:none;transition:all .2s;margin:6px;cursor:pointer;border:none}
    .primary{background:linear-gradient(135deg,#50c8ff,#6080ff);color:#000}
    .primary:hover{opacity:.85;transform:translateY(-2px)}
    .secondary{background:#1a1a2e;color:#aaa;border:1px solid #333}
    .secondary:hover{border-color:#555;color:#fff}
    .info{background:#0e0e1a;border:1px solid #1e1e30;border-radius:10px;padding:14px 18px;margin-top:24px;font-size:.76rem;color:#555;word-break:break-all;text-align:left}
    .tip{margin-top:16px;font-size:.74rem;color:#444}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">📺 Episode ${epNum}</div>
    <h1>${esc(animeName)}</h1>
    <p class="sub">Your direct download link is ready.</p>
    <div>
      <a href="${url}" download="${esc(animeName)}-EP${epNum}.m3u8" class="btn primary">⬇ Download Episode</a>
      <a href="${url}" target="_blank" class="btn secondary">▶ Stream in Player</a>
    </div>
    <div class="info"><strong style="color:#888">Direct URL:</strong><br/><span>${url.substring(0,100)}...</span></div>
    <p class="tip">💡 Open in VLC → Media → Open Network Stream for best quality.</p>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const blobUrl = URL.createObjectURL(blob);
  const w = window.open(blobUrl, "_blank");
  if (w) setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
