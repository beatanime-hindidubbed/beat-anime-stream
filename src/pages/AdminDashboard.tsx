import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useSiteSettings, ThemeType, PlayerTheme, FontStyle, CustomThemeColors, TextEffect, ParticleEffect, SandboxLink } from "@/hooks/useSiteSettings";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  BarChart3, Image, Activity, LogOut, Plus, Trash2,
  ToggleLeft, ToggleRight, Save, Loader2, CheckCircle, XCircle, Globe,
  Users, Shield, UserPlus, UserMinus, Palette, Type, FileText,
  Crown, Copy, Clock, Zap, Server, RefreshCw, MessageCircle, Ban, VolumeX,
  AlertTriangle, MonitorPlay, Link2, ScrollText, EyeOff, Sparkles, ExternalLink
} from "lucide-react";

interface Ad {
  id: string; name: string; image_url: string | null; link_url: string;
  placement: string; size: string; is_active: boolean; sandbox: boolean;
}

interface UserRole {
  id: string; user_id: string; role: string; username?: string; premium_until?: string;
}

interface PremiumCode {
  id: string; code: string; created_by: string; expires_at: string;
  max_uses: number; current_uses: number; is_active: boolean; created_at: string;
}

const API_ENDPOINTS = [
  { name: "Home", url: "/hianime/home" },
  { name: "Search", url: "/hianime/search?q=naruto" },
  { name: "Schedule", url: "/hianime/schedule?date=2025-01-01" },
  { name: "Anime Info", url: "/hianime/anime/one-piece-100" },
  { name: "Episodes", url: "/hianime/anime/one-piece-100/episodes" },
  { name: "Category", url: "/hianime/category/most-popular" },
  { name: "Genre", url: "/hianime/genre/action" },
  { name: "Suggestions", url: "/hianime/search/suggestion?q=one" },
];

const PLACEMENTS = ["banner-top", "sidebar", "in-feed", "footer", "popup"];
const SIZES = ["banner", "square", "leaderboard", "skyscraper"];
const ROLES = ["admin", "moderator", "user"] as const;

const THEMES: { key: ThemeType; label: string; colors: string[]; tag?: string }[] = [
  { key: "netflix", label: "Netflix", colors: ["#e50914", "#f5f5f5"], tag: "🎬 Netflix" },
  { key: "classic", label: "Classic", colors: ["#00e5c8", "#ff4d9e"] },
  { key: "cyberpunk", label: "Cyberpunk", colors: ["#ffff00", "#ff00ff"], tag: "Grid" },
  { key: "neon", label: "Neon", colors: ["#00ffaa", "#aa00ff"], tag: "Glow" },
  { key: "sakura", label: "Sakura", colors: ["#ff6b9d", "#ff9a4d"], tag: "Petals" },
  { key: "minimal", label: "Minimal", colors: ["#d0d0d0", "#909090"] },
  { key: "midnight", label: "Midnight", colors: ["#3b82f6", "#d4a030"], tag: "Stars" },
  { key: "ocean", label: "Ocean", colors: ["#06b6d4", "#34d399"], tag: "Waves" },
  { key: "sunset", label: "Sunset", colors: ["#f97316", "#eab308"], tag: "Gradient" },
  { key: "forest", label: "Forest", colors: ["#22c55e", "#84cc16"] },
  { key: "lavender", label: "Lavender", colors: ["#a78bfa", "#60a5fa"] },
  { key: "crimson", label: "Crimson", colors: ["#ef4444", "#22d3ee"] },
  { key: "arctic", label: "Arctic", colors: ["#7dd3fc", "#5eead4"], tag: "Snow" },
  { key: "ember", label: "Ember", colors: ["#f59e0b", "#ef4444"] },
  { key: "anime-dark", label: "Anime Dark", colors: ["#9333ea", "#e11d48"], tag: "✦ Anime" },
  { key: "anime-pastel", label: "Anime Pastel", colors: ["#ec4899", "#22d3ee"], tag: "✦ Anime" },
  { key: "anime-retro", label: "Anime Retro", colors: ["#ea580c", "#14b8a6"], tag: "✦ Anime" },
  { key: "dragon", label: "Dragon", colors: ["#dc2626", "#eab308"], tag: "🔥 Fire" },
  { key: "galaxy", label: "Galaxy", colors: ["#8b5cf6", "#3b82f6"], tag: "✨ Stars" },
  { key: "bloodmoon", label: "Blood Moon", colors: ["#991b1b", "#b45309"], tag: "🌙" },
  { key: "phantom", label: "Phantom", colors: ["#6366f1", "#c026d3"], tag: "👻" },
  { key: "jade", label: "Jade", colors: ["#059669", "#16a34a"] },
  { key: "violet-storm", label: "Violet Storm", colors: ["#a855f7", "#06b6d4"], tag: "⚡" },
  { key: "golden-hour", label: "Golden Hour", colors: ["#ca8a04", "#ea580c"], tag: "☀️" },
  { key: "custom", label: "Custom", colors: ["#888", "#ccc"], tag: "🎨 Builder" },
];

