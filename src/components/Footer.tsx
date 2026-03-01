import { Link } from "react-router-dom";
import { Send } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Footer() {
  const { settings } = useSiteSettings();

  return (
    <footer className="border-t border-border mt-16">
      <div className="container py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center">
              <span className="font-display font-bold text-primary-foreground text-xs">
                {settings.siteIcon || "B"}
              </span>
            </div>
            <span className="font-display font-bold text-foreground">
              {settings.siteName || "Beat Anistream"}
            </span>
          </div>

          {/* Telegram links */}
          <div className="flex items-center gap-4">
            {settings.telegramChannel && (
              <a
                href={settings.telegramChannel}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <Send className="w-4 h-4" /> Channel
              </a>
            )}
            {settings.telegramGroup && (
              <a
                href={settings.telegramGroup}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <Send className="w-4 h-4" /> Discussion
              </a>
            )}
          </div>

          {/* Policy links */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/policy/dmca" className="hover:text-primary transition-colors">
              DMCA
            </Link>
            <Link to="/policy/privacy" className="hover:text-primary transition-colors">
              Privacy Policy
            </Link>
            <Link to="/policy/terms" className="hover:text-primary transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          © {new Date().getFullYear()} {settings.siteName || "Beat Anistream"} — For educational purposes only.
        </p>
      </div>
    </footer>
  );
}
