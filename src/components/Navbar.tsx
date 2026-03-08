import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Search, Menu, X, User, LogOut, BookmarkPlus, Send, Mic, MicOff } from "lucide-react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { api, AnimeItem } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import UserSettingsPanel from "@/components/UserSettingsPanel";

export default function Navbar() {
  const { user, logout } = useSupabaseAuth();
  const { settings } = useSiteSettings();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AnimeItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const startVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      navigate(`/search?q=${encodeURIComponent(transcript)}`);
      setListening(false);
      setMobileSearch(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
    recognitionRef.current = recognition;
  };

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const displayName = user?.user_metadata?.username || user?.email?.split("@")[0] || "User";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMobileMenu(false);
    setMobileSearch(false);
    setUserMenu(false);
  }, []);

  const handleSearch = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.searchSuggestions(val);
        setSuggestions(res.suggestions?.slice(0, 6) || []);
        setShowSuggestions(true);
      } catch { setSuggestions([]); }
    }, 300);
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setShowSuggestions(false);
      setMobileMenu(false);
      setMobileSearch(false);
    }
  };

  const navLinks = [
    { to: "/", label: "Home" },
    { to: "/hindi", label: "Hindi" },
    { to: "/manhwa", label: "Manhwa" },
    { to: "/explore", label: "Explore" },
    { to: "/recent", label: "Recent" },
    { to: "/schedule", label: "Schedule" },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
            <span className="font-display font-bold text-primary-foreground text-sm">
              {settings.siteIcon || "B"}
            </span>
          </div>
          <span className="font-display font-bold text-base sm:text-lg hidden xs:block">
            <span className="text-gradient">{settings.siteName || "Beat Anistream"}</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-5">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="relative text-sm text-muted-foreground hover:text-primary transition-all duration-200 font-body py-1 after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-primary after:scale-x-0 after:origin-left after:transition-transform after:duration-300 hover:after:scale-x-100"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Desktop Search */}
        <div ref={searchRef} className="relative hidden md:block flex-1 max-w-sm">
          <form onSubmit={submitSearch}>
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search anime..."
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                className="w-full h-9 pl-9 pr-10 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary font-body"
              />
              <button
                type="button"
                onClick={listening ? stopVoice : startVoice}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${
                  listening ? "text-destructive animate-pulse" : "text-muted-foreground hover:text-primary"
                }`}
                title={listening ? "Stop listening" : "Voice search"}
              >
                {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>
          </form>
          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full mt-1 w-full bg-card border border-border rounded-lg shadow-card overflow-hidden z-50"
              >
                {suggestions.map((s) => (
                  <Link
                    key={s.id}
                    to={`/anime/${s.id}`}
                    onClick={() => { setShowSuggestions(false); setQuery(""); }}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-secondary transition-colors"
                  >
                    {s.poster && (
                      <img src={s.poster} alt={s.name} className="w-10 h-14 object-cover rounded" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-foreground line-clamp-1 font-body">{s.name}</p>
                      {s.jname && <p className="text-xs text-muted-foreground line-clamp-1">{s.jname}</p>}
                    </div>
                  </Link>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Mobile search toggle */}
          <button
            onClick={() => setMobileSearch(!mobileSearch)}
            className="md:hidden p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all duration-200"
          >
            <Search className="w-5 h-5" />
          </button>

          {settings.telegramChannel && (
            <a
              href={settings.telegramChannel}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all duration-200"
              title="Telegram"
            >
              <Send className="w-4 h-4" />
            </a>
          )}

          {/* User Settings */}
          <UserSettingsPanel />

          {user ? (
            <div className="relative">
              <button
                onClick={() => setUserMenu(!userMenu)}
                className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-secondary text-sm text-foreground hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/20 transition-all duration-200 font-body"
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline max-w-[80px] truncate">{displayName}</span>
              </button>
              <AnimatePresence>
                {userMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-card overflow-hidden z-50"
                  >
                    <Link
                      to="/watchlist"
                      onClick={() => setUserMenu(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                    >
                      <BookmarkPlus className="w-4 h-4" /> Watchlist
                    </Link>
                    <button
                      onClick={() => { logout(); setUserMenu(false); }}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-secondary transition-colors w-full"
                    >
                      <LogOut className="w-4 h-4" /> Logout
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link
              to="/login"
              className="px-3 sm:px-4 py-1.5 rounded-lg bg-gradient-primary text-xs sm:text-sm font-medium text-primary-foreground hover:shadow-glow hover:scale-105 transition-all duration-200"
            >
              Login
            </Link>
          )}

          <button
            onClick={() => { setMobileMenu(!mobileMenu); setMobileSearch(false); }}
            className="lg:hidden p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all duration-200"
          >
            {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile search bar */}
      <AnimatePresence>
        {mobileSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden border-t border-border"
          >
            <div className="container py-3">
              <form onSubmit={submitSearch}>
                <div className="relative flex items-center">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search anime..."
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    autoFocus
                    className="w-full h-10 pl-9 pr-10 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary font-body"
                  />
                  <button
                    type="button"
                    onClick={listening ? stopVoice : startVoice}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors ${
                      listening ? "text-destructive animate-pulse" : "text-muted-foreground hover:text-primary"
                    }`}
                  >
                    {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>
              </form>
              {/* Mobile suggestions */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="mt-2 bg-card border border-border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  {suggestions.map((s) => (
                    <Link
                      key={s.id}
                      to={`/anime/${s.id}`}
                      onClick={() => { setShowSuggestions(false); setQuery(""); setMobileSearch(false); }}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary transition-colors"
                    >
                      {s.poster && (
                        <img src={s.poster} alt={s.name} className="w-9 h-12 object-cover rounded" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-foreground line-clamp-1">{s.name}</p>
                        {s.jname && <p className="text-xs text-muted-foreground line-clamp-1">{s.jname}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile nav menu */}
      <AnimatePresence>
        {mobileMenu && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="lg:hidden overflow-hidden border-t border-border"
          >
            <div className="container py-3 space-y-1">
              {navLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setMobileMenu(false)}
                  className="flex items-center h-10 text-sm text-muted-foreground hover:text-primary transition-colors font-body px-2 rounded-lg hover:bg-secondary/50"
                >
                  {l.label}
                </Link>
              ))}
              {settings.telegramChannel && (
                <a
                  href={settings.telegramChannel}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 h-10 text-sm text-muted-foreground hover:text-primary transition-colors px-2 rounded-lg hover:bg-secondary/50"
                >
                  <Send className="w-4 h-4" /> Telegram
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