const PLAYER_THEMES: { key: PlayerTheme; label: string; desc: string }[] = [
  { key: "default", label: "Default", desc: "Standard controls with red accent" },
  { key: "minimal", label: "Minimal", desc: "Clean, thin controls, auto-hide" },
  { key: "cinema", label: "Cinema", desc: "Dark overlay, large play button" },
  { key: "retro", label: "Retro", desc: "VHS style with scan lines" },
  { key: "glassmorphism", label: "Glass", desc: "Frosted glass controls" },
];

const FONT_STYLES: { key: FontStyle; label: string; desc: string; preview: string }[] = [
  { key: "default", label: "Default", desc: "Outfit + Space Grotesk", preview: "Aa" },
  { key: "elegant", label: "Elegant", desc: "Georgia + Palatino (Serif)", preview: "Aa" },
  { key: "playful", label: "Playful", desc: "Comic Neue (Fun)", preview: "Aa" },
  { key: "monospace", label: "Monospace", desc: "JetBrains Mono (Code)", preview: "Aa" },
  { key: "cinematic", label: "Cinematic", desc: "Bebas Neue + Inter", preview: "Aa" },
];

type TabKey = "stats" | "branding" | "effects" | "sandbox" | "ads" | "api" | "users" | "policy" | "premium" | "chat" | "player" | "banlist" | "logs";

