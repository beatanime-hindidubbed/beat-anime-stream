import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { motion } from "framer-motion";
import { ExternalLink, Clock, Shield } from "lucide-react";

export default function SandboxRedirect() {
  const [params] = useSearchParams();
  const targetUrl = params.get("url") || "";
  const label = params.get("label") || "External Link";
  const countdown = parseInt(params.get("t") || "5");
  const navigate = useNavigate();
  const { settings } = useSiteSettings();
  const [timer, setTimer] = useState(countdown);
  const [adDismissed, setAdDismissed] = useState(false);

  useEffect(() => {
    if (!adDismissed) return;
    if (timer <= 0) {
      window.location.href = targetUrl;
      return;
    }
    const interval = setInterval(() => setTimer(t => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer, targetUrl, adDismissed]);

  if (!targetUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Invalid redirect link.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Ad overlay gate */}
      {!adDismissed && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg p-8 rounded-2xl bg-card border border-border shadow-2xl text-center space-y-6"
        >
          <div className="w-16 h-16 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            {settings.siteName || "Beat Anistream"}
          </h1>
          <p className="text-sm text-muted-foreground">
            You are being redirected to an external page. Please wait for the ad to complete.
          </p>
          
          {/* Placeholder ad area */}
          <div className="w-full h-32 rounded-xl bg-secondary/50 border border-border flex items-center justify-center">
            <span className="text-xs text-muted-foreground">Advertisement</span>
          </div>

          <button
            onClick={() => setAdDismissed(true)}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Continue to {label}
          </button>
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Go back
          </button>
        </motion.div>
      )}

      {/* Countdown screen */}
      {adDismissed && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 rounded-2xl bg-card border border-border shadow-2xl text-center space-y-6"
        >
          <div className="w-20 h-20 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
            <Clock className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-xl font-display font-bold text-foreground">Redirecting...</h2>
          
          {/* Countdown circle */}
          <div className="relative w-24 h-24 mx-auto">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
              <circle
                cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--primary))" strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(timer / countdown) * 283} 283`}
                className="transition-all duration-1000"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-3xl font-display font-bold text-primary">
              {timer}
            </span>
          </div>

          <p className="text-sm text-muted-foreground">
            You will be redirected to <strong className="text-foreground">{label}</strong> in {timer} seconds.
          </p>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ExternalLink className="w-3 h-3" />
            <span className="truncate max-w-[250px]">{targetUrl}</span>
          </div>

          {timer <= 0 && (
            <a href={targetUrl} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm">
              <ExternalLink className="w-4 h-4" /> Open Now
            </a>
          )}
        </motion.div>
      )}
    </div>
  );
}
