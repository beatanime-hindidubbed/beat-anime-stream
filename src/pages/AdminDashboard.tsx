import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useSiteSettings, ThemeType } from "@/hooks/useSiteSettings";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  BarChart3, Settings, Image, Activity, LogOut, Plus, Trash2,
  ToggleLeft, ToggleRight, Save, Loader2, CheckCircle, XCircle, Globe,
  Users, Shield, UserPlus, UserMinus, Palette, Type, FileText
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
}

const API_ENDPOINTS = [
  { name: "Home", url: "/hianime/home" },
  { name: "Search", url: "/hianime/search?q=naruto" },
  { name: "Schedule", url: "/hianime/schedule?date=2025-01-01" },
  { name: "Anime Info", url: "/hianime/anime/one-piece-100" },
];

const PLACEMENTS = ["banner-top", "sidebar", "in-feed", "footer", "popup"];
const SIZES = ["banner", "square", "leaderboard", "skyscraper"];
const ROLES = ["admin", "moderator", "user"] as const;

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
  const [newApiUrl, setNewApiUrl] = useState("");
  const navigate = useNavigate();
  const [tab, setTab] = useState<"stats" | "branding" | "ads" | "api" | "users" | "policy">("stats");
  const [ads, setAds] = useState<Ad[]>([]);
  const [apiHealth, setApiHealth] = useState<Record<string, "ok" | "fail" | "loading">>({});
  const [saving, setSaving] = useState(false);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminRole, setNewAdminRole] = useState<string>("moderator");
  const [addingUser, setAddingUser] = useState(false);
  const [userError, setUserError] = useState("");
  const [brandingSaved, setBrandingSaved] = useState(false);

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
        .from("profiles").select("username").eq("user_id", r.user_id).single();
      enriched.push({ ...r, username: profile?.username || "Unknown" });
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

  const checkApis = async () => {
    const pool = (settings.apiPool && settings.apiPool.length > 0)
      ? settings.apiPool
      : ["https://beat-anime-api.onrender.com/api/v1"];
    const base = pool[0];
    const results: Record<string, "ok" | "fail" | "loading"> = {};
    API_ENDPOINTS.forEach(e => { results[e.name] = "loading"; });
    setApiHealth({ ...results });
    for (const ep of API_ENDPOINTS) {
      try {
        const res = await fetch(`${base}${ep.url}`, { signal: AbortSignal.timeout(10000) });
        results[ep.name] = res.ok ? "ok" : "fail";
      } catch { results[ep.name] = "fail"; }
      setApiHealth({ ...results });
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

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const tabs = [
    { key: "stats", label: "Stats", icon: BarChart3 },
    { key: "branding", label: "Branding", icon: Palette },
    { key: "policy", label: "Policies", icon: FileText },
    { key: "ads", label: "Ads", icon: Image },
    { key: "users", label: "Users", icon: Users },
    { key: "api", label: "API", icon: Activity },
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
              { label: "Total Ads", value: ads.length, color: "text-foreground" },
              { label: "Current Theme", value: settings.theme, color: "text-accent" },
              { label: "Team Members", value: userRoles.length, color: "text-muted-foreground" },
            ].map(s => (
              <div key={s.label} className="p-6 rounded-xl bg-card border border-border">
                <p className="text-sm text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-2xl font-display font-bold capitalize ${s.color}`}>{s.value}</p>
              </div>
            ))}
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
                      <Shield className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{ur.username}</p>
                      <p className="text-xs text-muted-foreground font-mono">{ur.user_id.slice(0, 8)}...</p>
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
              ))}
            </div>
          </motion.div>
        )}

        {/* API Health */}
        {tab === "api" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* API Pool Management */}
            <div className="p-5 rounded-xl bg-card border border-border">
              <h2 className="font-display text-base font-bold text-foreground mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> API Pool
              </h2>
              <div className="space-y-2 mb-4">
                {(settings.apiPool || []).map((url, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border">
                    <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">API{i + 1}</span>
                    <span className="flex-1 text-xs font-mono text-foreground/80 truncate">{url}</span>
                    <button
                      onClick={() => removeApi(url)}
                      disabled={(settings.apiPool || []).length <= 1}
                      className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
                      title="Remove API"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newApiUrl}
                  onChange={e => setNewApiUrl(e.target.value)}
                  placeholder="https://your-api.onrender.com/api/v1"
                  className="flex-1 h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                />
                <button
                  onClick={async () => {
                    const url = newApiUrl.trim();
                    if (!url) return;
                    await addApi(url);
                    setNewApiUrl("");
                  }}
                  disabled={!newApiUrl.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Minimum 1 API required. Changes apply immediately across the app.</p>
            </div>

            {/* Health Check */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-bold text-foreground">Health Check</h2>
                <button onClick={checkApis} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm">Refresh</button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Checking primary API: {(settings.apiPool || [])[0] || "—"}</p>
              <div className="space-y-3">
                {API_ENDPOINTS.map(ep => (
                  <div key={ep.name} className="flex items-center justify-between p-4 rounded-xl bg-card border border-border">
                    <div>
                      <p className="text-sm font-medium text-foreground">{ep.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{ep.url}</p>
                    </div>
                    <div>
                      {apiHealth[ep.name] === "loading" && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
                      {apiHealth[ep.name] === "ok" && <CheckCircle className="w-5 h-5 text-primary" />}
                      {apiHealth[ep.name] === "fail" && <XCircle className="w-5 h-5 text-destructive" />}
                      {!apiHealth[ep.name] && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
