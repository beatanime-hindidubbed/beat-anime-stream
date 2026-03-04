import { useState, useRef } from "react";
import { Loader2, Package, X, ChevronDown, Download } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  animeId: string;
  animeName: string;
  totalEpisodes?: number;
  className?: string;
}

interface EpStatus {
  num: number;
  title: string;
  state: "pending" | "fetching" | "downloading" | "done" | "failed";
  progress: number; // 0-100
}

const BASE = "https://beat-anime-api.onrender.com/api/v1";
const PROXY_BASE = `${BASE}/hindiapi/proxy`;

export default function AnimeDownloadButton({ animeId, animeName, totalEpisodes, className = "" }: Props) {
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [epStatuses, setEpStatuses] = useState<EpStatus[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [showLog, setShowLog] = useState(false);
  const abortRef = useRef(false);

  const safeName = animeName.replace(/[^a-z0-9\-_ ]/gi, "_");

  const proxyify = (raw: string, ref = "https://megacloud.blog/") =>
    `${PROXY_BASE}?url=${encodeURIComponent(raw)}&referer=${encodeURIComponent(ref)}`;

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

  const updateEp = (idx: number, patch: Partial<EpStatus>) =>
    setEpStatuses(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));

  /** Download one episode's HLS stream → Uint8Array (all segments concatenated) */
  const fetchEpisodeBlob = async (
    episodeId: string,
    onProgress: (p: number) => void
  ): Promise<Uint8Array | null> => {
    // Try servers to get a stream URL
    let proxyUrl = "";
    const servers = ["hd-2", "hd-1", "vidstreaming", "megacloud"];
    outer: for (const srv of servers) {
      for (const cat of ["sub", "dub"]) {
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
    if (!proxyUrl) return null;

    // Fetch m3u8
    const referer = extractReferer(proxyUrl);
    const originalUrl = extractOriginalUrl(proxyUrl);
    const m3u8Res = await fetch(proxyUrl);
    if (!m3u8Res.ok) return null;
    let m3u8Text = await m3u8Res.text();
    let mediaProxyUrl = proxyUrl;

    // Handle master playlist
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
      if (!bestUri) return null;
      const resolvedMedia = resolveSegUrl(originalUrl, bestUri);
      mediaProxyUrl = proxyify(resolvedMedia, referer);
      const mediaRes = await fetch(mediaProxyUrl);
      if (!mediaRes.ok) return null;
      m3u8Text = await mediaRes.text();
    }

    // Parse segments
    const mediaOriginal = extractOriginalUrl(mediaProxyUrl);
    const segments: string[] = m3u8Text
      .split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"))
      .map(seg => proxyify(resolveSegUrl(mediaOriginal || originalUrl, seg), referer));

    if (!segments.length) return null;

    const chunks: Uint8Array[] = [];
    for (let i = 0; i < segments.length; i++) {
      if (abortRef.current) return null;
      try {
        const r = await fetch(segments[i]);
        if (r.ok) chunks.push(new Uint8Array(await r.arrayBuffer()));
      } catch { /* skip */ }
      onProgress(Math.round(((i + 1) / segments.length) * 100));
      await new Promise(r => setTimeout(r, 30)); // small delay to avoid hammering
    }

    if (!chunks.length) return null;

    const total = chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { merged.set(c, offset); offset += c.length; }
    return merged;
  };

  /** Build a ZIP file in-browser using the ZIP format spec (no external lib needed) */
  const buildZip = (files: { name: string; data: Uint8Array }[]): Uint8Array => {
    const encoder = new TextEncoder();
    const localHeaders: Uint8Array[] = [];
    const centralDir: Uint8Array[] = [];
    const offsets: number[] = [];
    let localOffset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const crc = crc32(file.data);
      const size = file.data.length;

      // Local file header
      const local = new Uint8Array(30 + nameBytes.length + size);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);  // signature
      lv.setUint16(4, 20, true);           // version needed
      lv.setUint16(6, 0, true);            // flags
      lv.setUint16(8, 0, true);            // compression (stored)
      lv.setUint16(10, 0, true);           // mod time
      lv.setUint16(12, 0, true);           // mod date
      lv.setUint32(14, crc, true);         // crc32
      lv.setUint32(18, size, true);        // compressed size
      lv.setUint32(22, size, true);        // uncompressed size
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);           // extra length
      local.set(nameBytes, 30);
      local.set(file.data, 30 + nameBytes.length);
      localHeaders.push(local);
      offsets.push(localOffset);
      localOffset += local.length;

      // Central directory entry
      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);  // central dir signature
      cv.setUint16(4, 20, true);           // version made by
      cv.setUint16(6, 20, true);           // version needed
      cv.setUint16(8, 0, true);            // flags
      cv.setUint16(10, 0, true);           // compression
      cv.setUint16(12, 0, true);           // mod time
      cv.setUint16(14, 0, true);           // mod date
      cv.setUint32(16, crc, true);         // crc32
      cv.setUint32(20, size, true);        // compressed size
      cv.setUint32(24, size, true);        // uncompressed size
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);           // extra length
      cv.setUint16(32, 0, true);           // comment length
      cv.setUint16(34, 0, true);           // disk number start
      cv.setUint16(36, 0, true);           // internal attrs
      cv.setUint32(38, 0, true);           // external attrs
      cv.setUint32(42, offsets[offsets.length - 1], true); // local header offset
      cd.set(nameBytes, 46);
      centralDir.push(cd);
    }

    const cdSize = centralDir.reduce((s, c) => s + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);          // end of central dir signature
    ev.setUint16(4, 0, true);                    // disk number
    ev.setUint16(6, 0, true);                    // disk with start of CD
    ev.setUint16(8, files.length, true);         // entries on this disk
    ev.setUint16(10, files.length, true);        // total entries
    ev.setUint32(12, cdSize, true);              // central dir size
    ev.setUint32(16, localOffset, true);         // central dir offset
    ev.setUint16(20, 0, true);                   // comment length

    // Concatenate everything
    const allParts = [...localHeaders, ...centralDir, eocd];
    const totalLen = allParts.reduce((s, p) => s + p.length, 0);
    const zip = new Uint8Array(totalLen);
    let pos = 0;
    for (const p of allParts) { zip.set(p, pos); pos += p.length; }
    return zip;
  };

  const handleDownloadAll = async () => {
    setPhase("running");
    abortRef.current = false;
    setShowLog(true);

    try {
      setStatusMsg("Fetching episode list…");
      const epData = await api.getEpisodes(animeId);
      const episodes = epData?.episodes || [];
      if (!episodes.length) { setStatusMsg("No episodes found."); setPhase("error"); return; }

      const statuses: EpStatus[] = episodes.map(ep => ({
        num: ep.number || 0,
        title: ep.title || `Episode ${ep.number}`,
        state: "pending",
        progress: 0,
      }));
      setEpStatuses(statuses);

      const collectedFiles: { name: string; data: Uint8Array }[] = [];
      let doneCount = 0;

      for (let i = 0; i < episodes.length; i++) {
        if (abortRef.current) break;
        const ep = episodes[i];
        if (!ep.episodeId) {
          updateEp(i, { state: "failed" });
          doneCount++;
          continue;
        }

        updateEp(i, { state: "fetching", progress: 0 });
        setStatusMsg(`Downloading EP ${ep.number ?? i + 1} of ${episodes.length}…`);

        try {
          updateEp(i, { state: "downloading" });
          const blob = await fetchEpisodeBlob(ep.episodeId, p => updateEp(i, { progress: p }));

          if (blob && blob.length > 0) {
            const fname = `${safeName}-EP${String(ep.number ?? i + 1).padStart(3, "0")}.ts`;
            collectedFiles.push({ name: fname, data: blob });
            updateEp(i, { state: "done", progress: 100 });
          } else {
            updateEp(i, { state: "failed", progress: 0 });
          }
        } catch {
          updateEp(i, { state: "failed" });
        }

        doneCount++;
        setOverallProgress(Math.round((doneCount / episodes.length) * 100));
        await new Promise(r => setTimeout(r, 100));
      }

      if (collectedFiles.length === 0) {
        setStatusMsg("No episodes could be downloaded.");
        setPhase("error");
        return;
      }

      setStatusMsg(`Building ZIP with ${collectedFiles.length} episodes…`);
      const zip = buildZip(collectedFiles);
      const blob = new Blob([zip], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}-all-episodes.zip`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 15000);

      setStatusMsg(`✓ Downloaded ${collectedFiles.length} episodes as ZIP!`);
      setPhase("done");
    } catch (err: any) {
      setStatusMsg(err?.message || "An error occurred.");
      setPhase("error");
    }
  };

  const handleCancel = () => {
    abortRef.current = true;
    setStatusMsg("Cancelled.");
    setPhase("idle");
    setEpStatuses([]);
    setOverallProgress(0);
  };

  const handleReset = () => {
    setPhase("idle");
    setEpStatuses([]);
    setOverallProgress(0);
    setStatusMsg("");
    setShowLog(false);
  };

  const stateColor = (s: EpStatus["state"]) => {
    if (s === "done") return "bg-green-500";
    if (s === "failed") return "bg-red-500";
    if (s === "downloading" || s === "fetching") return "bg-primary animate-pulse";
    return "bg-muted-foreground/30";
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* ── Main action button ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {phase === "idle" && (
          <button
            onClick={handleDownloadAll}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-accent text-sm font-semibold text-accent-foreground hover:opacity-90 transition-opacity shadow-md"
          >
            <Package className="w-4 h-4" />
            Download All as ZIP {totalEpisodes ? `(${totalEpisodes} eps)` : ""}
          </button>
        )}

        {phase === "running" && (
          <>
            <button
              disabled
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-accent text-sm font-semibold text-accent-foreground opacity-80 cursor-not-allowed"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              {overallProgress}% — {statusMsg}
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-destructive/20 text-destructive text-sm font-medium hover:bg-destructive/30 transition-colors"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          </>
        )}

        {(phase === "done" || phase === "error") && (
          <>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${phase === "done" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
              {phase === "done" ? <Download className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {statusMsg}
            </div>
            <button
              onClick={handleReset}
              className="px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors"
            >
              Reset
            </button>
          </>
        )}

        {/* Toggle log */}
        {epStatuses.length > 0 && (
          <button
            onClick={() => setShowLog(!showLog)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-secondary/60 text-secondary-foreground text-xs hover:bg-secondary transition-colors"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${showLog ? "rotate-180" : ""}`} />
            {showLog ? "Hide" : "Show"} Progress
          </button>
        )}
      </div>

      {/* ── Overall progress bar ── */}
      {phase === "running" && (
        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-accent rounded-full transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      )}

      {/* ── Per-episode log ── */}
      {showLog && epStatuses.length > 0 && (
        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Episode Progress</span>
            <span className="text-xs text-muted-foreground">
              {epStatuses.filter(e => e.state === "done").length} / {epStatuses.length} done
            </span>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-border">
            {epStatuses.map((ep, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2">
                {/* Status dot */}
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stateColor(ep.state)}`} />
                {/* EP label */}
                <span className="text-xs text-muted-foreground w-10 flex-shrink-0 tabular-nums">
                  EP {ep.num}
                </span>
                {/* Title */}
                <span className="text-xs text-foreground flex-1 truncate">{ep.title}</span>
                {/* Progress or status */}
                <span className="text-xs tabular-nums flex-shrink-0 w-16 text-right">
                  {ep.state === "done"        && <span className="text-green-400">✓ Done</span>}
                  {ep.state === "failed"       && <span className="text-red-400">✗ Failed</span>}
                  {ep.state === "pending"      && <span className="text-muted-foreground">Waiting</span>}
                  {ep.state === "fetching"     && <span className="text-primary">Finding…</span>}
                  {ep.state === "downloading"  && <span className="text-primary">{ep.progress}%</span>}
                </span>
                {/* Mini progress bar for downloading */}
                {ep.state === "downloading" && (
                  <div className="w-16 h-1 bg-secondary rounded-full overflow-hidden flex-shrink-0">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${ep.progress}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CRC32 implementation (required for valid ZIP) ─────────────────────────
function crc32(data: Uint8Array): number {
  const table = makeCRC32Table();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeCRC32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  return table;
}
