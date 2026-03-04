import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useSiteSettings, ThemeType, AccessLevel } from "@/hooks/useSiteSettings";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  BarChart3, Settings, Image, Activity, LogOut, Plus, Trash2,
  ToggleLeft, ToggleRight, Save, Loader2, CheckCircle, XCircle, Globe,
  Users, Shield, UserPlus, UserMinus, Palette, Type, FileText, Download,
  Server, Crown
} from "lucide-react";

interface Ad {
  id: string;
  name: string;
  image_url: string | null;
  link_url: string;
  placement: string;
  size: string;
  is_active: boolean;
  sandbox: boolean;
}

interface UserRole {
  id: string;
  user_id: string;
  role: string;
  username?: string;
  is_premium?: boolean;
}

const API_ENDPOINTS = [
  { name: "Home", url: "/hianime/home" },
  { name: "Search", url: "/hianime/search?q=naruto" },
  { name: "Schedule", url: "/hianime/schedule?date=2025-01-01" },
  { name: "Anime Info", url: "/hianime/anime/one-piece-100" },
];

const PLACEMENTS = ["banner-top", "sidebar", "in-feed", "footer", "popup"];
const SIZES = ["banner", "square", "leaderboard", "skyscraper"];
const ROLES = ["admin", "moderator", "user", "premium"] as const;
const ACCESS_LEVELS: { value: AccessLevel; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "logged-in", label: "Logged-in Users" },
  { value: "premium", label: "Premium Only" },
];

const THEMES: { key: ThemeType; label: string; colors: string[] }[] = [
  { key: "classic", label: "Classic", colors: ["#00e5c8", "#ff4d9e"] },
  { key: "cyberpunk", label: "Cyberpunk", colors: ["#ffff00", "#ff00ff"] },
  { key: "neon", label: "Neon", colors: ["#00ffaa", "#aa00ff"] },
  { key: "sakura", label: "Sakura", colors: ["#ff6b9d", "#ff9a4d"] },
  { key: "minimal", label: "Minimal", colors: ["#d0d0d0", "#909090"] },
];