export default function AdminDashboard() {
  const { user, isAdmin, loading: authLoading, logout } = useSupabaseAuth();
  const { settings, updateSettings } = useSiteSettings();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("stats");
  const [ads, setAds] = useState<Ad[]>([]);
  const [apiHealth, setApiHealth] = useState<Record<string, { status: "ok" | "fail" | "loading"; ms?: number }>>({});
  const [saving, setSaving] = useState(false);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminRole, setNewAdminRole] = useState<string>("moderator");
  const [addingUser, setAddingUser] = useState(false);
  const [userError, setUserError] = useState("");
  const [brandingSaved, setBrandingSaved] = useState(false);

  // Branding
  const [brandName, setBrandName] = useState(settings.siteName);
  const [brandIcon, setBrandIcon] = useState(settings.siteIcon);
  const [tgChannel, setTgChannel] = useState(settings.telegramChannel);
  const [tgGroup, setTgGroup] = useState(settings.telegramGroup);
  const [errorGif, setErrorGif] = useState(settings.errorGif);
  const [loadingGif, setLoadingGif] = useState(settings.loadingGif);
  const [dmca, setDmca] = useState(settings.dmcaContent);
  const [privacy, setPrivacy] = useState(settings.privacyContent);
  const [terms, setTerms] = useState(settings.termsContent);

  // Premium
  const [premiumCodes, setPremiumCodes] = useState<PremiumCode[]>([]);
  const [newCodeExpiry, setNewCodeExpiry] = useState("7");
  const [newCodeMaxUses, setNewCodeMaxUses] = useState("1");
  const [generatingCode, setGeneratingCode] = useState(false);

  // API endpoints management
  const [apiEndpoints, setApiEndpoints] = useState<string[]>(settings.apiEndpoints || []);
  const [newApiUrl, setNewApiUrl] = useState("");

  // Chat admin state
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatBans, setChatBans] = useState<any[]>([]);
  const [chatReports, setChatReports] = useState<any[]>([]);

  // Extra features
  const [faviconUrl, setFaviconUrl] = useState(settings.faviconUrl || "");
  const [bannedAnimes, setBannedAnimes] = useState<string[]>(settings.bannedAnimes || []);
  const [newBanId, setNewBanId] = useState("");
  const [adminLogs, setAdminLogs] = useState<any[]>([]);
  
  // Custom theme builder
  const [customPrimary, setCustomPrimary] = useState(settings.customThemeColors?.primary || "175 80% 50%");
  const [customAccent, setCustomAccent] = useState(settings.customThemeColors?.accent || "330 70% 55%");
  const [customBg, setCustomBg] = useState(settings.customThemeColors?.background || "220 20% 7%");
  const [customCard, setCustomCard] = useState(settings.customThemeColors?.card || "220 18% 10%");
  const [customBorder, setCustomBorder] = useState(settings.customThemeColors?.border || "220 15% 18%");

  // Sandbox links
  const [sandboxLinks, setSandboxLinks] = useState<SandboxLink[]>(settings.sandboxLinks || []);
  const [newSandboxUrl, setNewSandboxUrl] = useState("");
  const [newSandboxLabel, setNewSandboxLabel] = useState("");
  const [newSandboxCountdown, setNewSandboxCountdown] = useState("5");

  useEffect(() => {
    setBrandName(settings.siteName); setBrandIcon(settings.siteIcon);
    setTgChannel(settings.telegramChannel); setTgGroup(settings.telegramGroup);
    setErrorGif(settings.errorGif); setLoadingGif(settings.loadingGif);
    setDmca(settings.dmcaContent); setPrivacy(settings.privacyContent);
    setTerms(settings.termsContent);
    setApiEndpoints(settings.apiEndpoints || ["https://beat-anime-api.onrender.com/api/v1"]);
    setFaviconUrl(settings.faviconUrl || "");
    setBannedAnimes(settings.bannedAnimes || []);
  }, [settings]);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/admin", { replace: true });
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    supabase.from("ads").select("*").then(({ data }) => { if (data) setAds(data); });
  }, []);

  useEffect(() => { if (tab === "users") loadUserRoles(); }, [tab]);
  useEffect(() => { if (tab === "premium") loadPremiumCodes(); }, [tab]);
  useEffect(() => {
    if (tab === "chat") {
      supabase.from("chat_messages").select("*").eq("type", "report").order("created_at", { ascending: false }).limit(50)
        .then(({ data }) => { if (data) setChatReports(data); });
      supabase.from("chat_messages").select("*").eq("type", "group").order("created_at", { ascending: false }).limit(50)
        .then(({ data }) => { if (data) setChatMessages(data); });
      supabase.from("chat_bans").select("*").order("created_at", { ascending: false })
        .then(({ data }) => { if (data) setChatBans(data); });
    }
  }, [tab]);
  useEffect(() => {
    if (tab === "logs") {
      supabase.from("admin_logs").select("*").order("created_at", { ascending: false }).limit(100)
        .then(({ data }) => { if (data) setAdminLogs(data); });
    }
  }, [tab]);

  const loadUserRoles = async () => {
    const { data: roles } = await supabase.from("user_roles").select("*");
    if (!roles) return;
    const enriched: UserRole[] = [];
    for (const r of roles) {
      const { data: profile } = await supabase.from("profiles").select("username, premium_until").eq("user_id", r.user_id).single();
      enriched.push({ ...r, username: profile?.username || "Unknown", premium_until: (profile as any)?.premium_until || null });
    }
    setUserRoles(enriched);
  };

  const addUserRole = async () => {
    if (!newAdminEmail.trim()) return;
    setAddingUser(true); setUserError("");
    try {
      const { data: profiles } = await supabase.from("profiles").select("user_id, username").ilike("username", newAdminEmail.trim());
      if (!profiles || profiles.length === 0) { setUserError("User not found."); setAddingUser(false); return; }
      const { error } = await supabase.from("user_roles").insert({ user_id: profiles[0].user_id, role: newAdminRole as any });
      if (error) { setUserError(error.code === "23505" ? "User already has this role." : error.message); }
      else { setNewAdminEmail(""); loadUserRoles(); }
    } catch { setUserError("Failed to add role."); }
    setAddingUser(false);
  };

  const removeUserRole = async (id: string) => {
    await supabase.from("user_roles").delete().eq("id", id);
    setUserRoles(prev => prev.filter(r => r.id !== id));
  };

  // ── API Health with response time ──
  const checkApis = async () => {
    const results: Record<string, { status: "ok" | "fail" | "loading"; ms?: number }> = {};
    const endpoints = apiEndpoints.length > 0 ? apiEndpoints : ["https://beat-anime-api.onrender.com/api/v1"];

    // Check each endpoint with each API route
    for (const base of endpoints) {
      for (const ep of API_ENDPOINTS) {
        const key = `${base}|${ep.name}`;
        results[key] = { status: "loading" };
      }
    }
    setApiHealth({ ...results });

    for (const base of endpoints) {
      for (const ep of API_ENDPOINTS) {
        const key = `${base}|${ep.name}`;
        try {
          const start = performance.now();
          const res = await fetch(`${base}${ep.url}`, { signal: AbortSignal.timeout(15000) });
          const ms = Math.round(performance.now() - start);
          results[key] = { status: res.ok ? "ok" : "fail", ms };
        } catch {
          results[key] = { status: "fail" };
        }
        setApiHealth({ ...results });
      }
    }
  };

  useEffect(() => { if (tab === "api") checkApis(); }, [tab]);

  // ── Premium codes ──
  const loadPremiumCodes = async () => {
    const { data } = await supabase.from("premium_codes").select("*").order("created_at", { ascending: false });
    if (data) setPremiumCodes(data as PremiumCode[]);
  };

  const generateCode = async () => {
    if (!user) return;
    setGeneratingCode(true);
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];

    const expiryDays = parseInt(newCodeExpiry) || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    await supabase.from("premium_codes").insert({
      code,
      created_by: user.id,
      expires_at: expiresAt.toISOString(),
      max_uses: parseInt(newCodeMaxUses) || 1,
    });

    loadPremiumCodes();
    setGeneratingCode(false);
  };

  const deleteCode = async (id: string) => {
    await supabase.from("premium_codes").delete().eq("id", id);
    setPremiumCodes(prev => prev.filter(c => c.id !== id));
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  // ── Ads ──
  const saveAd = async (ad: Ad) => {
    setSaving(true);
    const { id, ...rest } = ad;
    if (id.startsWith("new-")) {
      const { data } = await supabase.from("ads").insert(rest).select().single();
      if (data) setAds(prev => prev.map(a => a.id === id ? data : a));
    } else {
      await supabase.from("ads").update(rest).eq("id", id);
    }
    setSaving(false);
  };

  const deleteAd = async (id: string) => {
    if (id.startsWith("new-")) { setAds(prev => prev.filter(a => a.id !== id)); return; }
    await supabase.from("ads").delete().eq("id", id);
    setAds(prev => prev.filter(a => a.id !== id));
  };

  const saveBranding = async () => {
    setSaving(true);
    await updateSettings({ siteName: brandName, siteIcon: brandIcon, telegramChannel: tgChannel, telegramGroup: tgGroup, errorGif, loadingGif });
    setSaving(false); setBrandingSaved(true); setTimeout(() => setBrandingSaved(false), 2000);
  };

  const savePolicy = async () => {
    setSaving(true);
    await updateSettings({ dmcaContent: dmca, privacyContent: privacy, termsContent: terms });
    setSaving(false); setBrandingSaved(true); setTimeout(() => setBrandingSaved(false), 2000);
  };

  const saveApiEndpoints = async () => {
    setSaving(true);
    await updateSettings({ apiEndpoints });
    setSaving(false); setBrandingSaved(true); setTimeout(() => setBrandingSaved(false), 2000);
  };

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const tabs = [
    { key: "stats" as const, label: "Stats", icon: BarChart3 },
    { key: "branding" as const, label: "Branding", icon: Palette },
    { key: "player" as const, label: "Player", icon: MonitorPlay },
    { key: "premium" as const, label: "Premium", icon: Crown },
    { key: "chat" as const, label: "Chat", icon: MessageCircle },
    { key: "banlist" as const, label: "Ban List", icon: EyeOff },
    { key: "policy" as const, label: "Policies", icon: FileText },
    { key: "ads" as const, label: "Ads", icon: Image },
    { key: "users" as const, label: "Users", icon: Users },
    { key: "api" as const, label: "API", icon: Activity },
    { key: "logs" as const, label: "Logs", icon: ScrollText },
  ];

  const logAction = async (action: string, details?: string, targetId?: string) => {
    if (!user) return;
    await supabase.from("admin_logs").insert({ admin_id: user.id, action, details, target_id: targetId });
  };

  const saveFavicon = async () => {
    setSaving(true);
    await updateSettings({ faviconUrl });
    await logAction("update_favicon", faviconUrl);
    setSaving(false); setBrandingSaved(true); setTimeout(() => setBrandingSaved(false), 2000);
  };

  const addBannedAnime = async () => {
    if (!newBanId.trim()) return;
    const next = [...bannedAnimes, newBanId.trim()];
    setBannedAnimes(next);
    await updateSettings({ bannedAnimes: next });
    await logAction("ban_anime", newBanId.trim());
    setNewBanId("");
  };

  const removeBannedAnime = async (id: string) => {
    const next = bannedAnimes.filter(a => a !== id);
    setBannedAnimes(next);
    await updateSettings({ bannedAnimes: next });
    await logAction("unban_anime", id);
  };




  const adminDeleteMsg = async (id: string) => {
    await supabase.from("chat_messages").update({ is_deleted: true, content: "[deleted by admin]" }).eq("id", id);
    setChatMessages(prev => prev.map(m => m.id === id ? { ...m, is_deleted: true } : m));
    setChatReports(prev => prev.map(m => m.id === id ? { ...m, is_deleted: true } : m));
  };

  const adminBanUser = async (userId: string, type: "mute" | "ban") => {
    if (!user) return;
    const expires = new Date(); expires.setDate(expires.getDate() + 7);
    await supabase.from("chat_bans").insert({ user_id: userId, banned_by: user.id, ban_type: type, reason: "Admin action", expires_at: expires.toISOString() });
    supabase.from("chat_bans").select("*").order("created_at", { ascending: false }).then(({ data }) => { if (data) setChatBans(data); });
  };

  const removeBan = async (id: string) => {
    await supabase.from("chat_bans").delete().eq("id", id);
    setChatBans(prev => prev.filter(b => b.id !== id));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-40">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground hover:text-primary">← Site</Link>
            <span className="text-border">|</span>
            <h1 className="font-display font-bold text-foreground">Owner Panel</h1>
            <span className="px-2 py-0.5 rounded-md bg-gradient-accent text-accent-foreground text-xs font-medium">Owner</span>
          </div>
          <button onClick={() => { logout(); navigate("/"); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </header>

      <div className="container py-6">
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                tab === t.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* ── Stats ── */}
        {tab === "stats" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Active Ads", value: ads.filter(a => a.is_active).length, color: "text-primary" },
              { label: "Total Ads", value: ads.length, color: "text-foreground" },
              { label: "Current Theme", value: settings.theme, color: "text-accent" },
              { label: "Team Members", value: userRoles.length, color: "text-muted-foreground" },
              { label: "Active Premium Codes", value: premiumCodes.filter(c => c.is_active && new Date(c.expires_at) > new Date()).length, color: "text-accent" },
              { label: "API Endpoints", value: apiEndpoints.length, color: "text-primary" },
              { label: "Total Premium Codes", value: premiumCodes.length, color: "text-foreground" },
              { label: "Themes Available", value: THEMES.length, color: "text-accent" },
            ].map(s => (
              <div key={s.label} className="p-6 rounded-xl bg-card border border-border">
                <p className="text-sm text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-2xl font-display font-bold capitalize ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </motion.div>
        )}

        {/* ── Branding + Theme ── */}
        {tab === "branding" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="p-6 rounded-xl bg-card border border-border">
              <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Palette className="w-5 h-5" /> Site Theme
              </h2>
              <p className="text-sm text-muted-foreground mb-4">Choose from {THEMES.length} themes — changes apply instantly for all users</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {THEMES.map(theme => (
                  <button
                    key={theme.key}
                    onClick={() => updateSettings({ theme: theme.key })}
                    className={`p-4 rounded-xl border-2 transition-all relative ${
                      settings.theme === theme.key ? "border-primary scale-105 shadow-[0_0_20px_hsl(var(--primary)/0.2)]" : "border-border hover:border-primary/40"
                    }`}
                  >
                    {theme.tag && (
                      <span className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
                        {theme.tag}
                      </span>
                    )}
                    <div className="flex gap-1 mb-2 justify-center">
                      {theme.colors.map((c, i) => (
                        <div key={i} className="w-6 h-6 rounded-full border border-border/50" style={{ background: c }} />
                      ))}
                    </div>
                    <p className="text-xs font-medium text-foreground">{theme.label}</p>
                    {settings.theme === theme.key && (
                      <p className="text-xs text-primary mt-0.5">Active</p>
                    )}
                  </button>
                ))}
              </div>

              {/* Custom Theme Builder */}
              {settings.theme === "custom" && (
                <div className="mt-6 p-4 rounded-xl bg-secondary/30 border border-border space-y-3">
                  <h3 className="text-sm font-bold text-foreground">🎨 Custom Theme Builder</h3>
                  <p className="text-xs text-muted-foreground">Enter HSL values (e.g. "175 80% 50%")</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      { label: "Primary Color", val: customPrimary, set: setCustomPrimary },
                      { label: "Accent Color", val: customAccent, set: setCustomAccent },
                      { label: "Background", val: customBg, set: setCustomBg },
                      { label: "Card", val: customCard, set: setCustomCard },
                      { label: "Border", val: customBorder, set: setCustomBorder },
                    ].map(f => (
                      <div key={f.label}>
                        <label className="text-[10px] text-muted-foreground block mb-1">{f.label}</label>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full border border-border flex-shrink-0" style={{ background: `hsl(${f.val})` }} />
                          <input value={f.val} onChange={e => f.set(e.target.value)}
                            className="flex-1 h-8 px-2 rounded-lg bg-secondary text-foreground text-xs border border-border focus:ring-1 focus:ring-primary focus:outline-none font-mono" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={async () => {
                    const colors: CustomThemeColors = { primary: customPrimary, accent: customAccent, background: customBg, card: customCard, border: customBorder };
                    await updateSettings({ theme: "custom", customThemeColors: colors });
                    await logAction("custom_theme", JSON.stringify(colors));
                  }} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                    <Save className="w-4 h-4" /> Apply Custom Theme
                  </button>
                </div>
              )}
            </div>

            {/* Font Style */}
            <div className="p-6 rounded-xl bg-card border border-border">
              <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Type className="w-5 h-5" /> Text Style
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {FONT_STYLES.map(fs => (
                  <button key={fs.key} onClick={() => updateSettings({ fontStyle: fs.key })}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      settings.fontStyle === fs.key ? "border-primary shadow-[0_0_15px_hsl(var(--primary)/0.2)]" : "border-border hover:border-primary/40"
                    }`}>
                    <p className="text-lg font-bold text-foreground mb-1">{fs.preview}</p>
                    <p className="text-xs font-bold text-foreground">{fs.label}</p>
                    <p className="text-[10px] text-muted-foreground">{fs.desc}</p>
                    {settings.fontStyle === fs.key && <p className="text-[10px] text-primary mt-0.5">Active</p>}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 rounded-xl bg-card border border-border">
              <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Type className="w-5 h-5" /> Site Identity
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { label: "Site Name", val: brandName, set: setBrandName, ph: "Beat Anistream" },
                  { label: "Site Icon (letter/emoji)", val: brandIcon, set: setBrandIcon, ph: "B", max: 2 },
                  { label: "Telegram Channel URL", val: tgChannel, set: setTgChannel, ph: "https://t.me/..." },
                  { label: "Telegram Group URL", val: tgGroup, set: setTgGroup, ph: "https://t.me/..." },
                  { label: "Error GIF URL", val: errorGif, set: setErrorGif, ph: "https://media.giphy.com/..." },
                  { label: "Loading GIF URL", val: loadingGif, set: setLoadingGif, ph: "https://media.giphy.com/..." },
                ].map(f => (
                  <div key={f.label}>
                    <label className="text-xs text-muted-foreground block mb-1">{f.label}</label>
                    <input value={f.val} onChange={e => f.set(e.target.value)} maxLength={f.max}
                      className="w-full h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none"
                      placeholder={f.ph} />
                  </div>
                ))}
              </div>
              <button onClick={saveBranding} disabled={saving}
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : brandingSaved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {brandingSaved ? "Saved!" : "Save Branding"}
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Premium Codes ── */}
        {tab === "premium" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="p-6 rounded-xl bg-card border border-border">
              <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Crown className="w-5 h-5 text-accent" /> Generate Premium Code
              </h2>
              <div className="flex gap-3 flex-wrap items-end">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Expires in (days)</label>
                  <input type="number" value={newCodeExpiry} onChange={e => setNewCodeExpiry(e.target.value)} min="1" max="365"
                    className="w-24 h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Max uses</label>
                  <input type="number" value={newCodeMaxUses} onChange={e => setNewCodeMaxUses(e.target.value)} min="1" max="1000"
                    className="w-24 h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none" />
                </div>
                <button onClick={generateCode} disabled={generatingCode}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium disabled:opacity-50 h-9">
                  {generatingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Generate Code
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {premiumCodes.length === 0 && (
                <p className="text-center text-muted-foreground py-12">No premium codes yet. Generate one above.</p>
              )}
              {premiumCodes.map(c => {
                const expired = new Date(c.expires_at) < new Date();
                const exhausted = c.current_uses >= c.max_uses;
                return (
                  <div key={c.id} className={`p-4 rounded-xl bg-card border transition-colors ${expired || exhausted ? "border-border/50 opacity-60" : "border-border"}`}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-4">
                        <button onClick={() => copyCode(c.code)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors">
                          <span className="font-mono text-lg font-bold text-foreground tracking-widest">{c.code}</span>
                          <Copy className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Users className="w-3 h-3" />
                            <span>{c.current_uses}/{c.max_uses} uses</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span>{expired ? "Expired" : `Expires ${new Date(c.expires_at).toLocaleDateString()}`}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          expired ? "bg-destructive/20 text-destructive" :
                          exhausted ? "bg-muted text-muted-foreground" :
                          "bg-accent/20 text-accent"
                        }`}>
                          {expired ? "Expired" : exhausted ? "Used up" : "Active"}
                        </span>
                        <button onClick={() => deleteCode(c.id)} className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── Chat Moderation ── */}
        {tab === "chat" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* Bug Reports */}
            <div className="p-5 rounded-xl bg-card border border-border">
              <h2 className="font-display text-base font-bold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" /> Bug Reports ({chatReports.length})
              </h2>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {chatReports.length === 0 && <p className="text-sm text-muted-foreground">No reports yet.</p>}
                {chatReports.map((msg: any) => (
                  <div key={msg.id} className={`flex items-start gap-3 p-3 rounded-lg ${msg.is_deleted ? "bg-destructive/5 opacity-50" : "bg-secondary"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-foreground">{msg.username || "Anonymous"}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(msg.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-foreground break-words">{msg.content}</p>
                    </div>
                    {!msg.is_deleted && (
                      <button onClick={() => adminDeleteMsg(msg.id)} className="p-1 rounded hover:bg-destructive/20 flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Chat Messages */}
            <div className="p-5 rounded-xl bg-card border border-border">
              <h2 className="font-display text-base font-bold text-foreground mb-3 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-primary" /> Recent Chat ({chatMessages.length})
              </h2>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {chatMessages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
                {chatMessages.map((msg: any) => (
                  <div key={msg.id} className={`flex items-start gap-3 p-2 rounded-lg ${msg.is_deleted ? "opacity-40" : "hover:bg-secondary/50"}`}>
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-secondary-foreground flex-shrink-0">
                      {(msg.username || "?")[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{msg.username}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(msg.created_at).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-sm text-foreground/80 break-words">{msg.content}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!msg.is_deleted && (
                        <button onClick={() => adminDeleteMsg(msg.id)} className="p-1 rounded hover:bg-destructive/20">
                          <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      )}
                      <button onClick={() => adminBanUser(msg.user_id, "mute")} title="Mute 7d" className="p-1 rounded hover:bg-destructive/20">
                        <VolumeX className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </button>
                      <button onClick={() => adminBanUser(msg.user_id, "ban")} title="Ban 7d" className="p-1 rounded hover:bg-destructive/20">
                        <Ban className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Bans */}
            <div className="p-5 rounded-xl bg-card border border-border">
              <h2 className="font-display text-base font-bold text-foreground mb-3 flex items-center gap-2">
                <Ban className="w-4 h-4 text-destructive" /> Active Bans ({chatBans.length})
              </h2>
              <div className="space-y-2">
                {chatBans.length === 0 && <p className="text-sm text-muted-foreground">No bans.</p>}
                {chatBans.map((ban: any) => (
                  <div key={ban.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                    <div>
                      <span className="text-xs font-mono text-foreground">{ban.user_id.slice(0, 8)}...</span>
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${ban.ban_type === "ban" ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"}`}>
                        {ban.ban_type}
                      </span>
                      {ban.expires_at && (
                        <span className="ml-2 text-[10px] text-muted-foreground">until {new Date(ban.expires_at).toLocaleDateString()}</span>
                      )}
                    </div>
                    <button onClick={() => removeBan(ban.id)} className="px-2 py-1 rounded text-xs bg-accent text-accent-foreground hover:opacity-80">
                      Unban
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Policy ── */}
        {tab === "policy" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
            {[
              { label: "DMCA Policy", icon: Shield, color: "text-primary", val: dmca, set: setDmca },
              { label: "Privacy Policy", icon: Globe, color: "text-accent", val: privacy, set: setPrivacy },
              { label: "Terms of Service", icon: FileText, color: "text-primary", val: terms, set: setTerms },
            ].map(p => (
              <div key={p.label} className="p-5 rounded-xl bg-card border border-border">
                <h2 className="font-display text-base font-bold text-foreground mb-3 flex items-center gap-2">
                  <p.icon className={`w-4 h-4 ${p.color}`} /> {p.label}
                </h2>
                <textarea value={p.val} onChange={e => p.set(e.target.value)} rows={5}
                  className="w-full p-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none resize-y" />
              </div>
            ))}
            <button onClick={savePolicy} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : brandingSaved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {brandingSaved ? "Saved!" : "Save Policies"}
            </button>
          </motion.div>
        )}

        {/* ── Ads ── */}
        {tab === "ads" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-foreground">Manage Ads</h2>
              <button onClick={() => setAds(prev => [...prev, { id: `new-${Date.now()}`, name: "", image_url: null, link_url: "", placement: "sidebar", size: "banner", is_active: false, sandbox: true }])}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                <Plus className="w-4 h-4" /> Add Ad
              </button>
            </div>
            <div className="space-y-4">
              {ads.map(ad => (
                <div key={ad.id} className="p-4 rounded-xl bg-card border border-border space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Name</label>
                      <input value={ad.name} onChange={e => setAds(prev => prev.map(a => a.id === ad.id ? { ...a, name: e.target.value } : a))}
                        className="w-full h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none mt-1" placeholder="Ad name" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Link URL</label>
                      <input value={ad.link_url} onChange={e => setAds(prev => prev.map(a => a.id === ad.id ? { ...a, link_url: e.target.value } : a))}
                        className="w-full h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none mt-1" placeholder="https://..." />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Image URL</label>
                      <input value={ad.image_url || ""} onChange={e => setAds(prev => prev.map(a => a.id === ad.id ? { ...a, image_url: e.target.value } : a))}
                        className="w-full h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Placement</label>
                        <select value={ad.placement} onChange={e => setAds(prev => prev.map(a => a.id === ad.id ? { ...a, placement: e.target.value } : a))}
                          className="w-full h-9 px-2 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none mt-1">
                          {PLACEMENTS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Size</label>
                        <select value={ad.size} onChange={e => setAds(prev => prev.map(a => a.id === ad.id ? { ...a, size: e.target.value } : a))}
                          className="w-full h-9 px-2 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none mt-1">
                          {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <button onClick={() => setAds(prev => prev.map(a => a.id === ad.id ? { ...a, is_active: !a.is_active } : a))} className="flex items-center gap-1.5 text-sm">
                      {ad.is_active ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                      <span className={ad.is_active ? "text-primary" : "text-muted-foreground"}>{ad.is_active ? "Active" : "Inactive"}</span>
                    </button>
                    <div className="ml-auto flex gap-2">
                      <button onClick={() => saveAd(ad)} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm">
                        <Save className="w-3.5 h-3.5" /> Save
                      </button>
                      <button onClick={() => deleteAd(ad.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/20 text-destructive text-sm hover:bg-destructive/30">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {ads.length === 0 && <p className="text-center text-muted-foreground py-12">No ads yet.</p>}
            </div>
          </motion.div>
        )}

        {/* ── Users ── */}
        {tab === "users" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="p-4 rounded-xl bg-card border border-border mb-6">
              <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <UserPlus className="w-4 h-4" /> Add Team Member
              </h3>
              {userError && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-3">{userError}</p>}
              <div className="flex gap-3 flex-wrap">
                <input value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} placeholder="Search by username"
                  className="flex-1 min-w-[200px] h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none" />
                <select value={newAdminRole} onChange={e => setNewAdminRole(e.target.value)}
                  className="h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none">
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
                <button onClick={addUserRole} disabled={addingUser}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                  {addingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {userRoles.map(ur => {
                const isPremium = ur.premium_until && new Date(ur.premium_until) > new Date();
                return (
                  <div key={ur.id} className="flex items-center justify-between p-4 rounded-xl bg-card border border-border">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isPremium ? "bg-accent/20" : "bg-secondary"}`}>
                        {isPremium ? <Crown className="w-4 h-4 text-accent" /> : <Shield className="w-4 h-4 text-primary" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{ur.username}</p>
                          {isPremium && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent/20 text-accent">PREMIUM</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{ur.user_id.slice(0, 8)}...</p>
                        {isPremium && ur.premium_until && (
                          <p className="text-[10px] text-accent/70">
                            Premium until {new Date(ur.premium_until).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${ur.role === "admin" ? "bg-accent/20 text-accent" : ur.role === "moderator" ? "bg-primary/20 text-primary" : "bg-secondary text-secondary-foreground"}`}>
                        {ur.role}
                      </span>
                      {ur.user_id !== user?.id && (
                        <button onClick={() => removeUserRole(ur.id)} className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors">
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── API Health ── */}
        {tab === "api" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* API Endpoints Manager */}
            <div className="p-5 rounded-xl bg-card border border-border">
              <h2 className="font-display text-base font-bold text-foreground mb-3 flex items-center gap-2">
                <Server className="w-4 h-4 text-primary" /> API Endpoints (Load Distribution)
              </h2>
              <p className="text-xs text-muted-foreground mb-4">Add multiple identical API clones to distribute load and reduce response time.</p>
              <div className="space-y-2 mb-4">
                {apiEndpoints.map((url, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={url} onChange={e => {
                      const next = [...apiEndpoints]; next[i] = e.target.value; setApiEndpoints(next);
                    }}
                      className="flex-1 h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none font-mono text-xs" />
                    <button onClick={() => setApiEndpoints(prev => prev.filter((_, j) => j !== i))}
                      className="p-2 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={newApiUrl} onChange={e => setNewApiUrl(e.target.value)} placeholder="https://your-api-clone.onrender.com/api/v1"
                  className="flex-1 h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none font-mono text-xs" />
                <button onClick={() => { if (newApiUrl.trim()) { setApiEndpoints(prev => [...prev, newApiUrl.trim()]); setNewApiUrl(""); } }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
              <button onClick={saveApiEndpoints} disabled={saving}
                className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Endpoints
              </button>
            </div>

            {/* Health check results */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                  <Zap className="w-5 h-5 text-accent" /> API Health & Response Time
                </h2>
                <button onClick={checkApis} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm">
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>
              {apiEndpoints.map((base, bi) => (
                <div key={bi} className="mb-6">
                  <h3 className="text-sm font-medium text-foreground mb-3 font-mono flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-muted-foreground" />
                    API #{bi + 1}: <span className="text-muted-foreground truncate">{base}</span>
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {API_ENDPOINTS.map(ep => {
                      const key = `${base}|${ep.name}`;
                      const h = apiHealth[key];
                      return (
                        <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
                          <div>
                            <p className="text-sm font-medium text-foreground">{ep.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">{ep.url}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {h?.ms != null && (
                              <span className={`text-xs font-mono ${h.ms < 500 ? "text-accent" : h.ms < 2000 ? "text-primary" : "text-destructive"}`}>
                                {h.ms}ms
                              </span>
                            )}
                            {h?.status === "loading" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                            {h?.status === "ok" && <CheckCircle className="w-4 h-4 text-accent" />}
                            {h?.status === "fail" && <XCircle className="w-4 h-4 text-destructive" />}
                            {!h && <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Player Theme ── */}
        {tab === "player" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="p-6 rounded-xl bg-card border border-border">
              <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <MonitorPlay className="w-5 h-5 text-primary" /> Video Player Theme
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PLAYER_THEMES.map(pt => (
                  <button key={pt.key} onClick={() => updateSettings({ playerTheme: pt.key })}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${settings.playerTheme === pt.key ? "border-primary shadow-[0_0_15px_hsl(var(--primary)/0.2)]" : "border-border hover:border-primary/40"}`}>
                    <p className="text-sm font-bold text-foreground">{pt.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{pt.desc}</p>
                    {settings.playerTheme === pt.key && <p className="text-xs text-primary mt-1">Active</p>}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6 rounded-xl bg-card border border-border">
              <h2 className="font-display text-base font-bold text-foreground mb-3 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" /> Favicon URL
              </h2>
              <p className="text-xs text-muted-foreground mb-3">Enter a .ico or .png URL for your site favicon</p>
              <div className="flex gap-2">
                <input value={faviconUrl} onChange={e => setFaviconUrl(e.target.value)} placeholder="https://example.com/favicon.ico"
                  className="flex-1 h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none font-mono text-xs" />
                <button onClick={saveFavicon} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                  <Save className="w-4 h-4" /> Save
                </button>
              </div>
              {faviconUrl && <img src={faviconUrl} alt="favicon preview" className="w-8 h-8 mt-3 rounded" onError={(e) => (e.currentTarget.style.display = "none")} />}
            </div>
          </motion.div>
        )}

        {/* ── Anime Ban List ── */}
        {tab === "banlist" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="p-6 rounded-xl bg-card border border-border">
              <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <EyeOff className="w-5 h-5 text-destructive" /> Anime Ban List
              </h2>
              <p className="text-xs text-muted-foreground mb-4">Banned anime IDs will be hidden from all pages and search results.</p>
              <div className="flex gap-2 mb-4">
                <input value={newBanId} onChange={e => setNewBanId(e.target.value)} placeholder="anime-slug-id (e.g. one-piece-100)"
                  className="flex-1 h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none font-mono text-xs" />
                <button onClick={addBannedAnime}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium">
                  <Plus className="w-4 h-4" /> Ban
                </button>
              </div>
              <div className="space-y-2">
                {bannedAnimes.length === 0 && <p className="text-sm text-muted-foreground">No banned anime.</p>}
                {bannedAnimes.map(id => (
                  <div key={id} className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                    <span className="text-sm font-mono text-foreground">{id}</span>
                    <button onClick={() => removeBannedAnime(id)} className="px-2 py-1 rounded text-xs bg-accent text-accent-foreground hover:opacity-80">Unban</button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Logs ── */}
        {tab === "logs" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-primary" /> Admin Audit Logs
              </h2>
              <button onClick={() => supabase.from("admin_logs").select("*").order("created_at", { ascending: false }).limit(100).then(({ data }) => { if (data) setAdminLogs(data); })}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>
            <div className="space-y-2">
              {adminLogs.length === 0 && <p className="text-center text-muted-foreground py-12">No logs yet. Actions like banning anime, changing settings, and moderation are logged here.</p>}
              {adminLogs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{log.action}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    {log.details && <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>}
                    {log.target_id && <p className="text-[10px] font-mono text-muted-foreground/60">{log.target_id}</p>}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
