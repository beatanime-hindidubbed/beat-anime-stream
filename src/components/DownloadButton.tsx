import { useState, useRef, useCallback } from "react";
import { Download, Loader2, CheckCircle, AlertCircle, Zap, Clock, X } from "lucide-react";

interface Props {
  episodeId: string;
  episodeNumber?: number;
  animeName?: string;
  className?: string;
  streamUrl?: string;
}

const API_POOL = [
  "https://beat-anime-api.onrender.com/api/v1",
  "https://beat-anime-api-2.onrender.com/api/v1",
  "https://beat-anime-api-3.onrender.com/api/v1",
  "https://beat-anime-api-4.onrender.com/api/v1",
];

const PARALLEL_SEGMENTS = 16;
const SEGMENT_DELAY_MS  = 8;

type DLState = "idle" | "finding" | "downloading" | "done" | "error";

const proxyify = (base: string, raw: string, ref?: string) => {
  const refererPart = ref ? `&referer=${encodeURIComponent(ref)}` : "";
  return `${base}/hindiapi/proxy?url=${encodeURIComponent(raw)}${refererPart}`;
};

const extractParam = (pUrl: string, param: string) => {
  try { return decodeURIComponent(new URL(pUrl).searchParams.get(param) || ""); } catch { return ""; }
};

const resolveUrl = (base: string, rel: string) => {
  if (!rel || rel.startsWith("http")) return rel;
  try {
    const b = new URL(base);
    if (rel.startsWith("/")) return `${b.protocol}//${b.host}${rel}`;
    return base.substring(0, base.lastIndexOf("/") + 1) + rel;
  } catch { return rel; }
};