export default function AdminDashboard() {
  const { user, isAdmin, loading: authLoading, logout } = useSupabaseAuth();
  const { settings, updateSettings, addApi, removeApi } = useSiteSettings();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"stats" | "branding" | "ads" | "api" | "users" | "policy" | "downloads">("stats");
  const [ads, setAds] = useState<Ad[]>([]);
  const [apiHealth, setApiHealth] = useState<Record<string, "ok" | "fail" | "loading">>({});
  const [saving, setSaving] = useState(false);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminRole, setNewAdminRole] = useState<string>("moderator");
  const [addingUser, setAddingUser] = useState(false);
  const [userError, setUserError] = useState("");
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [newApiUrl, setNewApiUrl] = useState("");

  // Local branding state
  const [brandName, setBrandName] = useState(settings.siteName);
  const [brandIcon, setBrandIcon] = useState(settings.siteIcon);
  const [tgChannel, setTgChannel] = useState(settings.telegramChannel);
  const [tgGroup, setTgGroup] = useState(settings.telegramGroup);
  const [errorGif, setErrorGif] = useState(settings.errorGif);
  const [loadingGif, setLoadingGif] = useState(settings.loadingGif);
  const [dmca, setDmca] = useState(settings.dmcaContent);
  const [privacy, setPrivacy] = useState(settings.privacyContent);
  const [terms, setTerms] = useState(settings.termsContent);

  useEffect(() => {
    setBrandName(settings.siteName);
    setBrandIcon(settings.siteIcon);
    setTgChannel(settings.telegramChannel);
    setTgGroup(settings.telegramGroup);
    setErrorGif(settings.errorGif);
    setLoadingGif(settings.loadingGif);
    setDmca(settings.dmcaContent);
    setPrivacy(settings.privacyContent);
    setTerms(settings.termsContent);
  }, [settings]);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/admin", { replace: true });
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    supabase.from("ads").select("*").then(({ data }) => {
      if (data) setAds(data);
    });
  }, []);

  useEffect(() => {
    if (tab === "users") loadUserRoles();
  }, [tab]);

  const loadUserRoles = async () => {
    const { data: roles } = await supabase.from("user_roles").select("*");
    if (!roles) return;
    const enriched: UserRole[] = [];
    for (const r of roles) {
      const { data: profile } = await supabase
        .from("profiles").select("username, is_premium").eq("user_id", r.user_id).single();
      enriched.push({ ...r, username: profile?.username || "Unknown", is_premium: profile?.is_premium || false });
    }
    setUserRoles(enriched);
  };

  const addUserRole = async () => {
    if (!newAdminEmail.trim()) return;
    setAddingUser(true);
    setUserError("");
    try {
      const { data: profiles } = await supabase
        .from("profiles").select("user_id, username").ilike("username", newAdminEmail.trim());
      if (!profiles || profiles.length === 0) {
        setUserError("User not found. Search by exact username.");
        setAddingUser(false);
        return;
      }
      const { error } = await supabase.from("user_roles").insert({
        user_id: profiles[0].user_id, role: newAdminRole as any,
      });
      if (error) {
        setUserError(error.code === "23505" ? "User already has this role." : error.message);
      } else {
        setNewAdminEmail("");
        loadUserRoles();
      }
    } catch { setUserError("Failed to add role."); }
    setAddingUser(false);
  };

  const removeUserRole = async (id: string) => {
    await supabase.from("user_roles").delete().eq("id", id);
    setUserRoles(prev => prev.filter(r => r.id !== id));
  };

  const togglePremium = async (userId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_premium: !currentStatus })
      .eq("user_id", userId);
    
    if (!error) loadUserRoles();
  };

  const checkApis = async () => {
    const results: Record<string, "ok" | "fail" | "loading"> = {};
    API_ENDPOINTS.forEach(e => { results[e.name] = "loading"; });
    setApiHealth({ ...results });
    
    for (const api of settings.apiPool) {
      for (const ep of API_ENDPOINTS) {
        try {
          const res = await fetch(`${api}${ep.url}`, { signal: AbortSignal.timeout(10000) });
          results[`${api}-${ep.name}`] = res.ok ? "ok" : "fail";
        } catch { 
          results[`${api}-${ep.name}`] = "fail"; 
        }
        setApiHealth({ ...results });
      }
    }
  };

  useEffect(() => { if (tab === "api") checkApis(); }, [tab]);

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
    await updateSettings({
      siteName: brandName, siteIcon: brandIcon,
      telegramChannel: tgChannel, telegramGroup: tgGroup,
      errorGif, loadingGif,
    });
    setSaving(false);
    setBrandingSaved(true);
    setTimeout(() => setBrandingSaved(false), 2000);
  };

  const savePolicy = async () => {
    setSaving(true);
    await updateSettings({ dmcaContent: dmca, privacyContent: privacy, termsContent: terms });
    setSaving(false);
    setBrandingSaved(true);
    setTimeout(() => setBrandingSaved(false), 2000);
  };

  const handleAddApi = async () => {
    if (!newApiUrl.trim()) return;
    try {
      const url = new URL(newApiUrl.trim());
      await addApi(url.toString());
      setNewApiUrl("");
    } catch {
      alert("Invalid URL format");
    }
  };

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const tabs = [
    { key: "stats", label: "Stats", icon: BarChart3 },
    { key: "branding", label: "Branding", icon: Palette },
    { key: "downloads", label: "Downloads", icon: Download },
    { key: "policy", label: "Policies", icon: FileText },
    { key: "ads", label: "Ads", icon: Image },
    { key: "users", label: "Users", icon: Users },
    { key: "api", label: "APIs", icon: Activity },
  ] as const;

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

        {/* Stats */}
        {tab === "stats" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Active Ads", value: ads.filter(a => a.is_active).length, color: "text-primary" },
              { label: "Total APIs", value: settings.apiPool.length, color: "text-accent" },
              { label: "Current Theme", value: settings.theme, color: "text-foreground" },
              { label: "Team Members", value: userRoles.length, color: "text-muted-foreground" },
            ].map(s => (
              <div key={s.label} className="p-6 rounded-xl bg-card border border-border">
                <p className="text-sm text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-2xl font-display font-bold capitalize ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </motion.div>
        )}

        {/* Downloads */}
        {tab === "downloads" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="p-6 rounded-xl bg-card border border-border">
              <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Download className="w-5 h-5" /> Download Permissions
              </h2>
              
              <div className="space-y-4">
                {/* Single episode download */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-2">
                    Single Episode Download
                  </label>
                  <select
                    value={settings.downloadAccess}
                    onChange={e => updateSettings({ downloadAccess: e.target.value as AccessLevel })}
                    className="w-full max-w-xs h-10 px-3 rounded-lg bg-secondary text-foreground border border-border"
                  >
                    {ACCESS_LEVELS.map(level => (
                      <option key={level.value} value={level.value}>{level.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">Who can download individual episodes</p>
                </div>

                {/* Bulk download */}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-2">
                    Bulk Download (ZIP)
                  </label>
                  <select
                    value={settings.bulkDownloadAccess}
                    onChange={e => updateSettings({ bulkDownloadAccess: e.target.value as AccessLevel })}
                    className="w-full max-w-xs h-10 px-3 rounded-lg bg-secondary text-foreground border border-border"
                  >
                    {ACCESS_LEVELS.map(level => (
                      <option key={level.value} value={level.value}>{level.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">Who can use bulk download feature</p>
                </div>
              </div>

              <div className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/20">
                <h3 className="text-sm font-medium text-primary mb-2">Current Settings</h3>
                <ul className="text-xs text-foreground space-y-1">
                  <li>• Single Download: <span className="font-semibold">{ACCESS_LEVELS.find(l => l.value === settings.downloadAccess)?.label}</span></li>
                  <li>• Bulk Download: <span className="font-semibold">{ACCESS_LEVELS.find(l => l.value === settings.bulkDownloadAccess)?.label}</span></li>
                  <li>• Max Simultaneous Downloads: <span className="font-semibold">5</span></li>
                  <li>• Max Episodes per Batch: <span className="font-semibold">24</span></li>
                  <li>• Spam Protection: <span className="font-semibold">3 downloads/min = 5min cooldown</span></li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}

        {/* Branding + Theme */}
        {tab === "branding" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* Theme switcher */}
            <div className="p-6 rounded-xl bg-card border border-border">
              <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Palette className="w-5 h-5" /> Site Theme
              </h2>
              <p className="text-sm text-muted-foreground mb-4">Changes apply instantly for all users</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {THEMES.map(theme => (
                  <button
                    key={theme.key}
                    onClick={() => updateSettings({ theme: theme.key })}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      settings.theme === theme.key ? "border-primary scale-105" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex gap-1 mb-2 justify-center">
                      {theme.colors.map((c, i) => (
                        <div key={i} className="w-6 h-6 rounded-full" style={{ background: c }} />
                      ))}
                    </div>
                    <p className="text-xs font-medium text-foreground">{theme.label}</p>
                    {settings.theme === theme.key && (
                      <p className="text-xs text-primary mt-0.5">Active</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Site identity */}
            <div className="p-6 rounded-xl bg-card border border-border">
              <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Type className="w-5 h-5" /> Site Identity
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Site Name</label>
                  <input value={brandName} onChange={e => setBrandName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none"
                    placeholder="Beat Anistream" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Site Icon (letter/emoji)</label>
                  <input value={brandIcon} onChange={e => setBrandIcon(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none"
                    placeholder="B" maxLength={2} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Telegram Channel URL</label>
                  <input value={tgChannel} onChange={e => setTgChannel(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none"
                    placeholder="https://t.me/..." />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Telegram Group URL</label>
                  <input value={tgGroup} onChange={e => setTgGroup(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none"
                    placeholder="https://t.me/..." />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Error GIF URL (for stream errors)</label>
                  <input value={errorGif} onChange={e => setErrorGif(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none"
                    placeholder="https://media.giphy.com/..." />
                  {errorGif && <img src={errorGif} className="mt-2 h-16 rounded" alt="error preview" />}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Loading GIF URL</label>
                  <input value={loadingGif} onChange={e => setLoadingGif(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none"
                    placeholder="https://media.giphy.com/..." />
                  {loadingGif && <img src={loadingGif} className="mt-2 h-16 rounded" alt="loading preview" />}
                </div>
              </div>
              <button onClick={saveBranding} disabled={saving}
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : brandingSaved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {brandingSaved ? "Saved!" : "Save Branding"}
              </button>
            </div>
          </motion.div>
        )}

        {/* Policy content */}
        {tab === "policy" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
            <div className="p-5 rounded-xl bg-card border border-border">
              <h2 className="font-display text-base font-bold text-foreground mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> DMCA Policy
              </h2>
              <textarea value={dmca} onChange={e => setDmca(e.target.value)} rows={5}
                className="w-full p-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none resize-y" />
            </div>
            <div className="p-5 rounded-xl bg-card border border-border">
              <h2 className="font-display text-base font-bold text-foreground mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4 text-accent" /> Privacy Policy
              </h2>
              <textarea value={privacy} onChange={e => setPrivacy(e.target.value)} rows={5}
                className="w-full p-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none resize-y" />
            </div>
            <div className="p-5 rounded-xl bg-card border border-border">
              <h2 className="font-display text-base font-bold text-foreground mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Terms of Service
              </h2>
              <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={5}
                className="w-full p-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none resize-y" />
            </div>
            <button onClick={savePolicy} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : brandingSaved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {brandingSaved ? "Saved!" : "Save Policies"}
            </button>
          </motion.div>
        )}

        {/* Ads */}
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
                  {ad.image_url && <div className="rounded-lg overflow-hidden border border-border max-w-xs"><img src={ad.image_url} alt={ad.name} className="w-full h-auto" /></div>}
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

        {/* Users */}
        {tab === "users" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="p-4 rounded-xl bg-card border border-border mb-6">
              <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <UserPlus className="w-4 h-4" /> Add Team Member
              </h3>
              {userError && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-3">{userError}</p>}
              <div className="flex gap-3 flex-wrap">
                <input value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)}
                  placeholder="Search by username"
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
              {userRoles.map(ur => (
                <div key={ur.id} className="flex items-center justify-between p-4 rounded-xl bg-card border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
                      {ur.is_premium ? <Crown className="w-4 h-4 text-amber-400" /> : <Shield className="w-4 h-4 text-primary" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground flex items-center gap-2">
                        {ur.username}
                        {ur.is_premium && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-400">PREMIUM</span>}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">{ur.user_id.slice(0, 8)}...</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${ur.role === "admin" ? "bg-accent/20 text-accent" : ur.role === "moderator" ? "bg-primary/20 text-primary" : "bg-secondary text-secondary-foreground"}`}>
                      {ur.role}
                    </span>
                    <button 
                      onClick={() => togglePremium(ur.user_id, ur.is_premium || false)}
                      className={`p-1.5 rounded-lg transition-colors ${ur.is_premium ? 'bg-amber-400/20 text-amber-400 hover:bg-amber-400/30' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
                      title={ur.is_premium ? "Remove premium" : "Grant premium"}
                    >
                      <Crown className="w-4 h-4" />
                    </button>
                    {ur.user_id !== user?.id && (
                      <button onClick={() => removeUserRole(ur.id)} className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors">
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* API Management */}
        {tab === "api" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            
            {/* Add new API */}
            <div className="p-4 rounded-xl bg-card border border-border">
              <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <Server className="w-4 h-4" /> Add New API Endpoint
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                More APIs = better load distribution and faster downloads
              </p>
              <div className="flex gap-3">
                <input 
                  value={newApiUrl}
                  onChange={e => setNewApiUrl(e.target.value)}
                  placeholder="https://beat-anime-api-5.onrender.com/api/v1"
                  className="flex-1 h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none"
                />
                <button 
                  onClick={handleAddApi}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
            </div>

            {/* API Pool */}
            <div className="p-6 rounded-xl bg-card border border-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-bold text-foreground">API Pool ({settings.apiPool.length} endpoints)</h2>
                <button onClick={checkApis} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm">Refresh</button>
              </div>
              
              <div className="space-y-3">
                {settings.apiPool.map((api, idx) => (
                  <div key={api} className="p-4 rounded-xl bg-secondary/40 border border-border">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded bg-primary/20 text-primary text-xs font-bold">
                          API {idx + 1}
                        </span>
                        <span className="text-xs text-foreground font-mono">{api}</span>
                      </div>
                      {settings.apiPool.length > 1 && (
                        <button 
                          onClick={() => removeApi(api)}
                          className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    
                    {/* Health checks for this API */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {API_ENDPOINTS.map(ep => {
                        const key = `${api}-${ep.name}`;
                        const status = apiHealth[key];
                        return (
                          <div key={ep.name} className="flex items-center justify-between px-2 py-1.5 rounded bg-card text-xs">
                            <span className="text-muted-foreground">{ep.name}</span>
                            {status === "loading" && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                            {status === "ok" && <CheckCircle className="w-3 h-3 text-green-400" />}
                            {status === "fail" && <XCircle className="w-3 h-3 text-red-400" />}
                            {!status && <span className="text-muted-foreground/40">—</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-4 rounded-lg bg-accent/10 border border-accent/20">
                <h3 className="text-sm font-medium text-accent mb-2">Load Distribution Info</h3>
                <ul className="text-xs text-foreground space-y-1">
                  <li>• Episodes are distributed across all APIs automatically</li>
                  <li>• Each API handles parallel segment downloads (16 segments at once)</li>
                  <li>• Failed episodes auto-retry on different APIs</li>
                  <li>• More APIs = faster bulk downloads and better reliability</li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
