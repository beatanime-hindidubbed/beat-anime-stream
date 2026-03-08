import { Link } from "react-router-dom";
import { Send } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Footer() {
  const { settings } = useSiteSettings();

  return (
    <footer className="border-t border-border mt-12 sm:mt-16">
      <div className="container py-6 sm:py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-center">
          {/* Brand */}
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center">
              <span className="font-display font-bold text-primary-foreground text-xs">
                {settings.siteIcon || "B"}
              </span>
            </div>
            <span className="font-display font-bold text-foreground text-sm sm:text-base">
              {settings.siteName || "Beat Anistream"}
            </span>
          </div>

          {/* Telegram links */}
          <div className="flex items-center gap-4 justify-center">
            {settings.telegramChannel && (
              <a
                href={settings.telegramChannel}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Channel
              </a>
            )}
            {settings.telegramGroup && (
              <a
                href={settings.telegramGroup}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Discussion
              </a>
            )}
          </div>

          {/* Policy links */}
          <div className="flex items-center gap-3 sm:gap-4 text-[11px] sm:text-xs text-muted-foreground justify-center lg:justify-end flex-wrap">
            <Link to="/policy/dmca" className="hover:text-primary transition-colors">
              DMCA
            </Link>
            <Link to="/policy/privacy" className="hover:text-primary transition-colors">
              Privacy
            </Link>
            <Link to="/policy/terms" className="hover:text-primary transition-colors">
              Terms
            </Link>
          </div>
        </div>

        <p className="text-[10px] sm:text-xs text-muted-foreground text-center mt-4">
          © {new Date().getFullYear()} {settings.siteName || "Beat Anistream"} — For educational purposes only.
        </p>
      </div>
    </footer>
  );
}
