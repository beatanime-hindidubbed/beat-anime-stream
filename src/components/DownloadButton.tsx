import { useState } from "react";
import { Download, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface Props {
  episodeId: string;
  episodeNumber?: number;
  animeName?: string;
  className?: string;
  streamUrl?: string;
}

const BASE = "https://beat-anime-api.onrender.com/api/v1";
const PROXY_BASE = `${BASE}/hindiapi/proxy`;
type DLState = "idle" | "finding" | "downloading" | "done" | "error";

export default function DownloadButton({
  episodeId,
  episodeNumber,
  animeName = "anime",
  className = "",
  streamUrl,
}: Props) {
  const [dlState, setDlState] = useState<DLState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const safeFilename = `${animeName.replace(/[^a-z0-9\-_ ]/gi, "_")}-EP${episodeNumber ?? 1}`;

  const proxyify = (rawUrl: string, referer = "https://megacloud.blog/") =>
    `${PROXY_BASE}?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent(referer)}`;

  const extractOriginalUrl = (pUrl: string) => {
    try { return decodeURIComponent(new URL(pUrl).searchParams.get("url") || ""); } catch { return ""; }
  };

  const extractReferer = (pUrl: string) => {
    try { return decodeURIComponent(new URL(pUrl).searchParams.get("referer") || "https://megacloud.blog/"); } catch { return "https://megacloud.blog/"; }
  };

  const resolveSegUrl = (base: string, rel: string) => {
    if (rel.startsWith("http")) return rel;
    try {
      const b = new URL(base);
      if (rel.startsWith("/")) return `${b.protocol}//${b.host}${rel}`;
      return base.substring(0, base.lastIndexOf("/") + 1) + rel;
    } catch { return rel; }
  };

  /** Fetch m3u8, resolve all segments, concatenate .ts → blob → download */
  const downloadHLS = async (proxyUrl: string) => {
    setDlState("downloading");
    setProgress(1);

    const referer = extractReferer(proxyUrl);
    const originalUrl = extractOriginalUrl(proxyUrl);

    // Fetch the top-level m3u8 (could be master or media playlist)
    const m3u8Res = await fetch(proxyUrl);
    if (!m3u8Res.ok) throw new Error("Stream unavailable");
    let m3u8Text = await m3u8Res.text();
    let mediaProxyUrl = proxyUrl;

    // If it's a master playlist, pick the best stream and fetch its media playlist
    if (m3u8Text.includes("#EXT-X-STREAM-INF")) {
      const lines = m3u8Text.split("\n").map(l => l.trim());
      let bestBW = -1, bestUri = "";
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
          const bw = parseInt(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] || "0");
          const uri = lines[i + 1];
          if (uri && !uri.startsWith("#") && bw > bestBW) { bestBW = bw; bestUri = uri; }
        }
      }
      if (!bestUri) throw new Error("No playable stream found");
      const resolvedMediaUrl = resolveSegUrl(originalUrl, bestUri);
      mediaProxyUrl = proxyify(resolvedMediaUrl, referer);
      const mediaRes = await fetch(mediaProxyUrl);
      if (!mediaRes.ok) throw new Error("Media playlist fetch failed");
      m3u8Text = await mediaRes.text();
    }

    // Parse segment lines from media playlist
    const mediaOriginalUrl = extractOriginalUrl(mediaProxyUrl);
    const segments: string[] = m3u8Text
      .split("\n")
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("#"))
      .map(seg => {
        const resolved = resolveSegUrl(mediaOriginalUrl || originalUrl, seg);
        return proxyify(resolved, referer);
      });

    if (!segments.length) throw new Error("No video segments found");

    // Download each segment sequentially and collect
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < segments.length; i++) {
      try {
        const r = await fetch(segments[i]);
        if (r.ok) {
          const buf = await r.arrayBuffer();
          chunks.push(new Uint8Array(buf));
        }
      } catch { /* skip failed segment, continue */ }
      setProgress(Math.round(((i + 1) / segments.length) * 100));
    }

    if (!chunks.length) throw new Error("All segments failed to download");

    // Concatenate into one .ts file
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { merged.set(c, offset); offset += c.length; }

    const blob = new Blob([merged], { type: "video/mp2t" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${safeFilename}.ts`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  };

  const handleClick = async () => {
    if (dlState !== "idle" && dlState !== "error") return;
    setDlState("finding");
    setErrorMsg("");

    try {
      let proxyUrl = "";

      if (streamUrl) {
        proxyUrl = proxyify(streamUrl);
      } else {
        const servers = ["hd-2", "hd-1", "vidstreaming", "megacloud"];
        const cats = ["sub", "dub"];
        outer: for (const srv of servers) {
          for (const cat of cats) {
            try {
              const r = await fetch(
                `${BASE}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${srv}&category=${cat}`
              );
              if (!r.ok) continue;
              const d = await r.json();
              const raw = d?.data?.sources?.[0]?.url;
              if (raw) { proxyUrl = proxyify(raw); break outer; }
            } catch { continue; }
          }
        }
      }

      if (!proxyUrl) {
        setErrorMsg("No source found");
        setDlState("error");
        setTimeout(() => { setDlState("idle"); setErrorMsg(""); }, 3000);
        return;
      }

      await downloadHLS(proxyUrl);
      setDlState("done");
      setTimeout(() => { setDlState("idle"); setProgress(0); }, 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed");
      setDlState("error");
      setTimeout(() => { setDlState("idle"); setProgress(0); setErrorMsg(""); }, 4000);
    }
  };

  const isActive = dlState === "finding" || dlState === "downloading";

  return (
    <button
      onClick={handleClick}
      disabled={isActive}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-70 overflow-hidden ${className}`}
      title={errorMsg || `Download Episode ${episodeNumber ?? ""}`}
    >
      {dlState === "downloading" && progress > 0 && (
        <span
          className="absolute inset-0 bg-primary/20 pointer-events-none transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      )}
      <span className="relative z-10">
        {dlState === "done"    ? <CheckCircle className="w-4 h-4 text-green-400" />
        : dlState === "error"  ? <AlertCircle className="w-4 h-4 text-red-400" />
        : isActive             ? <Loader2 className="w-4 h-4 animate-spin" />
        :                        <Download className="w-4 h-4" />}
      </span>
      <span className="relative z-10 tabular-nums select-none">
        {dlState === "idle"        && (episodeNumber ? `EP ${episodeNumber}` : "Download")}
        {dlState === "finding"     && "Finding…"}
        {dlState === "downloading" && (progress > 0 ? `${progress}%` : "Starting…")}
        {dlState === "done"        && "Saved ✓"}
        {dlState === "error"       && (errorMsg || "Retry")}
      </span>
    </button>
  );
}
