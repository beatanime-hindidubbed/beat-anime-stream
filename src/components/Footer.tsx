import { Send } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-border mt-16">
      <div className="container py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center">
              <span className="font-display font-bold text-primary-foreground text-xs">B</span>
            </div>
            <span className="font-display font-bold text-foreground">Beat Anistream</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://t.me/beatanime" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
              <Send className="w-4 h-4" /> Channel
            </a>
            <a href="https://t.me/beat_discussion_group" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
              <Send className="w-4 h-4" /> Discussion
            </a>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Beat Anistream</p>
        </div>
      </div>
    </footer>
  );
}
