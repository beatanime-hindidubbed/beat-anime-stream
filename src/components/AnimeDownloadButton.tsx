import { useState, useRef, useCallback, useEffect } from "react";
import { Loader2, Package, X, ChevronDown, Download, Zap, Clock, Wifi, AlertCircle, Crown, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";

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
  retryCount: number;
}

const PARALLEL_EPISODES = 5;   // Max 5 simultaneous downloads
const PARALLEL_SEGMENTS  = 16; // 16 HLS segments at once per episode
const SEGMENT_DELAY_MS   = 8;
const MAX_BATCH_SIZE = 24;      // Max episodes per batch
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minute cooldown
const SPAM_THRESHOLD = 3;       // 3 bulk downloads in 1 minute = spam

// Quality presets
const QUALITY_PRESETS = [
  { label: "Auto (Best)", value: "auto" },
  { label: "1080p", value: "1080" },
  { label: "720p", value: "720" },
  { label: "480p", value: "480" },
  { label: "360p", value: "360" },
];

// Language options
const LANGUAGE_OPTIONS = [
  { label: "Sub", value: "sub" },
  { label: "Dub", value: "dub" },
  { label: "Both (try Sub first)", value: "both" },
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
  const { user, isPremium } = useSupabaseAuth();
  const { settings } = useSiteSettings();
  const [phase, setPhase]           = useState<"idle" | "running" | "zipping" | "done" | "error">("idle");
  const [epStatuses, setEpStatuses] = useState<EpStatus[]>([]);
  const [overallPct, setOverallPct] = useState(0);
  const [statusMsg, setStatusMsg]   = useState("");
  const [showLog, setShowLog]       = useState(false);
  const [dlBytes, setDlBytes]       = useState(0);
  const [speed, setSpeed]           = useState("--");
  const [eta, setEta]               = useState("--");
  const [elapsed, setElapsed]       = useState("--");
  const [apiStats, setApiStats]     = useState<number[]>([]);
  const [activeDownloads, setActiveDownloads] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [quality, setQuality]       = useState("auto");
  const [language, setLanguage]     = useState("sub");
  const [showBatchSelect, setShowBatchSelect] = useState(false);
  const [customStart, setCustomStart] = useState(1);
  const [customEnd, setCustomEnd]   = useState(24);
  const [apiPool, setApiPool]       = useState<string[]>([]);

  const abortRef   = useRef(false);
  const startRef   = useRef(0);
  const bytesRef   = useRef(0);
  const doneRef    = useRef(0);
  const totalRef   = useRef(0);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const safeName = animeName.replace(/[^a-z0-9\-_ ]/gi, "_");

  // Load API pool from settings
  useEffect(() => {
    const pool = settings.apiPool || [
      "https://beat-anime-api.onrender.com/api/v1",
      "https://beat-anime-api-2.onrender.com/api/v1",
      "https://beat-anime-api-3.onrender.com/api/v1",
      "https://beat-anime-api-4.onrender.com/api/v1",
    ];
    setApiPool(pool);
    setApiStats(new Array(pool.length).fill(0));
  }, [settings.apiPool]);

  // Check access permissions
  const canDownload = () => {
    if (settings.bulkDownloadAccess === "all") return true;
    if (settings.bulkDownloadAccess === "logged-in" && user) return true;
    if (settings.bulkDownloadAccess === "premium" && isPremium) return true;
    return false;
  };

  // Spam detection
  const checkSpam = () => {
    const now = Date.now();
    const key = "bulk_dl_history";
    const history: number[] = JSON.parse(localStorage.getItem(key) || "[]");
    const recent = history.filter(t => now - t < 60000); // Last minute
    
    if (recent.length >= SPAM_THRESHOLD) {
      const cooldown = now + COOLDOWN_MS;
      setCooldownUntil(cooldown);
      localStorage.setItem("bulk_dl_cooldown", String(cooldown));
      return true;
    }
    
    recent.push(now);
    localStorage.setItem(key, JSON.stringify(recent));
    return false;
  };

  // Check cooldown
  useEffect(() => {
    const saved = localStorage.getItem("bulk_dl_cooldown");
    if (saved) {
      const time = parseInt(saved);
      if (Date.now() < time) setCooldownUntil(time);
    }
  }, []);

  useEffect(() => {
    if (cooldownUntil > Date.now()) {
      const timer = setInterval(() => {
        if (Date.now() >= cooldownUntil) {
          setCooldownUntil(0);
          clearInterval(timer);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cooldownUntil]);

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

  /** Download episode with quality filtering and retry logic */
  const fetchEpisodeBlob = async (
    episodeId: string,
    apiBase: string,
    epIdx: number,
    signal: { aborted: boolean }
  ): Promise<Uint8Array | null> => {

    // Find a working stream source - try preferred language first
    let proxyUrl = "";
    const preferredLang = language === "both" ? "sub" : language;
    const fallbackLang = preferredLang === "sub" ? "dub" : "sub";
    const languagesToTry = language === "both" ? [preferredLang, fallbackLang] : [preferredLang];
    
    for (const srv of ["hd-2", "hd-1", "vidstreaming", "megacloud"]) {
      for (const cat of languagesToTry) {
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

    // Master playlist → pick quality
    if (m3u8Text.includes("#EXT-X-STREAM-INF")) {
      const lines = m3u8Text.split("\n").map(l => l.trim());
      let bestBW = -1, bestUri = "";
      
      if (quality === "auto") {
        // Pick highest bandwidth
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
            const bw = parseInt(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] || "0");
            const uri = lines[i + 1];
            if (uri && !uri.startsWith("#") && bw > bestBW) { bestBW = bw; bestUri = uri; }
          }
        }
      } else {
        // Pick specific quality
        const targetRes = quality;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
            const resolution = lines[i].match(/RESOLUTION=\d+x(\d+)/)?.[1];
            const uri = lines[i + 1];
            if (uri && !uri.startsWith("#") && resolution === targetRes) {
              bestUri = uri;
              break;
            }
          }
        }
        // Fallback to best if quality not found
        if (!bestUri) {
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
              const bw = parseInt(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] || "0");
              const uri = lines[i + 1];
              if (uri && !uri.startsWith("#") && bw > bestBW) { bestBW = bw; bestUri = uri; }
            }
          }
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

    // Download segments in parallel batches
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

  const handleDownloadBatch = async (startEp: number, endEp: number) => {
    if (!canDownload()) {
      setStatusMsg(!user ? "Login required" : !isPremium ? "Premium required" : "Access denied");
      return;
    }

    if (activeDownloads >= PARALLEL_EPISODES) {
      setStatusMsg(`Max ${PARALLEL_EPISODES} downloads at once`);
      return;
    }

    if (cooldownUntil > Date.now()) {
      const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
      setStatusMsg(`Cooldown: ${fmtTime(remaining)} remaining`);
      return;
    }

    if (checkSpam()) {
      setStatusMsg("Too many requests. 5 min cooldown.");
      return;
    }

    setPhase("running");
    setActiveDownloads(prev => prev + 1);
    abortRef.current = false;
    bytesRef.current = 0;
    doneRef.current  = 0;
    setDlBytes(0); setSpeed("--"); setEta("--"); setElapsed("--");
    setApiStats(new Array(apiPool.length).fill(0));
    setOverallPct(0); setShowLog(true);
    startRef.current = Date.now();
    startTicker();

    try {
      setStatusMsg("Fetching episode list…");
      const epData   = await api.getEpisodes(animeId);
      const allEpisodes = epData?.episodes || [];
      
      // Filter to requested range
      const episodes = allEpisodes.filter(ep => 
        (ep.number || 0) >= startEp && (ep.number || 0) <= endEp
      );

      if (!episodes.length) { 
        setStatusMsg("No episodes in range."); 
        setPhase("error"); 
        stopTicker(); 
        setActiveDownloads(prev => prev - 1);
        return; 
      }

      totalRef.current = episodes.length;

      setEpStatuses(episodes.map(ep => ({
        num: ep.number || 0,
        title: ep.title || `Episode ${ep.number}`,
        state: "pending", progress: 0, apiIdx: 0, bytes: 0, retryCount: 0,
      })));

      const collected: ({ name: string; data: Uint8Array } | null)[] = new Array(episodes.length).fill(null);
      const signal = { aborted: false };

      // Smart API load balancing
      const apiLoads = new Array(apiPool.length).fill(0);
      const queue = { next: 0 };

      const worker = async (workerIdx: number) => {
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

          // Pick least loaded API
          const apiIdx = apiLoads.indexOf(Math.min(...apiLoads));
          const apiBase = apiPool[apiIdx];
          apiLoads[apiIdx]++;

          setApiStats(prev => { const n = [...prev]; n[apiIdx]++; return n; });
          updateEp(epIdx, { state: "fetching", apiIdx });

          let success = false;
          let retries = 0;
          const maxRetries = 2;

          while (!success && retries <= maxRetries && !signal.aborted) {
            try {
              updateEp(epIdx, { state: "downloading", apiIdx, retryCount: retries });
              const blob = await fetchEpisodeBlob(ep.episodeId, apiBase, epIdx, signal);

              if (blob && blob.length > 0) {
                collected[epIdx] = {
                  name: `${safeName}-EP${String(ep.number ?? epIdx + 1).padStart(3, "0")}.ts`,
                  data: blob,
                };
                updateEp(epIdx, { state: "done", progress: 100 });
                success = true;
              } else if (retries < maxRetries) {
                retries++;
                updateEp(epIdx, { retryCount: retries });
                await new Promise(r => setTimeout(r, 1000));
              } else {
                updateEp(epIdx, { state: "failed" });
              }
            } catch {
              if (retries < maxRetries) {
                retries++;
                updateEp(epIdx, { retryCount: retries });
                await new Promise(r => setTimeout(r, 1000));
              } else {
                updateEp(epIdx, { state: "failed" });
              }
            }
          }

          apiLoads[apiIdx]--;
          doneRef.current++;
          setOverallPct(Math.round((doneRef.current / episodes.length) * 100));
          setStatusMsg(`${doneRef.current}/${episodes.length} episodes done`);
        }
      };

      // Start workers (max PARALLEL_EPISODES)
      const workerCount = Math.min(PARALLEL_EPISODES, episodes.length);
      await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i)));

      if (abortRef.current) {
        stopTicker(); 
        setPhase("idle"); 
        setEpStatuses([]);
        setStatusMsg("Cancelled."); 
        setActiveDownloads(prev => prev - 1);
        return;
      }

      // Build ZIP
      setPhase("zipping"); setStatusMsg("Building ZIP…");
      const validFiles = collected.filter((f): f is { name: string; data: Uint8Array } => f !== null);
      if (!validFiles.length) { 
        setStatusMsg("No episodes downloaded."); 
        setPhase("error"); 
        stopTicker(); 
        setActiveDownloads(prev => prev - 1);
        return; 
      }

      const zip  = buildZip(validFiles);
      const blobUrl = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
      const a = Object.assign(document.createElement("a"), { 
        href: blobUrl, 
        download: `${safeName}-EP${startEp}-${endEp}-${language}-${quality}.zip` 
      });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

      stopTicker();
      const totalSec = (Date.now() - startRef.current) / 1000;
      setElapsed(fmtTime(totalSec)); setEta("Done");
      setStatusMsg(`✓ ${validFiles.length} episodes · ${fmtBytes(bytesRef.current)} · ${fmtTime(totalSec)}`);
      setPhase("done");
      setActiveDownloads(prev => prev - 1);

    } catch (err: any) {
      stopTicker();
      setStatusMsg(err?.message || "An error occurred.");
      setPhase("error");
      setActiveDownloads(prev => prev - 1);
    }
  };

  const retryFailed = async (epIdx: number) => {
    const ep = epStatuses[epIdx];
    if (!ep || ep.state !== "failed") return;
    
    updateEp(epIdx, { state: "fetching", retryCount: 0 });
    // Implement retry logic here
  };

  const handleCancel = () => { abortRef.current = true; setStatusMsg("Cancelling…"); };

  const handleReset = () => {
    stopTicker();
    setPhase("idle"); setEpStatuses([]); setOverallPct(0); setStatusMsg(""); setShowLog(false);
    setDlBytes(0); setSpeed("--"); setEta("--"); setElapsed("--"); 
    setApiStats(new Array(apiPool.length).fill(0));
  };

  const dotColor = (s: EpStatus["state"]) =>
    ({ done: "bg-green-500", failed: "bg-red-500/80", downloading: "bg-primary", fetching: "bg-accent animate-pulse", pending: "bg-muted-foreground/20" })[s];

  const API_COLORS = ["text-cyan-400", "text-violet-400", "text-amber-400", "text-emerald-400", "text-rose-400", "text-blue-400"];
  const isRunning  = phase === "running" || phase === "zipping";

  // Generate batch options
  const totalEps = totalEpisodes || 0;
  const batches = [];
  for (let i = 1; i <= totalEps; i += 30) {
    const end = Math.min(i + 29, totalEps);
    batches.push({ start: i, end, label: `Episodes ${i}-${end}` });
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>

      {/* ── Access check banner ── */}
      {!canDownload() && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-accent/10 border border-accent/20 text-accent">
          {!user ? <Lock className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
          <span className="text-sm font-medium">
            {!user ? "Login to download" : !isPremium ? "Premium required for bulk download" : "Access restricted"}
          </span>
        </div>
      )}

      {/* ── Cooldown banner ── */}
      {cooldownUntil > Date.now() && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm font-medium">
            Cooldown: {fmtTime((cooldownUntil - Date.now()) / 1000)} remaining
          </span>
        </div>
      )}

      {/* ── Action buttons ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {phase === "idle" && canDownload() && cooldownUntil <= Date.now() && (
          <>
            {/* Quality selector */}
            <select 
              value={quality} 
              onChange={e => setQuality(e.target.value)}
              className="h-10 px-3 rounded-xl bg-secondary text-secondary-foreground text-sm border border-border"
            >
              {QUALITY_PRESETS.map(q => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>

            {/* Language selector */}
            <select 
              value={language} 
              onChange={e => setLanguage(e.target.value)}
              className="h-10 px-3 rounded-xl bg-secondary text-secondary-foreground text-sm border border-border"
            >
              {LANGUAGE_OPTIONS.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>

            {/* Batch selection toggle */}
            <button
              onClick={() => setShowBatchSelect(!showBatchSelect)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
            >
              <Package className="w-4 h-4" />
              {showBatchSelect ? "Hide Options" : "Select Episodes"}
            </button>
          </>
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
            <div className="px-3 py-2 rounded-xl bg-card/60 border border-border text-xs text-muted-foreground">
              {activeDownloads}/{PARALLEL_EPISODES} active
            </div>
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

      {/* ── Batch selection ── */}
      {showBatchSelect && phase === "idle" && (
        <div className="p-4 rounded-xl bg-card/60 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Select Episode Range</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="px-2 py-1 rounded bg-primary/10 text-primary font-medium">
                {QUALITY_PRESETS.find(q => q.value === quality)?.label}
              </span>
              <span className="px-2 py-1 rounded bg-accent/10 text-accent font-medium">
                {LANGUAGE_OPTIONS.find(l => l.value === language)?.label}
              </span>
            </div>
          </div>
          
          {/* Preset batches */}
          {batches.length > 1 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {batches.map(batch => (
                <button
                  key={batch.start}
                  onClick={() => handleDownloadBatch(batch.start, batch.end)}
                  className="px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium transition-colors"
                >
                  {batch.label}
                </button>
              ))}
            </div>
          )}

          {/* Custom range */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              min={1}
              max={totalEps}
              value={customStart}
              onChange={e => setCustomStart(Math.max(1, Math.min(totalEps, parseInt(e.target.value) || 1)))}
              className="w-20 h-9 px-2 rounded-lg bg-secondary text-foreground text-sm border border-border"
              placeholder="From"
            />
            <span className="text-muted-foreground text-sm">to</span>
            <input
              type="number"
              min={customStart}
              max={Math.min(customStart + MAX_BATCH_SIZE - 1, totalEps)}
              value={customEnd}
              onChange={e => setCustomEnd(Math.max(customStart, Math.min(customStart + MAX_BATCH_SIZE - 1, parseInt(e.target.value) || customStart)))}
              className="w-20 h-9 px-2 rounded-lg bg-secondary text-foreground text-sm border border-border"
              placeholder="To"
            />
            <button
              onClick={() => handleDownloadBatch(customStart, customEnd)}
              disabled={customEnd - customStart + 1 > MAX_BATCH_SIZE}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-accent text-sm font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Download ({customEnd - customStart + 1} eps)
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Max {MAX_BATCH_SIZE} episodes per batch
          </p>
        </div>
      )}

      {/* ── Live stats bar ── */}
      {isRunning && (
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-4 px-4 py-3 rounded-xl bg-card/60 border border-border text-xs">

          {/* Progress bar */}
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

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span>ETA <span className="text-foreground font-semibold">{eta}</span></span>
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-3.5 h-3.5 opacity-40 flex-shrink-0" />
            <span>Elapsed <span className="text-foreground font-semibold">{elapsed}</span></span>
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span className="text-foreground font-semibold">{speed}</span>
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Download className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-foreground font-semibold">{fmtBytes(dlBytes)}</span>
          </div>

          {/* API load balancer */}
          <div className="flex items-center gap-1.5 text-muted-foreground col-span-2 sm:col-span-1">
            <Wifi className="w-3.5 h-3.5 flex-shrink-0" />
            <div className="flex items-center gap-1 flex-wrap">
              {apiStats.map((count, i) => (
                <span
                  key={i}
                  title={`API ${i + 1}: ${count} eps`}
                  className={`${API_COLORS[i % API_COLORS.length]} font-bold text-[11px] px-1.5 py-0.5 rounded bg-white/5`}
                >
                  {count}
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
                {apiPool.slice(0, 6).map((_, i) => (
                  <span key={i} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${API_COLORS[i % API_COLORS.length]} bg-white/5`}>
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
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${API_COLORS[ep.apiIdx % API_COLORS.length]} bg-white/5`}>
                    API{ep.apiIdx + 1}
                  </span>
                )}
                <span className="text-foreground/80 flex-1 truncate">{ep.title}</span>
                {ep.retryCount > 0 && (
                  <span className="text-[10px] text-amber-400">Retry {ep.retryCount}</span>
                )}
                <span className="flex-shrink-0 w-14 text-right tabular-nums">
                  {ep.state === "done"        && <span className="text-green-400">✓ Done</span>}
                  {ep.state === "failed"      && (
                    <button
                      onClick={() => retryFailed(i)}
                      className="text-red-400/80 hover:text-red-400 text-[10px]"
                    >
                      ↻ Retry
                    </button>
                  )}
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
