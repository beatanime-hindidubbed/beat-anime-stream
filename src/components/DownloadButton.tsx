import { useState } from "react";
import { Download, Loader2, CheckCircle } from "lucide-react";

interface Props {
  episodeId: string;
  episodeNumber?: number;
  animeName?: string;
  className?: string;
  /** If provided, use this stream URL directly (goes through proxy → blob, never exposed) */
  streamUrl?: string;
}

const BASE = "https://beat-anime-api.onrender.com/api/v1";
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

  const safeFilename = `${animeName.replace(/[^a-z0-9\-_ ]/gi, "")}-EP${episodeNumber ?? 1}`;

  /** Fetch the proxied URL as a blob and trigger download — URL is NEVER written to DOM */
  const downloadViaBlob = async (proxyUrl: string) => {
    setDlState("downloading");
    setProgress(0);
    try {
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error("Fetch failed");

      const contentLength = Number(res.headers.get("content-length") ?? 0);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          if (contentLength > 0) setProgress(Math.round((received / contentLength) * 100));
        }
      }

      const ct = res.headers.get("content-type") ?? "";
      const ext = ct.includes("mp2t") || ct.includes("mpeg") ? "ts" : "mp4";
      const blob = new Blob(chunks, { type: ct || "application/octet-stream" });

      // Create opaque blob URL — this reveals nothing about the original stream
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${safeFilename}.${ext}`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke blob URL quickly so devtools can't capture it
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

      setDlState("done");
      setTimeout(() => { setDlState("idle"); setProgress(0); }, 3000);
    } catch {
      setDlState("error");
      setTimeout(() => { setDlState("idle"); setProgress(0); }, 3000);
    }
  };

  const handleClick = async () => {
    if (dlState !== "idle" && dlState !== "error") return;
    setDlState("finding");

    try {
      let proxyUrl = "";

      if (streamUrl) {
        proxyUrl = `${BASE}/hindiapi/proxy?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent("https://megacloud.blog/")}`;
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
              if (raw) {
                proxyUrl = `${BASE}/hindiapi/proxy?url=${encodeURIComponent(raw)}&referer=${encodeURIComponent("https://megacloud.blog/")}`;
                break outer;
              }
            } catch { continue; }
          }
        }
      }

      if (!proxyUrl) { setDlState("error"); setTimeout(() => setDlState("idle"), 3000); return; }
      await downloadViaBlob(proxyUrl);
    } catch {
      setDlState("error");
      setTimeout(() => setDlState("idle"), 3000);
    }
  };

  const isSpinning = dlState === "finding" || dlState === "downloading";

  return (
    <button
      onClick={handleClick}
      disabled={dlState !== "idle" && dlState !== "error"}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-70 overflow-hidden ${className}`}
      title="Download — stream URL is private"
    >
      {/* Progress fill bar */}
      {dlState === "downloading" && progress > 0 && (
        <span
          className="absolute inset-0 bg-primary/25 pointer-events-none transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      )}

      {dlState === "done"
        ? <CheckCircle className="relative z-10 w-4 h-4 text-green-400" />
        : <Download className={`relative z-10 w-4 h-4 ${isSpinning ? "animate-bounce" : ""}`} />
      }
      {isSpinning && <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin opacity-60" />}

      <span className="relative z-10 tabular-nums select-none">
        {dlState === "idle"    && (episodeNumber ? `EP ${episodeNumber}` : "Download")}
        {dlState === "finding" && "Finding…"}
        {dlState === "downloading" && (progress > 0 ? `${progress}%` : "Preparing…")}
        {dlState === "done"    && "Saved ✓"}
        {dlState === "error"   && "Retry"}
      </span>
    </button>
  );
}
