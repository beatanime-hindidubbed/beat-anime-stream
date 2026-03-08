import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, X, Monitor, Volume2, VolumeX, SkipForward, Subtitles, Crown, Send, Moon, Sun, Cloud, CloudOff, Trash2, History, Gauge } from "lucide-react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useIsPremium } from "@/hooks/useIsPremium";
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface UserPrefs {
  autoplay: boolean;
  autoNext: boolean;
  defaultQuality: "auto" | "1080p" | "720p" | "480p" | "360p";
  defaultLanguage: "sub" | "dub" | "raw";
  subtitleSize: "small" | "medium" | "large";
  volume: number;
  reducedMotion: boolean;
  compactCards: boolean;
  cloudSync: boolean;
  pipOnScroll: boolean;
  bufferSize: "normal" | "high" | "max";
  personalization: boolean;
}

const DEFAULTS: UserPrefs = {
  autoplay: true,
  autoNext: true,
  defaultQuality: "auto",
  defaultLanguage: "dub",
  subtitleSize: "medium",
  volume: 100,
  reducedMotion: false,
  compactCards: false,
  cloudSync: true,
  pipOnScroll: true,
  bufferSize: "max",
  personalization: true,
};

function getPrefs(): UserPrefs {
  try {
    const d = localStorage.getItem("beat_user_prefs");
    return d ? { ...DEFAULTS, ...JSON.parse(d) } : DEFAULTS;
  } catch { return DEFAULTS; }
}

function savePrefs(p: UserPrefs) {
  localStorage.setItem("beat_user_prefs", JSON.stringify(p));
}

export default function UserSettingsPanel() {
  const { user } = useSupabaseAuth();
  const { isPremium } = useIsPremium();
  const { settings } = useSiteSettings();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<UserPrefs>(getPrefs);

  const isLoggedIn = !!user;

  const update = (partial: Partial<UserPrefs>) => {
    const next = { ...prefs, ...partial };
    setPrefs(next);
    savePrefs(next);
  };

  const clearContinueWatching = () => {
    localStorage.setItem("beat_continue", JSON.stringify([]));
  };

  const tgGroup = settings.telegramGroup || "https://t.me/beat_discussion_group";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all duration-200"
        title="Settings"
      >
        <Settings className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-80 sm:w-96 bg-card border-l border-border overflow-y-auto"
            >
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                  <Settings className="w-5 h-5 text-primary" /> Settings
                </h2>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="p-4 space-y-6">
                {/* Premium Status */}
                <div className={`rounded-xl p-4 border ${isPremium ? "border-yellow-500/30 bg-yellow-500/5" : "border-border bg-secondary/30"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Crown className={`w-5 h-5 ${isPremium ? "text-yellow-500" : "text-muted-foreground"}`} />
                    <span className="font-display font-bold text-foreground">
                      {isPremium ? "Premium Active ✨" : isLoggedIn ? "Free Plan" : "Guest Mode"}
                    </span>
                  </div>
                  {!isPremium && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {isLoggedIn
                          ? "Get ad-free streaming, no watermarks, bulk downloads & more!"
                          : "Sign in to sync watch history across devices."}
                      </p>
                      <a
                        href={tgGroup}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity w-full justify-center"
                      >
                        <Send className="w-4 h-4" /> {isLoggedIn ? "Request Premium on Telegram" : "Join Telegram"}
                      </a>
                    </div>
                  )}
                </div>

                {/* Playback */}
                <Section title="Playback" icon={<Monitor className="w-4 h-4" />}>
                  <Toggle label="Autoplay videos" checked={prefs.autoplay} onChange={(v) => update({ autoplay: v })} />
                  <Toggle label="Auto-next episode" checked={prefs.autoNext} onChange={(v) => update({ autoNext: v })} />
                  <Toggle label="PiP on scroll" checked={prefs.pipOnScroll} onChange={(v) => update({ pipOnScroll: v })} />

                  <Select
                    label="Default quality"
                    value={prefs.defaultQuality}
                    options={[
                      { value: "auto", label: "Auto" },
                      { value: "1080p", label: "1080p" },
                      { value: "720p", label: "720p" },
                      { value: "480p", label: "480p" },
                      { value: "360p", label: "360p" },
                    ]}
                    onChange={(v) => update({ defaultQuality: v as any })}
                  />

                  <Select
                    label="Default language"
                    value={prefs.defaultLanguage}
                    options={[
                      { value: "dub", label: "Hindi (Dub)" },
                      { value: "sub", label: "English (Sub)" },
                      { value: "raw", label: "Japanese (Raw)" },
                    ]}
                    onChange={(v) => update({ defaultLanguage: v as any })}
                  />

                  <Select
                    label="Buffer size"
                    value={prefs.bufferSize}
                    options={[
                      { value: "normal", label: "Normal (20s)" },
                      { value: "high", label: "High (1min)" },
                      { value: "max", label: "Max (3min)" },
                    ]}
                    onChange={(v) => update({ bufferSize: v as any })}
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground flex items-center gap-2">
                      {prefs.volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      Volume
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={prefs.volume}
                        onChange={(e) => update({ volume: Number(e.target.value) })}
                        className="w-24 accent-primary"
                      />
                      <span className="text-xs text-muted-foreground w-8 text-right">{prefs.volume}%</span>
                    </div>
                  </div>
                </Section>

                {/* Subtitles */}
                <Section title="Subtitles" icon={<Subtitles className="w-4 h-4" />}>
                  <Select
                    label="Subtitle size"
                    value={prefs.subtitleSize}
                    options={[
                      { value: "small", label: "Small" },
                      { value: "medium", label: "Medium" },
                      { value: "large", label: "Large" },
                    ]}
                    onChange={(v) => update({ subtitleSize: v as any })}
                  />
                </Section>

                {/* Streaming & Sync */}
                <Section title="Streaming" icon={<Cloud className="w-4 h-4" />}>
                  <Toggle
                    label="Cloud sync watch history"
                    checked={prefs.cloudSync}
                    onChange={(v) => update({ cloudSync: v })}
                  />
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    {prefs.cloudSync
                      ? "Your watch progress syncs across all devices when logged in."
                      : "Watch history stays on this device only."}
                  </p>

                  <button
                    onClick={() => {
                      clearContinueWatching();
                      alert("Continue watching history cleared!");
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm hover:bg-destructive/20 transition-colors w-full"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear Watch History
                  </button>

                  <Toggle
                    label="Personalized recommendations"
                    checked={prefs.personalization}
                    onChange={(v) => update({ personalization: v })}
                  />
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    {prefs.personalization
                      ? "Recommends anime based on genres you watch."
                      : "Shows default trending recommendations."}
                  </p>
                </Section>

                {/* Interface */}
                <Section title="Interface" icon={<Moon className="w-4 h-4" />}>
                  <Toggle label="Reduced motion" checked={prefs.reducedMotion} onChange={(v) => update({ reducedMotion: v })} />
                  <Toggle label="Compact card layout" checked={prefs.compactCards} onChange={(v) => update({ compactCards: v })} />
                </Section>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-sm font-bold text-foreground mb-3 flex items-center gap-2">
        {icon} {title}
      </h3>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full group"
    >
      <span className="text-sm text-foreground">{label}</span>
      <div className={`w-9 h-5 rounded-full transition-colors relative ${checked ? "bg-primary" : "bg-secondary"}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-primary-foreground transition-transform ${checked ? "left-[18px]" : "left-0.5"}`} />
      </div>
    </button>
  );
}

function Select({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded-lg bg-secondary text-sm text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
