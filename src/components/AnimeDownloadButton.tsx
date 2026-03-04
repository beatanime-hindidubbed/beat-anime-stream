import { useState, useRef, useCallback } from "react";
import { Loader2, Package, X, ChevronDown, Download, Zap, Clock, Wifi } from "lucide-react";
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
  progress: number;
  apiIdx: number;
  bytes: number;
}

// ─── 4 API Pool (Option 7: Load balancing) ───────────────────────────────────
const API_POOL = [
  "https://beat-anime-api.onrender.com/api/v1",
  "https://beat-anime-api-2.onrender.com/api/v1",
  "https://beat-anime-api-3.onrender.com/api/v1",
  "https://beat-anime-api-4.onrender.com/api/v1",
];

const PARALLEL_EPISODES = 4;   // Option 2: 4 episodes at once, one per API
const PARALLEL_SEGMENTS  = 16; // Option 1: 16 HLS segments at once per episode
const SEGMENT_DELAY_MS   = 8;  // brief pause between batches to avoid rate limits

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

// ─── CRC32 + ZIP builder ──────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ data[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const cds: Uint8Array[] = [];
  const offsets: number[] = [];
  let localOffset = 0;

  for (const file of files) {
    const nb = enc.encode(file.name);
    const crc = crc32(file.data);
    const sz = file.data.length;
    const local = new Uint8Array(30 + nb.length + sz);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, sz, true); lv.setUint32(22, sz, true);
    lv.setUint16(26, nb.length, true);
    local.set(nb, 30); local.set(file.data, 30 + nb.length);
    offsets.push(localOffset); locals.push(local); localOffset += local.length;

    const cd = new Uint8Array(46 + nb.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, sz, true); cv.setUint32(24, sz, true);
    cv.setUint16(28, nb.length, true); cv.setUint32(42, offsets[offsets.length - 1], true);
    cd.set(nb, 46); cds.push(cd);
  }

  const cdSize = cds.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, localOffset, true);

  const all = [...locals, ...cds, eocd];
  const total = all.reduce((s, p) => s + p.length, 0);
  const zip = new Uint8Array(total);
  let pos = 0;
  for (const p of all) { zip.set(p, pos); pos += p.length; }
  return zip;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AnimeDownloadButton({ animeId, animeName, totalEpisodes, className = "" }: Props) {
  const [phase, setPhase]           = useState<"idle" | "running" | "zipping" | "done" | "error">("idle");
  const [epStatuses, setEpStatuses] = useState<EpStatus[]>([]);
  const [overallPct, setOverallPct] = useState(0);
  const [statusMsg, setStatusMsg]   = useState("");
  const [showLog, setShowLog]       = useState(false);
  const [dlBytes, setDlBytes]       = useState(0);
  const [speed, setSpeed]           = useState("--");
  const [eta, setEta]               = useState("--");
  const [elapsed, setElapsed]       = useState("--");
  const [apiStats, setApiStats]     = useState([0, 0, 0, 0]);

  const abortRef   = useRef(false);
  const startRef   = useRef(0);
  const bytesRef   = useRef(0);
  const doneRef    = useRef(0);
  const totalRef   = useRef(0);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const safeName = animeName.replace(/[^a-z0-9\-_ ]/gi, "_");

  const updateEp = useCallback((idx: number, patch: Partial<EpStatus>) =>
    setEpStatuses(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e)), []);

  const onSegmentBytes = useCallback((bytes: number) => {
    bytesRef.current += bytes;
    setDlBytes(bytesRef.current);
  }, []);

  const startTicker = () => {
    timerRef.current = setInterval(() => {
      const sec = (Date.now() - startRef.current) / 1000;
      setElapsed(fmtTime(sec));
      if (sec > 1 && bytesRef.current > 0) {
        const bps = bytesRef.current / sec;
        setSpeed(`${fmtBytes(bps)}/s`);
        const done = doneRef.current;
        const total = totalRef.current;
        if (done > 0 && total > done) {
          const avgBytes = bytesRef.current / done;
          setEta(fmtTime(((total - done) * avgBytes) / bps));
        } else if (done === total && total > 0) {
          setEta("Done");
        }
      }
    }, 1000);
  };

  const stopTicker = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  /** Download all segments of one episode from one API */
  const fetchEpisodeBlob = async (
    episodeId: string,
    apiBase: string,
    epIdx: number,
    signal: { aborted: boolean }
  ): Promise<Uint8Array | null> => {

    // Find a working stream source
    let proxyUrl = "";
    for (const srv of ["hd-2", "hd-1", "vidstreaming", "megacloud"]) {
      for (const cat of ["sub", "dub"]) {
        if (signal.aborted) return null;
        try {
          const r = await fetch(`${apiBase}/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${srv}&category=${cat}`);
          if (!r.ok) continue;
          const d = await r.json();
          const raw = d?.data?.sources?.[0]?.url;
          if (raw) { proxyUrl = proxyify(apiBase, raw); break; }
        } catch { continue; }
      }
      if (proxyUrl) break;
    }
    if (!proxyUrl || signal.aborted) return null;

    const referer     = extractParam(proxyUrl, "referer") || "https://megacloud.blog/";
    const originalUrl = extractParam(proxyUrl, "url");

    const m3u8Res = await fetch(proxyUrl);
    if (!m3u8Res.ok || signal.aborted) return null;
    let m3u8Text = await m3u8Res.text();
    let mediaOriginal = originalUrl;

    // Master playlist → pick highest bandwidth stream
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
      if (!bestUri || signal.aborted) return null;
      mediaOriginal = resolveUrl(originalUrl, bestUri);
      const mediaRes = await fetch(proxyify(apiBase, mediaOriginal, referer));
      if (!mediaRes.ok || signal.aborted) return null;
      m3u8Text = await mediaRes.text();
    }

    // Parse all segment URLs
    const segments: string[] = m3u8Text
      .split("\n").map(l => l.trim())
      .filter(l => l && !l.startsWith("#"))
      .map(seg => proxyify(apiBase, resolveUrl(mediaOriginal, seg), referer));

    if (!segments.length || signal.aborted) return null;

    // ── OPTION 1: Parallel segment batches ──────────────────────────────────
    const chunks: (Uint8Array | null)[] = new Array(segments.length).fill(null);
    let segsDone = 0;

    for (let i = 0; i < segments.length; i += PARALLEL_SEGMENTS) {
      if (signal.aborted) return null;
      const batch = segments.slice(i, i + PARALLEL_SEGMENTS);

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
          onSegmentBytes(res.value.length);
        }
      }

      segsDone += batch.length;
      updateEp(epIdx, { progress: Math.round((segsDone / segments.length) * 100) });
      if (SEGMENT_DELAY_MS) await new Promise(r => setTimeout(r, SEGMENT_DELAY_MS));
    }

    if (signal.aborted) return null;

    const valid = chunks.filter((c): c is Uint8Array => c !== null);
    if (!valid.length) return null;
    const total = valid.reduce((s, c) => s + c.length, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of valid) { merged.set(c, off); off += c.length; }
    return merged;
  };

  const handleDownloadAll = async () => {
    setPhase("running");
    abortRef.current = false;
    bytesRef.current = 0;
    doneRef.current  = 0;
    setDlBytes(0); setSpeed("--"); setEta("--"); setElapsed("--");
    setApiStats([0, 0, 0, 0]); setOverallPct(0); setShowLog(true);
    startRef.current = Date.now();
    startTicker();

    try {
      setStatusMsg("Fetching episode list…");
      const epData   = await api.getEpisodes(animeId);
      const episodes = epData?.episodes || [];
      if (!episodes.length) { setStatusMsg("No episodes found."); setPhase("error"); stopTicker(); return; }

      totalRef.current = episodes.length;

      setEpStatuses(episodes.map(ep => ({
        num: ep.number || 0,
        title: ep.title || `Episode ${ep.number}`,
        state: "pending", progress: 0, apiIdx: 0, bytes: 0,
      })));

      const collected: ({ name: string; data: Uint8Array } | null)[] = new Array(episodes.length).fill(null);
      const signal = { aborted: false };

      // ── OPTION 2 + 7: Parallel episodes, each worker pinned to one API ─────
      const queue = { next: 0 };

      const worker = async (workerIdx: number) => {
        const apiIdx  = workerIdx % API_POOL.length;
        const apiBase = API_POOL[apiIdx];

        while (true) {
          if (abortRef.current || signal.aborted) break;
          const epIdx = queue.next++;
          if (epIdx >= episodes.length) break;

          const ep = episodes[epIdx];
          if (!ep.episodeId) {
            updateEp(epIdx, { state: "failed" });
            doneRef.current++;
            setOverallPct(Math.round((doneRef.current / episodes.length) * 100));
            continue;
          }

          setApiStats(prev => { const n = [...prev]; n[apiIdx]++; return n; });
          updateEp(epIdx, { state: "fetching", apiIdx });

          try {
            updateEp(epIdx, { state: "downloading", apiIdx });
            const blob = await fetchEpisodeBlob(ep.episodeId, apiBase, epIdx, signal);

            if (blob && blob.length > 0) {
              collected[epIdx] = {
                name: `${safeName}-EP${String(ep.number ?? epIdx + 1).padStart(3, "0")}.ts`,
                data: blob,
              };
              updateEp(epIdx, { state: "done", progress: 100 });
            } else {
              updateEp(epIdx, { state: "failed" });
            }
          } catch {
            updateEp(epIdx, { state: "failed" });
          }

          doneRef.current++;
          setOverallPct(Math.round((doneRef.current / episodes.length) * 100));
          setStatusMsg(`${doneRef.current}/${episodes.length} episodes done`);
        }
      };

      // Start all 4 workers simultaneously
      await Promise.all(Array.from({ length: PARALLEL_EPISODES }, (_, i) => worker(i)));

      if (abortRef.current) {
        stopTicker(); setPhase("idle"); setEpStatuses([]);
        setStatusMsg("Cancelled."); return;
      }

      // Build ZIP
      setPhase("zipping"); setStatusMsg("Building ZIP…");
      const validFiles = collected.filter((f): f is { name: string; data: Uint8Array } => f !== null);
      if (!validFiles.length) { setStatusMsg("No episodes downloaded."); setPhase("error"); stopTicker(); return; }

      const zip  = buildZip(validFiles);
      const blobUrl = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
      const a = Object.assign(document.createElement("a"), { href: blobUrl, download: `${safeName}-all-episodes.zip` });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

      stopTicker();
      const totalSec = (Date.now() - startRef.current) / 1000;
      setElapsed(fmtTime(totalSec)); setEta("Done");
      setStatusMsg(`✓ ${validFiles.length} episodes · ${fmtBytes(bytesRef.current)} · ${fmtTime(totalSec)}`);
      setPhase("done");

    } catch (err: any) {
      stopTicker();
      setStatusMsg(err?.message || "An error occurred.");
      setPhase("error");
    }
  };

  const handleCancel = () => { abortRef.current = true; setStatusMsg("Cancelling…"); };

  const handleReset = () => {
    stopTicker();
    setPhase("idle"); setEpStatuses([]); setOverallPct(0); setStatusMsg(""); setShowLog(false);
    setDlBytes(0); setSpeed("--"); setEta("--"); setElapsed("--"); setApiStats([0, 0, 0, 0]);
  };

  const dotColor = (s: EpStatus["state"]) =>
    ({ done: "bg-green-500", failed: "bg-red-500/80", downloading: "bg-primary", fetching: "bg-accent animate-pulse", pending: "bg-muted-foreground/20" })[s];

  const API_COLORS = ["text-cyan-400", "text-violet-400", "text-amber-400", "text-emerald-400"];
  const isRunning  = phase === "running" || phase === "zipping";

  return (
    <div className={`flex flex-col gap-3 ${className}`}>

      {/* ── Action buttons ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {phase === "idle" && (
          <button
            onClick={handleDownloadAll}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-accent text-sm font-semibold text-accent-foreground hover:opacity-90 active:scale-95 transition-all shadow-md"
          >
            <Package className="w-4 h-4" />
            Download All as ZIP{totalEpisodes ? ` (${totalEpisodes} eps)` : ""}
          </button>
        )}

        {isRunning && (
          <>
            <button disabled className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-accent text-sm font-semibold text-accent-foreground opacity-90 cursor-not-allowed">
              <Loader2 className="w-4 h-4 animate-spin" />
              {phase === "zipping" ? "Building ZIP…" : `${overallPct}% downloading`}
            </button>
            <button onClick={handleCancel} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-destructive/20 text-destructive text-sm font-medium hover:bg-destructive/30 transition-colors">
              <X className="w-4 h-4" /> Cancel
            </button>
          </>
        )}

        {(phase === "done" || phase === "error") && (
          <>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border ${phase === "done" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
              {phase === "done" ? <Download className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {statusMsg}
            </div>
            <button onClick={handleReset} className="px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">
              Reset
            </button>
          </>
        )}

        {epStatuses.length > 0 && (
          <button onClick={() => setShowLog(v => !v)} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-secondary/60 text-secondary-foreground text-xs hover:bg-secondary transition-colors">
            <ChevronDown className={`w-3 h-3 transition-transform ${showLog ? "rotate-180" : ""}`} />
            {showLog ? "Hide" : "Show"} Log
          </button>
        )}
      </div>

      {/* ── Live stats bar ── */}
      {isRunning && (
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-4 px-4 py-3 rounded-xl bg-card/60 border border-border text-xs">

          {/* Progress bar — full width on mobile */}
          <div className="col-span-2 sm:flex-1 sm:min-w-40">
            <div className="flex justify-between mb-1.5 font-medium">
              <span className="text-muted-foreground">Progress</span>
              <span className="tabular-nums">{overallPct}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${overallPct}%`, background: "var(--gradient-accent)" }}
              />
            </div>
          </div>

          {/* ETA */}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span>ETA <span className="text-foreground font-semibold">{eta}</span></span>
          </div>

          {/* Elapsed */}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-3.5 h-3.5 opacity-40 flex-shrink-0" />
            <span>Elapsed <span className="text-foreground font-semibold">{elapsed}</span></span>
          </div>

          {/* Speed */}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span className="text-foreground font-semibold">{speed}</span>
          </div>

          {/* Downloaded */}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Download className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-foreground font-semibold">{fmtBytes(dlBytes)}</span>
          </div>

          {/* API load balancer */}
          <div className="flex items-center gap-1.5 text-muted-foreground col-span-2 sm:col-span-1">
            <Wifi className="w-3.5 h-3.5 flex-shrink-0" />
            <div className="flex items-center gap-1">
              {API_POOL.map((_, i) => (
                <span
                  key={i}
                  title={`API ${i + 1}: ${apiStats[i]} eps`}
                  className={`${API_COLORS[i]} font-bold text-[11px] px-1.5 py-0.5 rounded bg-white/5`}
                >
                  {apiStats[i]}
                </span>
              ))}
              <span className="text-muted-foreground/50 text-[10px] ml-0.5">eps/api</span>
            </div>
          </div>

        </div>
      )}

      {/* ── Episode log ── */}
      {showLog && epStatuses.length > 0 && (
        <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-card/60">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">Episodes</span>
              <div className="flex items-center gap-1">
                {API_POOL.map((_, i) => (
                  <span key={i} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${API_COLORS[i]} bg-white/5`}>
                    API{i + 1}
                  </span>
                ))}
              </div>
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {epStatuses.filter(e => e.state === "done").length}/{epStatuses.length} done
              {epStatuses.filter(e => e.state === "failed").length > 0 &&
                <span className="text-red-400 ml-1">· {epStatuses.filter(e => e.state === "failed").length} failed</span>
              }
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
            {epStatuses.map((ep, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors ${ep.state === "downloading" ? "bg-primary/5" : ""}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor(ep.state)}`} />
                <span className="text-muted-foreground w-7 flex-shrink-0 tabular-nums font-mono">
                  {String(ep.num).padStart(2, "0")}
                </span>
                {(ep.state === "downloading" || ep.state === "fetching") && (
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${API_COLORS[ep.apiIdx]} bg-white/5`}>
                    API{ep.apiIdx + 1}
                  </span>
                )}
                <span className="text-foreground/80 flex-1 truncate">{ep.title}</span>
                <span className="flex-shrink-0 w-14 text-right tabular-nums">
                  {ep.state === "done"        && <span className="text-green-400">✓ Done</span>}
                  {ep.state === "failed"      && <span className="text-red-400/80">✗ Fail</span>}
                  {ep.state === "pending"     && <span className="text-muted-foreground/40">—</span>}
                  {ep.state === "fetching"    && <span className="text-accent animate-pulse">Finding</span>}
                  {ep.state === "downloading" && <span className="text-primary font-semibold">{ep.progress}%</span>}
                </span>
                {ep.state === "downloading" && (
                  <div className="w-10 h-1 bg-secondary rounded-full overflow-hidden flex-shrink-0">
                    <div className="h-full bg-primary rounded-full transition-all duration-150" style={{ width: `${ep.progress}%` }} />
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
