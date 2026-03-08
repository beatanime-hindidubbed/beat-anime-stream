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
import { writeVerification, isVerified } from "@/components/VerifyGate";

const VERIFY_FUNCTION = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-proxy`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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

  // If already verified, redirect home immediately
  useEffect(() => {
    if (isVerified()) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError("Enter a 6-digit code");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${VERIFY_FUNCTION}?action=verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          code,
          device_id: getDeviceId(),
          force: true,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
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

      // Use writeVerification from VerifyGate — this writes the checksum correctly
      writeVerification({
        telegramId: data.telegram_user_id || data.telegramId || data.telegram_id,
        devicesUsed: data.devices_used || data.devicesUsed,
        devicesMax: data.devices_max || data.devicesMax,
        code,
      });

      setSuccess(true);

      setTimeout(() => {
        navigate("/", { replace: true });
      }, 1500);
    } catch (err) {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen — minimal like reference ──────────────────
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="flex flex-col items-center gap-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 20 }}
          >
            <CheckCircle className="w-16 h-16 text-accent" strokeWidth={1.5} />
          </motion.div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Verified!
          </h1>
          <p className="text-sm text-muted-foreground">
            Redirecting to Beat AniStream...
          </p>
        </motion.div>
      </div>
    );
  }

  // ── Verification form ───────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground mb-2">
              Verify Your Device
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Get your 6-digit code from our Telegram Bot, then enter it below.
            </p>
          </div>

          {/* ── Telegram Bot Button ── */}
          <a
            href="https://t.me/Beat_AniStream_hub_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex items-center justify-center gap-3 w-full py-3.5 mb-6 rounded-xl font-bold text-sm text-white overflow-hidden transition-all duration-200 active:scale-[0.98]"
          >
            {/* Gradient background */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#229ED9] to-[#1a8cd8] group-hover:from-[#1a8cd8] group-hover:to-[#1573b5] transition-all duration-200" />
            {/* Shine effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            {/* Content */}
            <div className="relative flex items-center gap-3">
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 fill-white flex-shrink-0"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.48 14.367l-2.95-.924c-.642-.204-.657-.642.136-.953l11.57-4.461c.537-.194 1.006.131.326.219z" />
              </svg>
              <span>Open Telegram Bot</span>
            </div>
          </a>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">enter code</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Code display boxes */}
          <div className="flex gap-2 justify-center mb-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`w-11 h-14 rounded-lg border-2 flex items-center justify-center text-xl font-bold font-mono transition-all duration-150 ${
                  code[i]
                    ? "border-primary text-foreground bg-primary/5 scale-105"
                    : "border-border text-muted-foreground/30"
                }`}
              >
                {code[i] || "·"}
              </div>
            ))}
          </div>

          {/* Hidden input */}
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            className="w-full h-12 text-center text-lg font-mono rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
            placeholder="000000"
            autoFocus
          />

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-destructive text-sm mb-4 bg-destructive/10 rounded-lg px-3 py-2.5"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <button
            onClick={handleVerify}
            disabled={loading || code.length !== 6}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
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
            <Smartphone className="w-4 h-4 flex-shrink-0 text-muted-foreground/60" />
            <span>Max 2 devices per code. 3rd device automatically kicks the oldest.</span>
          </div>
        </div>

        {/* Bot username pill */}
        <div className="mt-4 text-center">
          <span className="text-xs text-muted-foreground/50">
            @Beat_AniStream_hub_bot
          </span>
        </div>
      </motion.div>
    </div>
  );
}
