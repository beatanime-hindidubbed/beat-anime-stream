import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ThemeType = "classic" | "cyberpunk" | "neon" | "sakura" | "minimal";
export type AccessLevel = "all" | "logged-in" | "premium";

export interface SiteSettings {
  siteName: string;
  siteIcon: string;
  theme: ThemeType;
  errorGif: string;
  loadingGif: string;
  dmcaContent: string;
  privacyContent: string;
  termsContent: string;
  telegramChannel: string;
  telegramGroup: string;
  hiddenAnimes: string[];
  failCountThreshold: number;
  downloadAccess: AccessLevel;
  bulkDownloadAccess: AccessLevel;
  apiPool: string[];
}

const DEFAULTS: SiteSettings = {
  siteName: "Beat Anistream",
  siteIcon: "B",
  theme: "classic",
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
  failCountThreshold: 5,
  downloadAccess: "logged-in",
  bulkDownloadAccess: "premium",
  apiPool: [
    "https://beat-anime-api.onrender.com/api/v1",
    "https://beat-anime-api-2.onrender.com/api/v1",
    "https://beat-anime-api-3.onrender.com/api/v1",
    "https://beat-anime-api-4.onrender.com/api/v1",
  ],
};

interface SiteSettingsCtx {
  settings: SiteSettings;
  updateSettings: (partial: Partial<SiteSettings>) => Promise<void>;
  reportAnimeFail: (animeId: string) => void;
  isHidden: (animeId: string) => boolean;
  addApi: (url: string) => Promise<void>;
  removeApi: (url: string) => Promise<void>;
}

const Ctx = createContext<SiteSettingsCtx>({
  settings: DEFAULTS,
  updateSettings: async () => {},
  reportAnimeFail: () => {},
  isHidden: () => false,
  addApi: async () => {},
  removeApi: async () => {},
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
    applyTheme(settings.theme);
  }, [settings.theme]);

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
    (animeId: string) => (settings.hiddenAnimes || []).includes(animeId),
    [settings.hiddenAnimes]
  );

  const addApi = useCallback(
    async (url: string) => {
      const pool = [...(settings.apiPool || [])];
      if (!pool.includes(url)) {
        pool.push(url);
        await updateSettings({ apiPool: pool });
      }
    },
    [settings, updateSettings]
  );

  const removeApi = useCallback(
    async (url: string) => {
      const pool = (settings.apiPool || []).filter((api) => api !== url);
      await updateSettings({ apiPool: pool });
    },
    [settings, updateSettings]
  );

  return (
    <Ctx.Provider value={{ settings, updateSettings, reportAnimeFail, isHidden, addApi, removeApi }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSiteSettings() {
  return useContext(Ctx);
}

function applyTheme(theme: ThemeType) {
  const root = document.documentElement.style;
  const themes: Record<ThemeType, Record<string, string>> = {
    classic: {
      "--primary": "175 80% 50%",
      "--accent": "330 70% 55%",
      "--background": "220 20% 7%",
      "--card": "220 18% 10%",
      "--border": "220 15% 18%",
      "--gradient-primary": "linear-gradient(135deg, hsl(175 80% 50%), hsl(200 80% 55%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(330 70% 55%), hsl(280 60% 55%))",
    },
    cyberpunk: {
      "--primary": "60 100% 50%",
      "--accent": "300 100% 60%",
      "--background": "220 30% 4%",
      "--card": "220 25% 7%",
      "--border": "220 20% 14%",
      "--gradient-primary": "linear-gradient(135deg, hsl(60 100% 50%), hsl(40 100% 55%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(300 100% 60%), hsl(260 100% 65%))",
    },
    neon: {
      "--primary": "165 100% 50%",
      "--accent": "280 100% 65%",
      "--background": "230 25% 5%",
      "--card": "230 20% 8%",
      "--border": "230 15% 18%",
      "--gradient-primary": "linear-gradient(135deg, hsl(165 100% 50%), hsl(200 100% 55%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(280 100% 65%), hsl(320 100% 60%))",
    },
    sakura: {
      "--primary": "340 80% 65%",
      "--accent": "20 90% 60%",
      "--background": "330 15% 8%",
      "--card": "330 12% 11%",
      "--border": "330 10% 20%",
      "--gradient-primary": "linear-gradient(135deg, hsl(340 80% 65%), hsl(360 80% 70%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(20 90% 60%), hsl(40 90% 60%))",
    },
    minimal: {
      "--primary": "0 0% 82%",
      "--accent": "0 0% 60%",
      "--background": "0 0% 5%",
      "--card": "0 0% 8%",
      "--border": "0 0% 15%",
      "--gradient-primary": "linear-gradient(135deg, hsl(0 0% 80%), hsl(0 0% 65%))",
      "--gradient-accent": "linear-gradient(135deg, hsl(0 0% 60%), hsl(0 0% 50%))",
    },
  };
  const vars = themes[theme] || themes.classic;
  Object.entries(vars).forEach(([k, v]) => root.setProperty(k, v));
  document.documentElement.setAttribute("data-theme", theme);
}
