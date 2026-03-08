import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ThemeType =
  | "classic" | "cyberpunk" | "neon" | "sakura" | "minimal"
  | "midnight" | "ocean" | "sunset" | "forest" | "lavender"
  | "crimson" | "arctic" | "ember"
  | "anime-dark" | "anime-pastel" | "anime-retro" | "dragon" | "galaxy"
  | "bloodmoon" | "phantom" | "jade" | "violet-storm" | "golden-hour"
  | "netflix" | "custom";

export type PlayerTheme = "default" | "minimal" | "cinema" | "retro" | "glassmorphism";

export type FontStyle = "default" | "elegant" | "playful" | "monospace" | "cinematic";

export interface CustomThemeColors {
  primary: string;
  accent: string;
  background: string;
  card: string;
  border: string;
}

export interface SiteSettings {
  siteName: string;
  siteIcon: string;
  theme: ThemeType;
  playerTheme: PlayerTheme;
  fontStyle: FontStyle;
  customThemeColors: CustomThemeColors;
  faviconUrl: string;
  errorGif: string;
  loadingGif: string;
  dmcaContent: string;
  privacyContent: string;
  termsContent: string;
  telegramChannel: string;
  telegramGroup: string;
  hiddenAnimes: string[];
  bannedAnimes: string[];
  failCountThreshold: number;
  apiEndpoints: string[];
}

const DEFAULTS: SiteSettings = {
  siteName: "Beat Anistream",
  siteIcon: "B",
  theme: "classic",
  playerTheme: "default",
  fontStyle: "default",
  customThemeColors: { primary: "175 80% 50%", accent: "330 70% 55%", background: "220 20% 7%", card: "220 18% 10%", border: "220 15% 18%" },
  faviconUrl: "",
  errorGif: "",
  loadingGif: "",
  dmcaContent:
    "This site does not host any files. All content is provided by third-party streaming services. If you believe your copyrighted content is being used without permission, please contact us with full details and we will respond within 48 hours.",
  privacyContent:
    "We respect your privacy. We do not sell or share your personal data with third parties. We may collect minimal usage data to improve our service. By using this site you consent to these terms.",
  termsContent:
    "By accessing this website you agree to use it for personal, non-commercial purposes only. You agree not to distribute, reproduce, or exploit any content found on this platform. We reserve the right to terminate access for violations.",
  telegramChannel: "https://t.me/beatanime",
  telegramGroup: "https://t.me/beat_discussion_group",
  hiddenAnimes: [],
  bannedAnimes: [],
  failCountThreshold: 5,
  apiEndpoints: ["https://beat-anime-api.onrender.com/api/v1"],
};

interface SiteSettingsCtx {
  settings: SiteSettings;
  updateSettings: (partial: Partial<SiteSettings>) => Promise<void>;
  reportAnimeFail: (animeId: string) => void;
  isHidden: (animeId: string) => boolean;
}

