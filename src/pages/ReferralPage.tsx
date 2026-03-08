import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Gift, CheckCircle, AlertCircle, Loader2, Crown, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

export default function ReferralPage() {
  const navigate = useNavigate();
  const { user } = useSupabaseAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");

  const handleRedeem = async () => {
    if (code.length !== 4) {
      setError("Enter a valid 4-digit code");
      return;
    }
    if (!user) {
      setError("You must be logged in to redeem a code.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Find the code
      const { data: codeData, error: findErr } = await supabase
        .from("premium_codes")
        .select("*")
        .eq("code", code.toUpperCase())
        .eq("is_active", true)
        .single();

      if (findErr || !codeData) {
        setError("Invalid or expired code. Please check and try again.");
        setLoading(false);
        return;
      }

      // Check expiry
      if (new Date(codeData.expires_at) < new Date()) {
        setError("This code has expired.");
        setLoading(false);
        return;
      }

      // Check max uses
      if (codeData.current_uses >= codeData.max_uses) {
        setError("This code has reached its maximum number of uses.");
        setLoading(false);
        return;
      }

      // Update the code usage
      await supabase
        .from("premium_codes")
        .update({
          current_uses: codeData.current_uses + 1,
          is_active: codeData.current_uses + 1 < codeData.max_uses,
        })
        .eq("id", codeData.id);

      // Set premium_until on profile
      await supabase
        .from("profiles")
        .update({ premium_until: codeData.expires_at })
        .eq("user_id", user.id);

      setExpiresAt(new Date(codeData.expires_at).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      }));
      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="flex flex-col items-center gap-4 text-center"
        >
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 20 }}
            className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center"
          >
            <Crown className="w-10 h-10 text-accent" />
          </motion.div>
          <h1 className="font-display text-2xl font-bold text-foreground">Premium Activated!</h1>
          <p className="text-sm text-muted-foreground">
            Your premium access is valid until <span className="text-accent font-medium">{expiresAt}</span>
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Go to Home
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-card border border-border rounded-2xl p-8">
          {/* Back */}
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <Gift className="w-8 h-8 text-accent" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground mb-2">
              Redeem Premium Code
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Enter your 4-digit referral code to unlock premium features.
            </p>
          </div>

          {!user && (
            <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 mb-6 text-center">
              <p className="text-sm text-accent">
                You need to <button onClick={() => navigate("/login")} className="underline font-medium">log in</button> first to redeem a code.
              </p>
            </div>
          )}

          {/* Code boxes */}
          <div className="flex gap-3 justify-center mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`w-14 h-16 rounded-xl border-2 flex items-center justify-center text-2xl font-bold font-mono transition-all duration-150 ${
                  code[i]
                    ? "border-accent text-foreground bg-accent/5 scale-105 shadow-[0_0_12px_hsl(var(--accent)/0.2)]"
                    : "border-border text-muted-foreground/30"
                }`}
              >
                {code[i]?.toUpperCase() || "·"}
              </div>
            ))}
          </div>

          {/* Hidden input */}
          <input
            type="text"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4))}
            className="w-full h-12 text-center text-lg font-mono rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 mb-4 uppercase"
            placeholder="XXXX"
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
            onClick={handleRedeem}
            disabled={loading || code.length !== 4 || !user}
            className="w-full py-3.5 rounded-xl bg-accent text-accent-foreground font-bold text-sm hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Redeeming...
              </>
            ) : (
              <>
                <Crown className="w-4 h-4" /> Redeem Code
              </>
            )}
          </button>

          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground">
              Premium codes are provided by the owner. Each code has limited uses and an expiry date.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
