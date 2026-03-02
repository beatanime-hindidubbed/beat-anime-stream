import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, CheckCircle, AlertCircle, Loader2, Smartphone } from "lucide-react";

const VERIFY_KEY = "beat-verified";
const BOT_PROXY = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-proxy`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function getDeviceId(): string {
  let id = localStorage.getItem("beat-device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("beat-device-id", id);
  }
  return id;
}

interface VerifyState {
  verified: boolean;
  telegramId?: string;
  devicesUsed?: number;
  devicesMax?: number;
  code?: string;
  verifiedAt?: number;
}

export function isVerified(): boolean {
  try {
    const raw = localStorage.getItem(VERIFY_KEY);
    if (!raw) return false;
    const state: VerifyState = JSON.parse(raw);
    return !!state.verified;
  } catch { return false; }
}

export default function VerifyPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [verifyState, setVerifyState] = useState<VerifyState | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VERIFY_KEY);
      if (raw) {
        const state = JSON.parse(raw);
        if (state.verified) { setVerifyState(state); setSuccess(true); }
      }
    } catch {}
  }, []);

  const handleVerify = async () => {
    if (code.length !== 6) { setError("Enter a 6-digit code"); return; }
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${BOT_PROXY}?action=verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
        body: JSON.stringify({ code, device_id: getDeviceId(), force: true }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || data.message || "Verification failed");
        return;
      }

      const state: VerifyState = {
        verified: true,
        telegramId: data.telegram_id || data.telegramId,
        devicesUsed: data.devices_used || data.devicesUsed || 1,
        devicesMax: data.devices_max || data.devicesMax || 2,
        code,
        verifiedAt: Date.now(),
      };
      localStorage.setItem(VERIFY_KEY, JSON.stringify(state));
      setVerifyState(state);
      setSuccess(true);
    } catch (err: any) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success && verifyState) {
    return (
      <div className="container max-w-md py-20">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-border rounded-2xl p-8 text-center">
          <CheckCircle className="w-16 h-16 text-accent mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">Verified!</h1>
          <p className="text-muted-foreground text-sm mb-4">Your device is verified and linked.</p>
          <div className="bg-secondary rounded-lg p-4 text-left text-sm space-y-2">
            <div className="flex justify-between"><span className="text-muted-foreground">Devices</span><span className="text-foreground">{verifyState.devicesUsed}/{verifyState.devicesMax}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Code</span><span className="text-foreground font-mono">{verifyState.code}</span></div>
          </div>
          <a href="/" className="inline-block mt-6 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity">
            Start Watching
          </a>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="container max-w-md py-20">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-8">
        <div className="text-center mb-8">
          <Shield className="w-12 h-12 text-primary mx-auto mb-3" />
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">Verify Your Device</h1>
          <p className="text-muted-foreground text-sm">
            Enter the 6-digit code from our{" "}
            <a href="https://t.me/beatanime" target="_blank" rel="noopener" className="text-accent hover:underline">
              Telegram Bot
            </a>
          </p>
        </div>

        <div className="flex gap-2 justify-center mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-11 h-14 rounded-lg border-2 flex items-center justify-center text-xl font-bold font-mono transition-colors ${
                code[i] ? "border-primary text-foreground bg-secondary" : "border-border text-muted-foreground"
              }`}
            >
              {code[i] || "·"}
            </div>
          ))}
        </div>

        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="w-full h-12 text-center text-lg font-mono rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary mb-4"
          placeholder="000000"
          autoFocus
        />

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm mb-4">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <button
          onClick={handleVerify}
          disabled={loading || code.length !== 6}
          className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</> : "Verify Device"}
        </button>

        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Smartphone className="w-4 h-4" />
          <span>Max 2 devices per code. 3rd device kicks oldest.</span>
        </div>
      </motion.div>
    </div>
  );
}
