import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { lovable } from "@/integrations/lovable";
import { motion } from "framer-motion";
import { Loader2, Eye, EyeOff, Shield, Mail, User, Lock } from "lucide-react";

const RATE_LIMIT_MS = 2000; // 2s between attempts

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [honeypot, setHoneypot] = useState(""); // Bot trap
  const [lastAttempt, setLastAttempt] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const { login, register, user } = useSupabaseAuth();
  const navigate = useNavigate();
  const formStartTime = useRef(Date.now());

  useEffect(() => { formStartTime.current = Date.now(); }, [isRegister]);

  if (user) {
    navigate("/", { replace: true });
    return null;
  }

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  const validateUsername = (u: string) => /^[a-zA-Z0-9_]{3,20}$/.test(u);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccessMsg("");

    // Honeypot check (bots fill hidden fields)
    if (honeypot) return;

    // Time-based bot detection — form filled too fast (only for register)
    if (isRegister && Date.now() - formStartTime.current < 800) {
      setError("Please take your time filling the form");
      return;
    }

    // Rate limiting
    if (Date.now() - lastAttempt < RATE_LIMIT_MS) {
      setError("Too fast! Please wait a moment.");
      return;
    }

    // Max attempts
    if (attempts >= 8) {
      setError("Too many attempts. Please try again later.");
      return;
    }

    if (!email || !password) { setError("Email and password are required"); return; }
    if (!validateEmail(email)) { setError("Please enter a valid email address"); return; }
    if (isRegister && !username) { setError("Username is required"); return; }
    if (isRegister && !validateUsername(username)) {
      setError("Username: 3-20 chars, letters/numbers/underscores only");
      return;
    }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }

    setLastAttempt(Date.now());
    setAttempts(a => a + 1);
    setLoading(true);

    if (isRegister) {
      const result = await register(email, password, username);
      setLoading(false);
      if (result.error) { setError(result.error); }
      else { setSuccessMsg("Account created! Check your email to verify, then log in."); }
    } else {
      const result = await login(email, password);
      setLoading(false);
      if (result.error) { setError(result.error); }
      else { navigate("/"); }
    }
  };

  const handleGoogleLogin = async () => {
    if (honeypot) return;
    setGoogleLoading(true); setError("");
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) setError(result.error.message || "Google login failed");
    } catch (err: any) {
      setError(err?.message || "Google login failed");
    } finally { setGoogleLoading(false); }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
            <span className="font-display font-bold text-primary-foreground text-2xl sm:text-3xl">B</span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">
            {isRegister ? "Create Account" : "Welcome Back"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {isRegister ? "Join Beat Anistream" : "Login to your account"}
          </p>
        </div>

        {/* Google Login */}
        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          className="w-full h-11 sm:h-12 rounded-xl bg-secondary text-sm font-medium text-foreground border border-border hover:bg-secondary/80 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mb-4 disabled:opacity-50"
        >
          {googleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          Continue with Google
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          {/* Honeypot — invisible to users, bots fill it */}
          <input
            type="text"
            name="website"
            value={honeypot}
            onChange={e => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0 }}
          />

          {error && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="text-sm text-destructive text-center bg-destructive/10 rounded-xl py-2.5 px-3">{error}</motion.p>
          )}
          {successMsg && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="text-center bg-accent/10 rounded-xl py-3 px-3 space-y-1">
              <Mail className="w-8 h-8 text-accent mx-auto" />
              <p className="text-sm text-accent font-medium">{successMsg}</p>
              <p className="text-[11px] text-muted-foreground">Check your spam folder too!</p>
            </motion.div>
          )}

          {isRegister && (
            <div>
              <label className="text-xs sm:text-sm text-muted-foreground block mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                className="w-full h-11 sm:h-12 px-3 rounded-xl bg-secondary text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                placeholder="your_username"
                maxLength={20}
              />
              {username && !validateUsername(username) && (
                <p className="text-[10px] text-destructive mt-0.5">3-20 chars, letters/numbers/underscores</p>
              )}
            </div>
          )}

          <div>
            <label className="text-xs sm:text-sm text-muted-foreground block mb-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full h-11 sm:h-12 px-3 rounded-xl bg-secondary text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="text-xs sm:text-sm text-muted-foreground block mb-1 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full h-11 sm:h-12 px-3 pr-10 rounded-xl bg-secondary text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                placeholder="••••••••"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {password && password.length < 6 && (
              <p className="text-[10px] text-destructive mt-0.5">Min 6 characters</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || attempts >= 8}
            className="w-full h-11 sm:h-12 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-primary/20"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isRegister ? "Create Account" : "Sign In"}
          </button>
        </form>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-1.5 mt-3 text-[10px] text-muted-foreground">
          <Shield className="w-3 h-3" /> Protected by anti-spam system
        </div>

        <p className="text-xs sm:text-sm text-muted-foreground text-center mt-4">
          {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
          <button onClick={() => { setIsRegister(!isRegister); setError(""); setSuccessMsg(""); setAttempts(0); }}
            className="text-primary hover:underline font-medium">
            {isRegister ? "Sign In" : "Create Account"}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
