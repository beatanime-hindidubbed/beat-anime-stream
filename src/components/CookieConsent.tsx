import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Cookie, Shield, BarChart3, Settings2, UserCheck, Target } from "lucide-react";

const COOKIE_KEY = "beat-cookie-consent";

interface CookiePrefs {
  necessary: boolean;
  performance: boolean;
  functional: boolean;
  personalisation: boolean;
  targeting: boolean;
  acceptedAt: number;
}

const CATEGORIES = [
  {
    key: "necessary" as const,
    label: "Strictly Necessary Cookies",
    icon: Shield,
    locked: true,
    description: "These cookies are essential for AniStream to function and cannot be switched off. They are set in response to actions you take such as logging in, setting your privacy preferences, or filling in forms. You can set your browser to block these cookies, but some parts of the site will not work.",
  },
  {
    key: "performance" as const,
    label: "Performance & Analytics Cookies",
    icon: BarChart3,
    locked: false,
    description: "These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site. They help us understand which pages are the most and least popular and see how visitors move around the site. All information these cookies collect is aggregated and anonymous.",
  },
  {
    key: "functional" as const,
    label: "Functional / Preference Cookies",
    icon: Settings2,
    locked: false,
    description: "These cookies enable AniStream to provide enhanced functionality and personalisation such as remembering your language, region, theme preference, volume level, playback quality, and continue watching progress. They may be set by us or by third-party providers whose services we have added to our pages.",
  },
  {
    key: "personalisation" as const,
    label: "Personalisation Cookies",
    icon: UserCheck,
    locked: false,
    description: "These cookies are used by AniStream to build a profile of your interests and recommend content you are more likely to enjoy. They remember what you have watched, searched for, and how long you spent on each title. This helps us show you relevant recommendations and a more personalised experience.",
  },
  {
    key: "targeting" as const,
    label: "Targeting & Analytics Cookies",
    icon: Target,
    locked: false,
    description: "These cookies may be set through our site by our analytics partners. They may be used to build a profile of your interests, understand how you use our platform across sessions, and help us improve our services. They do not store directly personal information but are based on uniquely identifying your browser and device.",
  },
];

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [prefs, setPrefs] = useState<CookiePrefs>({
    necessary: true,
    performance: true,
    functional: true,
    personalisation: true,
    targeting: true,
    acceptedAt: 0,
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COOKIE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.acceptedAt) return; // already accepted
      }
    } catch {}
    setVisible(true);
  }, []);

  const acceptAll = () => {
    const consent: CookiePrefs = { ...prefs, necessary: true, performance: true, functional: true, personalisation: true, targeting: true, acceptedAt: Date.now() };
    localStorage.setItem(COOKIE_KEY, JSON.stringify(consent));
    setVisible(false);
  };

  const confirmChoices = () => {
    const consent: CookiePrefs = { ...prefs, necessary: true, acceptedAt: Date.now() };
    localStorage.setItem(COOKIE_KEY, JSON.stringify(consent));
    setVisible(false);
    setShowManage(false);
  };

  const togglePref = (key: keyof CookiePrefs) => {
    if (key === "necessary" || key === "acceptedAt") return;
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

  if (!visible) return null;

  return (
    <>
      {/* Main popup */}
      <AnimatePresence>
        {!showManage && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[420px] z-[100] bg-card border border-border rounded-2xl shadow-card p-6"
          >
            <div className="flex items-start gap-3 mb-4">
              <Cookie className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display font-bold text-foreground text-base mb-1">We value your privacy</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  We use cookies and similar technologies to enhance your experience, analyse site usage, remember your preferences, and recommend anime you'll love. By clicking 'Accept All', you agree to our use of cookies for personalisation and analytics. You can manage your preferences at any time.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={acceptAll}
                className="flex-1 py-2.5 rounded-lg bg-gradient-primary text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Accept All
              </button>
              <button
                onClick={() => setShowManage(true)}
                className="flex-1 py-2.5 rounded-lg bg-secondary text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                Manage Preferences
              </button>
            </div>
            <a href="/policy/cookies" className="block text-center text-[10px] text-muted-foreground mt-3 hover:text-primary">
              Cookie Policy
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manage preferences modal */}
      <AnimatePresence>
        {showManage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg max-h-[85vh] bg-card border border-border rounded-2xl shadow-card overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-5 border-b border-border">
                <h2 className="font-display font-bold text-foreground text-lg">Cookie Preferences</h2>
                <button onClick={() => setShowManage(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isOn = prefs[cat.key];
                  return (
                    <div key={cat.key} className="border border-border rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-primary" />
                          <span className="font-display font-semibold text-foreground text-sm">{cat.label}</span>
                        </div>
                        {cat.locked ? (
                          <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded">Always On</span>
                        ) : (
                          <button
                            onClick={() => togglePref(cat.key)}
                            className={`w-10 h-5 rounded-full transition-colors flex items-center ${isOn ? "bg-primary justify-end" : "bg-muted justify-start"}`}
                          >
                            <span className="w-4 h-4 rounded-full bg-foreground mx-0.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{cat.description}</p>
                    </div>
                  );
                })}
              </div>
              <div className="p-5 border-t border-border">
                <button
                  onClick={confirmChoices}
                  className="w-full py-2.5 rounded-lg bg-gradient-primary text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Confirm My Choices
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
