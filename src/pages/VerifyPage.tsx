// src/pages/VerifyPage.tsx
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  CheckCircle,
  AlertCircle,
  Loader2,
  Smartphone,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const VERIFY_KEY = "beat-verified";
// Correct edge function endpoint as per spec
const VERIFY_FUNCTION = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-proxy`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface VerifyState {
  verified: boolean;
  telegramId?: string;
  devicesUsed?: number;
  devicesMax?: number;
  code?: string;
  verifiedAt: number;
}

export function isVerified(): boolean {
  try {
    const raw = localStorage.getItem(VERIFY_KEY);
    if (!raw) return false;
    const state: VerifyState = JSON.parse(raw);
    return !!state.verified;
  } catch {
    return false;
  }
}

// ── Device ID helper ──────────────────────────────────
// Generates a persistent unique ID for this browser/device.
// Stored in localStorage so it survives page reloads.
// Required by the bot API to track and enforce per-device limits.
function getDeviceId(): string {
  let id = localStorage.getItem("beat-device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("beat-device-id", id);
  }
  return id;
}

export default function VerifyPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [verifyState, setVerifyState] = useState<VerifyState | null>(null);

  // If already verified, show success screen
  useEffect(() => {
    const state = localStorage.getItem(VERIFY_KEY);
    if (state) {
      try {
        const parsed = JSON.parse(state) as VerifyState;
        if (parsed.verified) {
          setVerifyState(parsed);
          setSuccess(true);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError("Enter a 6-digit code");
      return;
    }
    setLoading(true);
    setError("");

    try {
      // Call the edge function with action=verify
      // device_id is required by the bot API — without it the request returns 400
      const res = await fetch(`${VERIFY_FUNCTION}?action=verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
        },
        body: JSON.stringify({
          code,
          device_id: getDeviceId(),   // ← required: identifies this browser/device
          force: true,                // bot always kicks oldest device anyway
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        // Handle specific error types with clear messages
        if (res.status === 404) {
          setError("Verification service not found. Please contact support.");
        } else if (res.status === 401) {
          setError("Configuration error. Please contact support.");
        } else if (data.error === "bot_unavailable") {
          setError("Service temporarily unavailable. Please try again later.");
        } else if (data.reason) {
          setError(data.reason);
        } else {
          setError(data.message || "Verification failed. Check the code and try again.");
        }
        return;
      }

      // Build the verification state from response
      const state: VerifyState = {
        verified: true,
        telegramId: data.telegram_user_id || data.telegramId || data.telegram_id,
        devicesUsed: data.devices_used || data.devicesUsed,
        devicesMax: data.devices_max || data.devicesMax,
        code,
        verifiedAt: Date.now(),
      };
      localStorage.setItem(VERIFY_KEY, JSON.stringify(state));
      setVerifyState(state);
      setSuccess(true);

      // Redirect to home after a short delay
      setTimeout(() => {
        navigate("/");
      }, 1500);
    } catch (err) {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen ──────────────────────────────────
  if (success && verifyState) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-card border border-border rounded-2xl p-8 text-center"
        >
          <CheckCircle className="w-16 h-16 text-accent mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">
            Verified!
          </h1>
          <p className="text-muted-foreground text-sm mb-4">
            Your device is verified and linked.
          </p>
          <div className="bg-secondary rounded-lg p-4 text-left text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Devices</span>
              <span className="text-foreground">
                {verifyState.devicesUsed}/{verifyState.devicesMax}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Code</span>
              <span className="text-foreground font-mono">{verifyState.code}</span>
            </div>
            {verifyState.telegramId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Telegram ID</span>
                <span className="text-foreground font-mono">{verifyState.telegramId}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Redirecting to home...
          </p>
        </motion.div>
      </div>
    );
  }

  // ── Verification form ───────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-card border border-border rounded-2xl p-8"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <Shield className="w-12 h-12 text-primary mx-auto mb-3" />
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">
            Verify Your Device
          </h1>
          <p className="text-muted-foreground text-sm">
            Get your 6-digit code from our Telegram Bot, then enter it below.
          </p>
        </div>

        {/* ── Telegram Bot Button ── */}
        <a
          href="https://t.me/Beat_AniStream_hub_bot"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-3 w-full py-3 mb-6 rounded-xl font-bold text-sm text-white hover:opacity-90 active:scale-95 transition-all duration-150 shadow-md"
          style={{ background: "linear-gradient(135deg, #229ED9 0%, #1a7bbf 100%)" }}
        >
          {/* Telegram SVG icon */}
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 fill-white flex-shrink-0"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.48 14.367l-2.95-.924c-.642-.204-.657-.642.136-.953l11.57-4.461c.537-.194 1.006.131.326.219z" />
          </svg>
          <span>Open @Beat_AniStream_hub_bot</span>
        </a>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">then enter your code below</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Code display boxes */}
        <div className="flex gap-2 justify-center mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-11 h-14 rounded-lg border-2 flex items-center justify-center text-xl font-bold font-mono transition-colors ${
                code[i]
                  ? "border-primary text-foreground bg-secondary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {code[i] || "·"}
            </div>
          ))}
        </div>

        {/* Hidden input for code entry */}
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          className="w-full h-12 text-center text-lg font-mono rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary mb-4"
          placeholder="000000"
          autoFocus
        />

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm mb-4 bg-destructive/10 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleVerify}
          disabled={loading || code.length !== 6}
          className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
            </>
          ) : (
            "Verify Device"
          )}
        </button>

        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Smartphone className="w-4 h-4 flex-shrink-0" />
          <span>Max 2 devices per code. 3rd device automatically kicks the oldest.</span>
        </div>
      </motion.div>
    </div>
  );
}
