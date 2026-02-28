import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  BarChart3, Settings, Image, Activity, LogOut, Plus, Trash2,
  ToggleLeft, ToggleRight, Save, Loader2, CheckCircle, XCircle, Globe
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

const API_ENDPOINTS = [
  { name: "Home", url: "/hianime/home" },
  { name: "Search", url: "/hianime/search?q=naruto" },
  { name: "Schedule", url: "/hianime/schedule?date=2025-01-01" },
  { name: "Anime Info", url: "/hianime/anime/one-piece-100" },
];

const PLACEMENTS = ["banner-top", "sidebar", "in-feed", "footer", "popup"];
const SIZES = ["banner", "square", "leaderboard", "skyscraper"];

export default function AdminDashboard() {
  const { user, isAdmin, loading: authLoading, logout } = useSupabaseAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"stats" | "ads" | "api" | "settings">("stats");
  const [ads, setAds] = useState<Ad[]>([]);
  const [apiHealth, setApiHealth] = useState<Record<string, "ok" | "fail" | "loading">>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/admin", { replace: true });
  }, [user, isAdmin, authLoading, navigate]);

  // Load ads
  useEffect(() => {
    supabase.from("ads").select("*").then(({ data }) => {
      if (data) setAds(data);
    });
  }, []);

  // Check API health
  const checkApis = async () => {
    const base = "https://beat-anime-api.onrender.com/api/v1";
    const results: Record<string, "ok" | "fail" | "loading"> = {};
    API_ENDPOINTS.forEach(e => { results[e.name] = "loading"; });
    setApiHealth({ ...results });

    for (const ep of API_ENDPOINTS) {
      try {
        const res = await fetch(`${base}${ep.url}`, { signal: AbortSignal.timeout(10000) });
        results[ep.name] = res.ok ? "ok" : "fail";
      } catch {
        results[ep.name] = "fail";
      }
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
    if (id.startsWith("new-")) {
      setAds(prev => prev.filter(a => a.id !== id));
      return;
    }
    await supabase.from("ads").delete().eq("id", id);
    setAds(prev => prev.filter(a => a.id !== id));
  };

  const addNewAd = () => {
    setAds(prev => [...prev, {
      id: `new-${Date.now()}`,
      name: "",
      image_url: null,
      link_url: "",
      placement: "sidebar",
      size: "banner",
      is_active: false,
      sandbox: true,
    }]);
  };

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const tabs = [
    { key: "stats", label: "Stats", icon: BarChart3 },
    { key: "ads", label: "Ads", icon: Image },
    { key: "api", label: "API Health", icon: Activity },
    { key: "settings", label: "Settings", icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-40">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground hover:text-primary">← Site</Link>
            <span className="text-border">|</span>
            <h1 className="font-display font-bold text-foreground">Admin Panel</h1>
          </div>
          <button onClick={() => { logout(); navigate("/"); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </header>

      <div className="container py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                tab === t.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* Stats Tab */}
        {tab === "stats" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Active Ads", value: ads.filter(a => a.is_active).length, color: "text-primary" },
              { label: "Total Ads", value: ads.length, color: "text-foreground" },
              { label: "Sandbox Ads", value: ads.filter(a => a.sandbox).length, color: "text-accent" },
              { label: "Placements Used", value: [...new Set(ads.map(a => a.placement))].length, color: "text-muted-foreground" },
            ].map(s => (
              <div key={s.label} className="p-6 rounded-xl bg-card border border-border">
                <p className="text-sm text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-3xl font-display font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </motion.div>
        )}

        {/* Ads Tab */}
        {tab === "ads" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-foreground">Manage Ads</h2>
              <button onClick={addNewAd} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                <Plus className="w-4 h-4" /> Add Ad
              </button>
            </div>
            <div className="space-y-4">
              {ads.map(ad => (
                <div key={ad.id} className="p-4 rounded-xl bg-card border border-border space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Name</label>
                      <input
                        value={ad.name}
                        onChange={e => setAds(prev => prev.map(a => a.id === ad.id ? { ...a, name: e.target.value } : a))}
                        className="w-full h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none mt-1"
                        placeholder="Ad name"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Link URL</label>
                      <input
                        value={ad.link_url}
                        onChange={e => setAds(prev => prev.map(a => a.id === ad.id ? { ...a, link_url: e.target.value } : a))}
                        className="w-full h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none mt-1"
                        placeholder="https://..."
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Image URL</label>
                      <input
                        value={ad.image_url || ""}
                        onChange={e => setAds(prev => prev.map(a => a.id === ad.id ? { ...a, image_url: e.target.value } : a))}
                        className="w-full h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none mt-1"
                        placeholder="Image URL"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Placement</label>
                        <select
                          value={ad.placement}
                          onChange={e => setAds(prev => prev.map(a => a.id === ad.id ? { ...a, placement: e.target.value } : a))}
                          className="w-full h-9 px-2 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none mt-1"
                        >
                          {PLACEMENTS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Size</label>
                        <select
                          value={ad.size}
                          onChange={e => setAds(prev => prev.map(a => a.id === ad.id ? { ...a, size: e.target.value } : a))}
                          className="w-full h-9 px-2 rounded-lg bg-secondary text-foreground text-sm border border-border focus:ring-1 focus:ring-primary focus:outline-none mt-1"
                        >
                          {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setAds(prev => prev.map(a => a.id === ad.id ? { ...a, is_active: !a.is_active } : a))} className="flex items-center gap-1.5 text-sm">
                      {ad.is_active ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                      <span className={ad.is_active ? "text-primary" : "text-muted-foreground"}>{ad.is_active ? "Active" : "Inactive"}</span>
                    </button>
                    <button onClick={() => setAds(prev => prev.map(a => a.id === ad.id ? { ...a, sandbox: !a.sandbox } : a))} className="flex items-center gap-1.5 text-sm">
                      <Globe className="w-4 h-4" />
                      <span className={ad.sandbox ? "text-accent" : "text-muted-foreground"}>{ad.sandbox ? "Sandbox" : "Production"}</span>
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
              {ads.length === 0 && (
                <p className="text-center text-muted-foreground py-12">No ads configured yet. Click "Add Ad" to create one.</p>
              )}
            </div>
          </motion.div>
        )}

        {/* API Health Tab */}
        {tab === "api" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-foreground">API Health Check</h2>
              <button onClick={checkApis} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm">Refresh</button>
            </div>
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
                    {!apiHealth[ep.name] && <span className="text-xs text-muted-foreground">Not checked</span>}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Settings Tab */}
        {tab === "settings" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="font-display text-lg font-bold text-foreground mb-4">Site Settings</h2>
            <div className="p-6 rounded-xl bg-card border border-border">
              <p className="text-muted-foreground text-sm">Theme customization and site-wide settings coming soon. Use the Ads tab to manage advertisements.</p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
