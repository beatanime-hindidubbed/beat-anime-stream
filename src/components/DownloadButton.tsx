import { useState, useRef, useCallback } from "react";
import { Download, Loader2, CheckCircle, AlertCircle, Zap, Clock, Lock } from "lucide-react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface Props {
  episodeId: string;
  episodeNumber?: number;
  animeName?: string;
  className?: string;
  streamUrl?: string;
}

const PARALLEL_SEGMENTS = 16;
const SEGMENT_DELAY_MS  = 8;

type DLState = "idle" | "finding" | "downloading" | "done" | "error";

const QUALITY_PRESETS = [
  { label: "Auto", value: "auto"  },
  { label: "1080p", value: "1080" },
  { label: "720p",  value: "720"  },
  { label: "480p",  value: "480"  },
];

const LANGUAGE_OPTIONS = [
  { label: "Sub",  value: "sub"  },
  { label: "Dub",  value: "dub"  },
  { label: "Both", value: "both" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const proxyify = (base: string, raw: string, ref = "https://megacloud.blog/") =>
  `${base}/hindiapi/proxy?url=${encodeURIComponent(raw)}&referer=${encodeURIComponent(ref)}`;

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
  if (b < 1024)       return `${b}B`;
  if (b < 1048576)    return `${(b / 1024).toFixed(1)}KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)}MB`;
  return `${(b / 1073741824).toFixed(2)}GB`;
};

const fmtTime = (s: number) => {
  if (!isFinite(s) || s <= 0) return "--";
  if (s < 60)   return `${Math.ceil(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

// ─── Watermark: inject ID3v2 TXXX tag at start of first TS segment ───────────
// This embeds "t.me/BeatAnime" as a text comment in the MPEG-TS stream metadata.
function injectWatermarkId3(data: Uint8Array): Uint8Array {
  try {
    const enc     = new TextEncoder();
    const owner   = enc.encode("BeatAnime\0");
    const value   = enc.encode("t.me/BeatAnime - Downloaded from BeatAnime");
    // ID3v2.3 TXXX frame: encoding(1) + owner + value
    const frameData = new Uint8Array(1 + owner.length + value.length);
    frameData[0] = 0x03; // UTF-8
    frameData.set(owner, 1);
    frameData.set(value, 1 + owner.length);

    const frameId   = enc.encode("TXXX");
    const frameSize = frameData.length;
    const frame     = new Uint8Array(10 + frameSize);
    frame.set(frameId, 0);
    // Size as syncsafe integer
    frame[4] = (frameSize >> 21) & 0x7f;
    frame[5] = (frameSize >> 14) & 0x7f;
    frame[6] = (frameSize >> 7)  & 0x7f;
    frame[7] =  frameSize        & 0x7f;
    frame[8] = 0; frame[9] = 0; // flags
    frame.set(frameData, 10);

    // ID3v2.3 header: "ID3" + version(2,3,0) + flags(0) + size(syncsafe)
    const tagSize  = frame.length;
    const id3      = new Uint8Array(10 + tagSize);
    id3[0] = 0x49; id3[1] = 0x44; id3[2] = 0x33; // "ID3"
    id3[3] = 0x03; id3[4] = 0x00; id3[5] = 0x00; // version 2.3.0, no flags
    id3[6] = (tagSize >> 21) & 0x7f;
    id3[7] = (tagSize >> 14) & 0x7f;
    id3[8] = (tagSize >> 7)  & 0x7f;
    id3[9] =  tagSize        & 0x7f;
    id3.set(frame, 10);

    // Prepend ID3 tag before the TS data
    const watermarked = new Uint8Array(id3.length + data.length);
    watermarked.set(id3, 0);
    watermarked.set(data, id3.length);
    return watermarked;
  } catch {
    return data; // fallback: return original if anything fails
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DownloadButton({
  episodeId,
  episodeNumber,
  animeName = "anime",
  className = "",
  streamUrl,
}: Props) {
  const { user }     = useSupabaseAuth();
  const { settings } = useSiteSettings();

  const [dlState, setDlState]   = useState<DLState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [speed, setSpeed]       = useState("");
  const [eta, setEta]           = useState("");
  const [dlBytes, setDlBytes]   = useState(0);
  const [usedApi, setUsedApi]   = useState(0);
  const [quality, setQuality]   = useState("auto");
  const [language, setLanguage] = useState("sub");
  const [showQualityMenu, setShowQualityMenu]   = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const startRef  = useRef(0);
  const bytesRef  = useRef(0);
  const totalSegs = useRef(0);

  const apiPool = (settings.apiPool && settings.apiPool.length > 0)
    ? settings.apiPool
    : [
        "https://beat-anime-api.onrender.com/api/v1",
        "https://beat-anime-api-2.onrender.com/api/v1",
        "https://beat-anime-api-3.onrender.com/api/v1",
        "https://beat-anime-api-4.onrender.com/api/v1",
      ];

  const safeFilename = `${animeName.replace(/[^a-z0-9\-_ ]/gi, "_")}-EP${episodeNumber ?? 1}`;

  const canDownload = () => {
    const access = settings.downloadAccess || "logged-in";
    if (access === "all") return true;
    if (access === "logged-in" && user) return true;
    return false;
  };

  const onSegmentBytes = useCallback((bytes: number, segsDone: number) => {
    bytesRef.current += bytes;
    setDlBytes(bytesRef.current);
    const elapsed = (Date.now() - startRef.current) / 1000;
    if (elapsed > 0.5) {
      const bps = bytesRef.current / elapsed;
      setSpeed(`${fmtBytes(bps)}/s`);
      if (segsDone > 0 && totalSegs.current > segsDone) {
        const avgBytesPerSeg = bytesRef.current / segsDone;
        const remaining      = (totalSegs.current - segsDone) * avgBytesPerSeg;
        setEta(fmtTime(remaining / bps));
      } else if (segsDone >= totalSegs.current) {
        setEta("Done");
      }
    }
  }, []);

  // Try all APIs round-robin until one works
  const findSource = async (): Promise<{ proxyUrl: string; apiBase: string; apiNum: number } | null> => {
    const servers      = ["hd-2", "hd-1", "vidstreaming", "megacloud"];
    const preferredLang = language === "both" ? "sub" : language;
    const fallbackLang  = preferredLang === "sub" ? "dub" : "sub";
    const langsToTry    = language === "both" ? [preferredLang, fallbackLang] : [preferredLang];

    for (let apiNum = 0; apiNum < apiPool.length; apiNum++) {
      const apiBase = apiPool[apiNum];
      for (const srv of servers) {
        for (const cat of langsToTry) {
          try {
            const r = await fetch(
              `${apiBase}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${srv}&category=${cat}`
            );
            if (!r.ok) continue;
            const d   = await r.json();
            const raw = d?.data?.sources?.[0]?.url;
            if (raw) return { proxyUrl: proxyify(apiBase, raw), apiBase, apiNum: apiNum + 1 };
          } catch { continue; }
        }
      }
    }
    return null;
  };

  const downloadHLS = async (proxyUrl: string, apiBase: string): Promise<Uint8Array> => {
    const referer     = extractParam(proxyUrl, "referer") || "https://megacloud.blog/";
    const originalUrl = extractParam(proxyUrl, "url");

    const m3u8Res = await fetch(proxyUrl);
    if (!m3u8Res.ok) throw new Error("Stream unavailable");
    let m3u8Text = await m3u8Res.text();
    let mediaOriginal = originalUrl;

    if (m3u8Text.includes("#EXT-X-STREAM-INF")) {
      const lines = m3u8Text.split("\n").map(l => l.trim());
      let bestBW = -1, bestUri = "";

      if (quality === "auto") {
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
            const bw  = parseInt(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] || "0");
            const uri = lines[i + 1];
            if (uri && !uri.startsWith("#") && bw > bestBW) { bestBW = bw; bestUri = uri; }
          }
        }
      } else {
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
            const res = lines[i].match(/RESOLUTION=\d+x(\d+)/)?.[1];
            const uri = lines[i + 1];
            if (uri && !uri.startsWith("#") && res === quality) { bestUri = uri; break; }
          }
        }
        if (!bestUri) {
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
              const bw  = parseInt(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] || "0");
              const uri = lines[i + 1];
              if (uri && !uri.startsWith("#") && bw > bestBW) { bestBW = bw; bestUri = uri; }
            }
          }
        }
      }

      if (!bestUri) throw new Error("No playable stream found");
      mediaOriginal = resolveUrl(originalUrl, bestUri);
      const mediaRes = await fetch(proxyify(apiBase, mediaOriginal, referer));
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
      const batch   = segments.slice(i, i + PARALLEL_SEGMENTS);
      const results = await Promise.allSettled(
        batch.map(async url => {
          const r = await fetch(url);
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

    // ── Inject watermark as ID3 metadata into the TS stream ──
    return injectWatermarkId3(merged);
  };

  const handleClick = async () => {
    if (!canDownload()) {
      setErrorMsg(user ? "Download disabled" : "Login required");
      setDlState("error");
      setTimeout(() => { setDlState("idle"); setErrorMsg(""); }, 3000);
      return;
    }

    if (dlState !== "idle" && dlState !== "error") return;
    setDlState("finding");
    setErrorMsg(""); setProgress(0); setSpeed(""); setEta(""); setDlBytes(0);

    try {
      let proxyUrl = "";
      let apiBase  = apiPool[0];
      let apiNum   = 1;

      if (streamUrl) {
        proxyUrl = proxyify(apiPool[0], streamUrl);
      } else {
        const found = await findSource();
        if (!found) {
          setErrorMsg("No source found");
          setDlState("error");
          setTimeout(() => { setDlState("idle"); setErrorMsg(""); }, 3500);
          return;
        }
        proxyUrl = found.proxyUrl;
        apiBase  = found.apiBase;
        apiNum   = found.apiNum;
      }

      setUsedApi(apiNum);
      setDlState("downloading");

      const merged  = await downloadHLS(proxyUrl, apiBase);
      const blob    = new Blob([merged], { type: "video/mp2t" });
      const blobUrl = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: blobUrl,
        download: `${safeFilename}-${language}-${quality}.ts`,
        style: "display:none",
      });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

      setDlState("done");
      setTimeout(() => { setDlState("idle"); setProgress(0); setSpeed(""); setEta(""); setDlBytes(0); }, 4000);

    } catch (err: any) {
      setErrorMsg(err?.message || "Failed");
      setDlState("error");
      setTimeout(() => { setDlState("idle"); setProgress(0); setSpeed(""); setEta(""); setErrorMsg(""); }, 4000);
    }
  };

  const isActive = dlState === "finding" || dlState === "downloading";

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-2">

        {/* Main button */}
        <button
          onClick={handleClick}
          disabled={isActive || !canDownload()}
          title={!canDownload() ? (user ? "Download disabled" : "Login required") : errorMsg || `Download Episode ${episodeNumber ?? ""}`}
          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-70 overflow-hidden"
        >
          {dlState === "downloading" && progress > 0 && (
            <span
              className="absolute inset-0 bg-primary/20 pointer-events-none transition-all duration-200 rounded-lg"
              style={{ width: `${progress}%` }}
            />
          )}

          <span className="relative z-10 flex-shrink-0">
            {!canDownload()        ? <Lock          className="w-4 h-4 text-muted-foreground" />
            : dlState === "done"   ? <CheckCircle   className="w-4 h-4 text-green-400" />
            : dlState === "error"  ? <AlertCircle   className="w-4 h-4 text-red-400" />
            : isActive             ? <Loader2       className="w-4 h-4 animate-spin" />
            :                        <Download      className="w-4 h-4" />}
          </span>

          <span className="relative z-10 tabular-nums select-none whitespace-nowrap">
            {!canDownload()             ? (user ? "Disabled" : "Login")
            : dlState === "idle"        && (episodeNumber ? `EP ${episodeNumber}` : "Download")
            : dlState === "finding"     ? "Finding source…"
            : dlState === "downloading" ? (progress > 0 ? `${progress}%` : "Starting…")
            : dlState === "done"        ? "Saved ✓"
            : dlState === "error"       ? (errorMsg || "Retry")
            : "Download"}
          </span>

          {dlState === "downloading" && usedApi > 0 && (
            <span className="relative z-10 ml-auto text-[9px] font-bold px-1 py-0.5 rounded bg-white/10 text-primary flex-shrink-0">
              API{usedApi}
            </span>
          )}
        </button>

        {/* Quality selector */}
        {canDownload() && dlState === "idle" && (
          <div className="relative">
            <button
              onClick={() => setShowQualityMenu(!showQualityMenu)}
              className="px-2 py-1.5 rounded-lg bg-secondary text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              {QUALITY_PRESETS.find(q => q.value === quality)?.label || "Quality"}
            </button>
            {showQualityMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowQualityMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-30 min-w-[100px] rounded-lg bg-card border border-border shadow-lg overflow-hidden">
                  {QUALITY_PRESETS.map(q => (
                    <button key={q.value} onClick={() => { setQuality(q.value); setShowQualityMenu(false); }}
                      className={`w-full px-3 py-2 text-left text-xs hover:bg-secondary transition-colors ${quality === q.value ? "text-primary font-medium" : "text-foreground"}`}>
                      {q.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Language selector */}
        {canDownload() && dlState === "idle" && (
          <div className="relative">
            <button
              onClick={() => setShowLanguageMenu(!showLanguageMenu)}
              className="px-2 py-1.5 rounded-lg bg-secondary text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              {LANGUAGE_OPTIONS.find(l => l.value === language)?.label || "Language"}
            </button>
            {showLanguageMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowLanguageMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-30 min-w-[80px] rounded-lg bg-card border border-border shadow-lg overflow-hidden">
                  {LANGUAGE_OPTIONS.map(l => (
                    <button key={l.value} onClick={() => { setLanguage(l.value); setShowLanguageMenu(false); }}
                      className={`w-full px-3 py-2 text-left text-xs hover:bg-secondary transition-colors ${language === l.value ? "text-primary font-medium" : "text-foreground"}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Live stats row */}
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
              ETA <span className="text-foreground font-medium ml-0.5">{eta}</span>
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