const fmtBytes = (b: number) => {
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)}MB`;
  return `${(b / 1073741824).toFixed(2)}GB`;
};

const fmtTime = (s: number) => {
  if (!isFinite(s) || s <= 0) return "--";
  if (s < 60) return `${Math.ceil(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

export default function DownloadButton({
  episodeId, episodeNumber, animeName = "anime", className = "", streamUrl,
}: Props) {
  const [dlState, setDlState]   = useState<DLState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [speed, setSpeed]       = useState("");
  const [eta, setEta]           = useState("");
  const [dlBytes, setDlBytes]   = useState(0);
  const [usedApi, setUsedApi]   = useState(0);

  const startRef    = useRef(0);
  const bytesRef    = useRef(0);
  const totalSegs   = useRef(0);
  const abortRef    = useRef<AbortController | null>(null);

  const safeFilename = `${animeName.replace(/[^a-z0-9\-_ ]/gi, "_")}-EP${episodeNumber ?? 1}`;

  const onSegmentBytes = useCallback((bytes: number, segsDone: number) => {
    bytesRef.current += bytes;
    setDlBytes(bytesRef.current);
    const elapsed = (Date.now() - startRef.current) / 1000;
    if (elapsed > 0.5) {
      const bps = bytesRef.current / elapsed;
      setSpeed(`${fmtBytes(bps)}/s`);
      if (segsDone > 0 && totalSegs.current > segsDone) {
        const remaining = ((totalSegs.current - segsDone) * (bytesRef.current / segsDone));
        setEta(fmtTime(remaining / bps));
      } else { setEta("Done"); }
    }
  }, []);

  const findSource = async (signal: AbortSignal): Promise<{ proxyUrl: string; apiBase: string; apiNum: number } | null> => {
    const servers = ["hd-2", "hd-1", "vidstreaming", "megacloud"];
    const cats    = ["sub", "dub"];
    for (let apiNum = 0; apiNum < API_POOL.length; apiNum++) {
      if (signal.aborted) return null;
      const apiBase = API_POOL[apiNum];
      for (const srv of servers) {
        for (const cat of cats) {
          try {
            const r = await fetch(
              `${apiBase}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${srv}&category=${cat}`,
              { signal }
            );
            if (!r.ok) continue;
            const d = await r.json();
            const raw = d?.data?.sources?.[0]?.url;
            if (raw) return { proxyUrl: proxyify(apiBase, raw), apiBase, apiNum: apiNum + 1 };
          } catch { if (signal.aborted) return null; continue; }
        }
      }
    }
    return null;
  };

  const downloadHLS = async (proxyUrl: string, apiBase: string, signal: AbortSignal): Promise<Uint8Array> => {
    const referer     = extractParam(proxyUrl, "referer") || "https://megacloud.blog/";
    const originalUrl = extractParam(proxyUrl, "url");

    const m3u8Res = await fetch(proxyUrl, { signal });
    if (!m3u8Res.ok) throw new Error("Stream unavailable");
    let m3u8Text = await m3u8Res.text();
    let mediaOriginal = originalUrl;

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
      mediaOriginal = resolveUrl(originalUrl, bestUri);
      const mediaRes = await fetch(proxyify(apiBase, mediaOriginal, referer), { signal });
      if (!mediaRes.ok) throw new Error("Media playlist fetch failed");
      m3u8Text = await mediaRes.text();
    }

    const segments: string[] = m3u8Text
      .split("\n").map(l => l.trim())
      .filter(l => l && !l.startsWith("#"))
      .map(seg => proxyify(apiBase, resolveUrl(mediaOriginal, seg), referer));

    if (!segments.length) throw new Error("No video segments found");

    totalSegs.current = segments.length;
    startRef.current  = Date.now();
    bytesRef.current  = 0;

    const chunks: (Uint8Array | null)[] = new Array(segments.length).fill(null);
    let segsDone = 0;

    for (let i = 0; i < segments.length; i += PARALLEL_SEGMENTS) {
      if (signal.aborted) throw new Error("Cancelled");
      const batch = segments.slice(i, i + PARALLEL_SEGMENTS);
      const results = await Promise.allSettled(
        batch.map(async url => {
          const r = await fetch(url, { signal });
          if (!r.ok) return null;
          return new Uint8Array(await r.arrayBuffer());
        })
      );
      for (let j = 0; j < results.length; j++) {
        const res = results[j];
        if (res.status === "fulfilled" && res.value) {
          chunks[i + j] = res.value;
          onSegmentBytes(res.value.length, segsDone + j + 1);
        }
      }
      segsDone += batch.length;
      setProgress(Math.round((segsDone / segments.length) * 100));
      if (SEGMENT_DELAY_MS) await new Promise(r => setTimeout(r, SEGMENT_DELAY_MS));
    }

    const valid = chunks.filter((c): c is Uint8Array => c !== null);
    if (!valid.length) throw new Error("All segments failed to download");
    const total  = valid.reduce((s, c) => s + c.length, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of valid) { merged.set(c, off); off += c.length; }
    return merged;
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setDlState("idle"); setProgress(0); setSpeed(""); setEta(""); setDlBytes(0);
  };

  const handleClick = async () => {
    if (dlState !== "idle" && dlState !== "error") return;
    const controller = new AbortController();
    abortRef.current = controller;
    setDlState("finding");
    setErrorMsg(""); setProgress(0); setSpeed(""); setEta(""); setDlBytes(0);

    try {
      let proxyUrl = "", apiBase = API_POOL[0], apiNum = 1;

      if (streamUrl) {
        // If streamUrl is already proxied, use it directly; otherwise proxy it
        const isAlreadyProxied = streamUrl.includes("/hindiapi/proxy");
        proxyUrl = isAlreadyProxied ? streamUrl : proxyify(API_POOL[0], streamUrl);
      } else {
        const found = await findSource(controller.signal);
        if (!found) { setErrorMsg("No source found"); setDlState("error"); setTimeout(() => { setDlState("idle"); setErrorMsg(""); }, 3500); return; }
        proxyUrl = found.proxyUrl; apiBase = found.apiBase; apiNum = found.apiNum;
      }

      setUsedApi(apiNum);
      setDlState("downloading");

      const merged = await downloadHLS(proxyUrl, apiBase, controller.signal);

      const blob    = new Blob([merged as BlobPart], { type: "video/mp2t" });
      const blobUrl = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: blobUrl, download: `${safeFilename}.ts`, style: "display:none" });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

      setDlState("done");
      setTimeout(() => { setDlState("idle"); setProgress(0); setSpeed(""); setEta(""); setDlBytes(0); }, 4000);
    } catch (err: any) {
      if (err?.name === "AbortError" || err?.message === "Cancelled") {
        setDlState("idle"); return;
      }
      setErrorMsg(err?.message || "Failed");
      setDlState("error");
      setTimeout(() => { setDlState("idle"); setProgress(0); setSpeed(""); setEta(""); setErrorMsg(""); }, 4000);
    } finally {
      abortRef.current = null;
    }
  };

  const isActive = dlState === "finding" || dlState === "downloading";

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-1">
        <button
          onClick={handleClick}
          disabled={isActive}
          title={errorMsg || `Download Episode ${episodeNumber ?? ""}`}
          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-70 overflow-hidden"
        >
          {dlState === "downloading" && progress > 0 && (
            <span className="absolute inset-0 bg-primary/20 pointer-events-none transition-all duration-200 rounded-lg" style={{ width: `${progress}%` }} />
          )}
          <span className="relative z-10 flex-shrink-0">
            {dlState === "done"   ? <CheckCircle className="w-4 h-4 text-green-400" />
            : dlState === "error" ? <AlertCircle className="w-4 h-4 text-red-400" />
            : isActive            ? <Loader2 className="w-4 h-4 animate-spin" />
            :                       <Download className="w-4 h-4" />}
          </span>
          <span className="relative z-10 tabular-nums select-none whitespace-nowrap">
            {dlState === "idle"        && (episodeNumber ? `EP ${episodeNumber}` : "Download")}
            {dlState === "finding"     && "Finding source…"}
            {dlState === "downloading" && (progress > 0 ? `${progress}%` : "Starting…")}
            {dlState === "done"        && "Saved ✓"}
            {dlState === "error"       && (errorMsg || "Retry")}
          </span>
          {dlState === "downloading" && usedApi > 0 && (
            <span className="relative z-10 ml-auto text-[9px] font-bold px-1 py-0.5 rounded bg-white/10 text-primary flex-shrink-0">API{usedApi}</span>
          )}
        </button>

        {/* Cancel button */}
        {isActive && (
          <button
            onClick={handleCancel}
            className="w-7 h-7 flex items-center justify-center rounded-md bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors flex-shrink-0"
            title="Cancel download"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {dlState === "downloading" && (speed || eta || dlBytes > 0) && (
        <div className="flex items-center gap-2.5 px-2 text-[10px] text-muted-foreground">
          {speed && (
            <span className="flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-amber-400" />
              <span className="text-foreground font-medium">{speed}</span>
            </span>
          )}
          {eta && (
            <span className="flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-primary" />
              <span>ETA <span className="text-foreground font-medium">{eta}</span></span>
            </span>
          )}
          {dlBytes > 0 && (
            <span className="text-foreground font-medium">{fmtBytes(dlBytes)}</span>
          )}
        </div>
      )}
    </div>
  );
}