const Ctx = createContext<SiteSettingsCtx>({
  settings: DEFAULTS,
  updateSettings: async () => {},
  reportAnimeFail: () => {},
  isHidden: () => false,
});

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULTS);

  useEffect(() => {
    supabase
      .from("site_settings")
      .select("*")
      .then(({ data, error }) => {
        if (error || !data?.length) return;
        const map: Record<string, any> = {};
        data.forEach((row) => { map[row.key] = row.value; });
        setSettings((prev) => ({ ...prev, ...map }));
      });
  }, []);

  useEffect(() => {
    applyTheme(settings.theme, settings.customThemeColors);
  }, [settings.theme, settings.customThemeColors]);

  useEffect(() => {
    applyFont(settings.fontStyle);
  }, [settings.fontStyle]);

  useEffect(() => {
    if (settings.faviconUrl) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = settings.faviconUrl;
    }
  }, [settings.faviconUrl]);

  const updateSettings = useCallback(
    async (partial: Partial<SiteSettings>) => {
      const next = { ...settings, ...partial };
      setSettings(next);
      for (const [key, value] of Object.entries(partial)) {
        await supabase
          .from("site_settings")
          .upsert({ key, value }, { onConflict: "key" });
      }
    },
    [settings]
  );

  const reportAnimeFail = useCallback(
    async (animeId: string) => {
      const lsKey = `fail_${animeId}`;
      const localCount = parseInt(localStorage.getItem(lsKey) || "0") + 1;
      localStorage.setItem(lsKey, String(localCount));
      try {
        const { data } = await supabase
          .from("site_settings")
          .select("value")
          .eq("key", `anime_fail_${animeId}`)
          .single();
        const globalCount = ((data?.value as number) || 0) + 1;
        await supabase
          .from("site_settings")
          .upsert({ key: `anime_fail_${animeId}`, value: globalCount }, { onConflict: "key" });
        if (globalCount >= settings.failCountThreshold) {
          const hidden = [...(settings.hiddenAnimes || [])];
          if (!hidden.includes(animeId)) {
            hidden.push(animeId);
            await updateSettings({ hiddenAnimes: hidden });
          }
        }
      } catch {}
    },
    [settings, updateSettings]
  );

  const isHidden = useCallback(
    (animeId: string) =>
      (settings.hiddenAnimes || []).includes(animeId) ||
      (settings.bannedAnimes || []).includes(animeId),
    [settings.hiddenAnimes, settings.bannedAnimes]
  );

  return (
    <Ctx.Provider value={{ settings, updateSettings, reportAnimeFail, isHidden }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSiteSettings() {
  return useContext(Ctx);
}

// Font style application
function applyFont(fontStyle: FontStyle) {
  const root = document.documentElement;
  const fonts: Record<FontStyle, { display: string; body: string }> = {
    default: { display: "Outfit, sans-serif", body: "Space Grotesk, sans-serif" },
    elegant: { display: "Georgia, serif", body: "Palatino, serif" },
    playful: { display: "'Comic Neue', cursive, sans-serif", body: "'Comic Neue', cursive, sans-serif" },
    monospace: { display: "'JetBrains Mono', monospace", body: "'JetBrains Mono', monospace" },
    cinematic: { display: "'Bebas Neue', Impact, sans-serif", body: "'Inter', sans-serif" },
  };
  const f = fonts[fontStyle] || fonts.default;
  root.style.setProperty("--font-display", f.display);
  root.style.setProperty("--font-body", f.body);
}

function applyTheme(theme: ThemeType, customColors?: CustomThemeColors) {
  const root = document.documentElement.style;

  const themes: Record<string, Record<string, string>> = {
    classic: {
      "--primary": "175 80% 50%", "--accent": "330 70% 55%",
      "--background": "220 20% 7%", "--card": "220 18% 10%", "--border": "220 15% 18%",
      "--gradient-primary": "linear-gradient(135deg, hsl(175 80% 50%), hsl(200 80% 55%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(330 70% 55%), hsl(280 60% 55%))",
      "--theme-pattern": "none",
    },
    netflix: {
      "--primary": "0 90% 45%", "--accent": "0 0% 95%",
      "--background": "0 0% 5%", "--card": "0 0% 9%", "--border": "0 0% 14%",
      "--foreground": "0 0% 95%", "--muted-foreground": "0 0% 60%",
      "--secondary": "0 0% 12%", "--secondary-foreground": "0 0% 90%",
      "--gradient-primary": "linear-gradient(135deg, hsl(0 90% 45%), hsl(0 85% 35%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(0 0% 95%), hsl(0 0% 80%))",
      "--theme-pattern": "none",
    },
    cyberpunk: {
      "--primary": "60 100% 50%", "--accent": "300 100% 60%",
      "--background": "220 30% 4%", "--card": "220 25% 7%", "--border": "220 20% 14%",
      "--gradient-primary": "linear-gradient(135deg, hsl(60 100% 50%), hsl(40 100% 55%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(300 100% 60%), hsl(260 100% 65%))",
      "--theme-pattern": "repeating-linear-gradient(0deg, transparent, transparent 50px, hsl(60 100% 50% / 0.03) 50px, hsl(60 100% 50% / 0.03) 51px)",
    },
    neon: {
      "--primary": "165 100% 50%", "--accent": "280 100% 65%",
      "--background": "230 25% 5%", "--card": "230 20% 8%", "--border": "230 15% 18%",
      "--gradient-primary": "linear-gradient(135deg, hsl(165 100% 50%), hsl(200 100% 55%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(280 100% 65%), hsl(320 100% 60%))",
      "--theme-pattern": "radial-gradient(circle at 20% 80%, hsl(165 100% 50% / 0.04) 0%, transparent 50%), radial-gradient(circle at 80% 20%, hsl(280 100% 65% / 0.04) 0%, transparent 50%)",
    },
    sakura: {
      "--primary": "340 80% 65%", "--accent": "20 90% 60%",
      "--background": "330 15% 8%", "--card": "330 12% 11%", "--border": "330 10% 20%",
      "--gradient-primary": "linear-gradient(135deg, hsl(340 80% 65%), hsl(360 80% 70%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(20 90% 60%), hsl(40 90% 60%))",
      "--theme-pattern": "radial-gradient(2px 2px at 15% 25%, hsl(340 80% 65% / 0.15), transparent), radial-gradient(2px 2px at 85% 15%, hsl(340 80% 65% / 0.1), transparent)",
    },
    minimal: {
      "--primary": "0 0% 82%", "--accent": "0 0% 60%",
      "--background": "0 0% 5%", "--card": "0 0% 8%", "--border": "0 0% 15%",
      "--gradient-primary": "linear-gradient(135deg, hsl(0 0% 80%), hsl(0 0% 65%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(0 0% 60%), hsl(0 0% 50%))",
      "--theme-pattern": "none",
    },
    midnight: {
      "--primary": "220 90% 60%", "--accent": "40 95% 55%",
      "--background": "230 30% 5%", "--card": "230 25% 8%", "--border": "230 20% 15%",
      "--gradient-primary": "linear-gradient(135deg, hsl(220 90% 60%), hsl(250 80% 65%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(40 95% 55%), hsl(30 90% 50%))",
      "--theme-pattern": "radial-gradient(1px 1px at 10% 20%, hsl(220 90% 80% / 0.3), transparent), radial-gradient(1px 1px at 70% 30%, hsl(220 90% 80% / 0.25), transparent)",
    },
    ocean: {
      "--primary": "195 90% 50%", "--accent": "160 70% 45%",
      "--background": "200 30% 6%", "--card": "200 25% 9%", "--border": "200 20% 16%",
      "--gradient-primary": "linear-gradient(135deg, hsl(195 90% 50%), hsl(210 85% 55%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(160 70% 45%), hsl(180 75% 50%))",
      "--theme-pattern": "repeating-linear-gradient(175deg, transparent, transparent 80px, hsl(195 90% 50% / 0.02) 80px, hsl(195 90% 50% / 0.02) 82px)",
    },
    sunset: {
      "--primary": "15 90% 55%", "--accent": "45 95% 55%",
      "--background": "15 20% 6%", "--card": "15 15% 9%", "--border": "15 12% 18%",
      "--gradient-primary": "linear-gradient(135deg, hsl(15 90% 55%), hsl(350 80% 55%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(45 95% 55%), hsl(30 90% 50%))",
      "--theme-pattern": "linear-gradient(180deg, hsl(15 90% 55% / 0.03) 0%, transparent 30%, transparent 70%, hsl(45 95% 55% / 0.02) 100%)",
    },
    forest: {
      "--primary": "140 70% 45%", "--accent": "80 60% 50%",
      "--background": "150 25% 5%", "--card": "150 20% 8%", "--border": "150 15% 16%",
      "--gradient-primary": "linear-gradient(135deg, hsl(140 70% 45%), hsl(160 65% 40%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(80 60% 50%), hsl(100 55% 45%))",
      "--theme-pattern": "radial-gradient(ellipse at 20% 50%, hsl(140 70% 45% / 0.04) 0%, transparent 60%)",
    },
    lavender: {
      "--primary": "270 70% 65%", "--accent": "200 70% 60%",
      "--background": "260 20% 7%", "--card": "260 18% 10%", "--border": "260 14% 18%",
      "--gradient-primary": "linear-gradient(135deg, hsl(270 70% 65%), hsl(290 65% 60%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(200 70% 60%), hsl(220 65% 55%))",
      "--theme-pattern": "radial-gradient(circle at 50% 50%, hsl(270 70% 65% / 0.03) 0%, transparent 70%)",
    },
    crimson: {
      "--primary": "0 85% 55%", "--accent": "180 80% 50%",
      "--background": "230 25% 7%", "--card": "230 20% 10%", "--border": "230 15% 18%",
      "--gradient-primary": "linear-gradient(135deg, hsl(0 85% 55%), hsl(0 70% 45%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(180 80% 50%), hsl(200 80% 55%))",
      "--theme-pattern": "none",
    },
    arctic: {
      "--primary": "200 80% 70%", "--accent": "180 50% 60%",
      "--background": "210 25% 6%", "--card": "210 20% 9%", "--border": "210 15% 17%",
      "--gradient-primary": "linear-gradient(135deg, hsl(200 80% 70%), hsl(220 75% 65%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(180 50% 60%), hsl(195 55% 55%))",
      "--theme-pattern": "radial-gradient(2px 2px at 25% 30%, hsl(200 80% 90% / 0.15), transparent), radial-gradient(1.5px 1.5px at 75% 60%, hsl(200 80% 90% / 0.1), transparent)",
    },
    ember: {
      "--primary": "25 95% 55%", "--accent": "0 80% 55%",
      "--background": "20 25% 5%", "--card": "20 20% 8%", "--border": "20 15% 16%",
      "--gradient-primary": "linear-gradient(135deg, hsl(25 95% 55%), hsl(15 90% 50%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(0 80% 55%), hsl(345 75% 50%))",
      "--theme-pattern": "radial-gradient(ellipse at 50% 100%, hsl(25 95% 55% / 0.05) 0%, transparent 60%)",
    },
    "anime-dark": {
      "--primary": "270 80% 60%", "--accent": "350 90% 60%",
      "--background": "260 30% 4%", "--card": "260 25% 7%", "--border": "260 20% 14%",
      "--gradient-primary": "linear-gradient(135deg, hsl(270 80% 60%), hsl(300 70% 55%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(350 90% 60%), hsl(0 85% 55%))",
      "--theme-pattern": "radial-gradient(circle at 10% 90%, hsl(270 80% 60% / 0.06) 0%, transparent 40%)",
    },
    "anime-pastel": {
      "--primary": "320 60% 70%", "--accent": "190 60% 65%",
      "--background": "300 15% 8%", "--card": "300 12% 11%", "--border": "300 10% 18%",
      "--gradient-primary": "linear-gradient(135deg, hsl(320 60% 70%), hsl(280 55% 65%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(190 60% 65%), hsl(170 55% 60%))",
      "--theme-pattern": "radial-gradient(3px 3px at 20% 30%, hsl(320 60% 70% / 0.12), transparent)",
    },
    "anime-retro": {
      "--primary": "20 80% 55%", "--accent": "170 70% 50%",
      "--background": "30 20% 6%", "--card": "30 15% 9%", "--border": "30 12% 17%",
      "--gradient-primary": "linear-gradient(135deg, hsl(20 80% 55%), hsl(35 75% 50%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(170 70% 50%), hsl(185 65% 45%))",
      "--theme-pattern": "repeating-linear-gradient(45deg, transparent, transparent 30px, hsl(20 80% 55% / 0.02) 30px, hsl(20 80% 55% / 0.02) 31px)",
    },
    dragon: {
      "--primary": "0 90% 50%", "--accent": "45 100% 50%",
      "--background": "0 20% 5%", "--card": "0 15% 8%", "--border": "0 12% 16%",
      "--gradient-primary": "linear-gradient(135deg, hsl(0 90% 50%), hsl(15 85% 45%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(45 100% 50%), hsl(35 95% 45%))",
      "--theme-pattern": "radial-gradient(ellipse at 30% 70%, hsl(0 90% 50% / 0.06) 0%, transparent 50%)",
    },
    galaxy: {
      "--primary": "260 80% 65%", "--accent": "200 90% 60%",
      "--background": "250 30% 4%", "--card": "250 25% 7%", "--border": "250 20% 14%",
      "--gradient-primary": "linear-gradient(135deg, hsl(260 80% 65%), hsl(280 75% 60%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(200 90% 60%), hsl(220 85% 55%))",
      "--theme-pattern": "radial-gradient(1px 1px at 5% 15%, hsl(0 0% 100% / 0.4), transparent), radial-gradient(1px 1px at 50% 55%, hsl(0 0% 100% / 0.35), transparent), radial-gradient(2px 2px at 60% 85%, hsl(200 90% 60% / 0.4), transparent)",
    },
    bloodmoon: {
      "--primary": "0 80% 45%", "--accent": "30 70% 45%",
      "--background": "0 25% 4%", "--card": "0 20% 7%", "--border": "0 15% 15%",
      "--gradient-primary": "linear-gradient(135deg, hsl(0 80% 45%), hsl(345 75% 40%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(30 70% 45%), hsl(15 65% 40%))",
      "--theme-pattern": "radial-gradient(circle at 80% 20%, hsl(0 80% 45% / 0.08) 0%, transparent 40%)",
    },
    phantom: {
      "--primary": "240 60% 55%", "--accent": "300 50% 50%",
      "--background": "240 25% 5%", "--card": "240 20% 8%", "--border": "240 15% 15%",
      "--gradient-primary": "linear-gradient(135deg, hsl(240 60% 55%), hsl(260 55% 50%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(300 50% 50%), hsl(280 45% 45%))",
      "--theme-pattern": "linear-gradient(180deg, hsl(240 60% 55% / 0.04) 0%, transparent 20%, transparent 80%, hsl(300 50% 50% / 0.03) 100%)",
    },
    jade: {
      "--primary": "160 80% 40%", "--accent": "120 60% 45%",
      "--background": "160 25% 5%", "--card": "160 20% 8%", "--border": "160 15% 15%",
      "--gradient-primary": "linear-gradient(135deg, hsl(160 80% 40%), hsl(180 75% 35%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(120 60% 45%), hsl(140 55% 40%))",
      "--theme-pattern": "radial-gradient(ellipse at 30% 50%, hsl(160 80% 40% / 0.05) 0%, transparent 50%)",
    },
    "violet-storm": {
      "--primary": "280 90% 60%", "--accent": "190 80% 55%",
      "--background": "270 30% 5%", "--card": "270 25% 8%", "--border": "270 20% 15%",
      "--gradient-primary": "linear-gradient(135deg, hsl(280 90% 60%), hsl(300 85% 55%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(190 80% 55%), hsl(210 75% 50%))",
      "--theme-pattern": "repeating-linear-gradient(135deg, transparent, transparent 60px, hsl(280 90% 60% / 0.02) 60px, hsl(280 90% 60% / 0.02) 62px)",
    },
    "golden-hour": {
      "--primary": "40 90% 50%", "--accent": "20 85% 55%",
      "--background": "35 20% 5%", "--card": "35 15% 8%", "--border": "35 12% 16%",
      "--gradient-primary": "linear-gradient(135deg, hsl(40 90% 50%), hsl(50 85% 45%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(20 85% 55%), hsl(10 80% 50%))",
      "--theme-pattern": "linear-gradient(135deg, hsl(40 90% 50% / 0.04) 0%, transparent 40%, transparent 60%, hsl(20 85% 55% / 0.03) 100%)",
    },
  };

  if (theme === "custom" && customColors) {
    const c = customColors;
    const vars: Record<string, string> = {
      "--primary": c.primary,
      "--accent": c.accent,
      "--background": c.background,
      "--card": c.card,
      "--border": c.border,
      "--gradient-primary": `linear-gradient(135deg, hsl(${c.primary}), hsl(${c.accent}))`,
      "--gradient-accent": `linear-gradient(135deg, hsl(${c.accent}), hsl(${c.primary}))`,
      "--theme-pattern": "none",
    };
    Object.entries(vars).forEach(([k, v]) => root.setProperty(k, v));
  } else {
    const vars = themes[theme] || themes.classic;
    Object.entries(vars).forEach(([k, v]) => root.setProperty(k, v));
  }
  document.documentElement.setAttribute("data-theme", theme);
}
