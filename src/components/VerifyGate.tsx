// src/components/VerifyGate.tsx — BULLETPROOF
import { useEffect, useState, ReactNode, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSiteSettings } from "@/hooks/useSiteSettings";

// ─── Only these paths are accessible without verification ───────────────────
const PUBLIC_PATHS = [
  "/verify",
  "/login",
  "/admin",
  "/admin/dashboard",
];

const VERIFY_KEY   = "beat-verified";
const EXPIRY_MS    = 2 * 24 * 60 * 60 * 1000; // 2 days exactly
const SALT         = "beat-anti-tamper-z7q1x";

// ─── VerifyState stored in localStorage ─────────────────────────────────────
interface VerifyState {
  verified: boolean;
  telegramId?: string;
  devicesUsed?: number;
  devicesMax?: number;
  code?: string;
  verifiedAt: number;
  _cs: string;           // tamper-detection checksum — required
}

// ─── Checksum helpers ────────────────────────────────────────────────────────
function computeChecksum(verified: boolean, verifiedAt: number, code?: string): string {
  const raw = `${verified}|${verifiedAt}|${code ?? ""}|${SALT}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) + h) ^ raw.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h.toString(36);
}

// ─── Write a verified state (called by VerifyPage after success) ─────────────
export function writeVerification(data: {
  telegramId?: string;
  devicesUsed?: number;
  devicesMax?: number;
  code?: string;
}): void {
  const now = Date.now();
  const state: VerifyState = {
    verified:    true,
    telegramId:  data.telegramId,
    devicesUsed: data.devicesUsed,
    devicesMax:  data.devicesMax,
    code:        data.code,
    verifiedAt:  now,
    _cs:         computeChecksum(true, now, data.code),
  };
  localStorage.setItem(VERIFY_KEY, JSON.stringify(state));
}

// ─── Full validation: expiry + checksum + type guards ───────────────────────
function isValidVerification(): boolean {
  try {
    const raw = localStorage.getItem(VERIFY_KEY);
    if (!raw) return false;

    const s: VerifyState = JSON.parse(raw);

    // Type guards
    if (typeof s.verified    !== "boolean") return false;
    if (typeof s.verifiedAt  !== "number")  return false;
    if (typeof s._cs         !== "string")  return false;
    if (!s.verified)                        return false;

    // Reject future timestamps (clock manipulation)
    const now = Date.now();
    if (s.verifiedAt > now + 60_000) return false;

    // Expiry
    if (now - s.verifiedAt >= EXPIRY_MS) return false;

    // Checksum — catches any manual edits to localStorage
    const expected = computeChecksum(s.verified, s.verifiedAt, s.code);
    if (s._cs !== expected) return false;

    return true;
  } catch {
    return false;
  }
}

// ─── Convenience export for other components ─────────────────────────────────
export function isVerified(): boolean {
  return isValidVerification();
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

// ─── Component ───────────────────────────────────────────────────────────────
interface Props { children: ReactNode }

export default function VerifyGate({ children }: Props) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { settings } = useSiteSettings();

  /**
   * verifiedInMemory is the single source of truth for this session.
   * Once set to TRUE it NEVER flips back to false during the same session
   * (even if someone wipes localStorage via DevTools).
   * It can only be TRUE if the initial localStorage check passed fully.
   */
  const verifiedInMemory = useRef<boolean | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // ── Core gate function ─────────────────────────────────────────────────────
  const gate = useCallback((pathname: string) => {
    // Public paths are always allowed
    if (isPublicPath(pathname)) {
      setAllowed(true);
      return;
    }

    // If verification is disabled by admin, allow everything
    if (!settings.verificationEnabled) {
      verifiedInMemory.current = true;
      setAllowed(true);
      return;
    }

    // Already verified this session — allow instantly, no localStorage read
    if (verifiedInMemory.current === true) {
      setAllowed(true);
      return;
    }

    // If previously unverified, re-check once in case user just completed verification
    // on the /verify page in this same tab/session.
    if (verifiedInMemory.current === false) {
      const validNow = isValidVerification();
      if (validNow) {
        verifiedInMemory.current = true;
        setAllowed(true);
        return;
      }
      setAllowed(false);
      navigate("/verify", { replace: true });
      return;
    }

    // ── First check (app load) — full localStorage validation ──────────────
    const valid = isValidVerification();

    if (valid) {
      verifiedInMemory.current = true;
      setAllowed(true);
    } else {
      // Wipe whatever was stored (expired, tampered, or missing)
      try { localStorage.removeItem(VERIFY_KEY); } catch {}
      verifiedInMemory.current = false;
      setAllowed(false);
      navigate("/verify", { replace: true });
    }
  }, [navigate, settings.verificationEnabled]);

  // ── Run gate on every route change ────────────────────────────────────────
  // After first check, verifiedInMemory is set so subsequent calls are O(1)
  // and never touch localStorage — so navigation stays instant
  useEffect(() => {
    gate(location.pathname);
  }, [location.pathname, gate]);

  // ── Block popstate / browser back-forward bypass ──────────────────────────
  useEffect(() => {
    const onPop = () => {
      if (!isPublicPath(window.location.pathname) && verifiedInMemory.current !== true) {
        navigate("/verify", { replace: true });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [navigate]);

  // ── Block DevTools localStorage write attempts ────────────────────────────
  // The `storage` event fires when ANOTHER tab (or DevTools) writes to localStorage.
  // If the session is already verified in memory we ignore it.
  // If not verified, we re-validate to make sure no one injected a fake token.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== VERIFY_KEY) return;

      // Session already verified in memory — writing to localStorage can't revoke it
      // and also can't be used to verify a second tab that wasn't already verified
      if (verifiedInMemory.current === true) return;

      // Not yet verified — someone wrote the key externally; re-validate strictly
      const valid = isValidVerification();
      if (!valid) {
        try { localStorage.removeItem(VERIFY_KEY); } catch {}
        navigate("/verify", { replace: true });
        setAllowed(false);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [navigate]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (allowed === null) return null; // Brief initial check — shows nothing
  if (!allowed)         return null; // Not verified — redirect happening
  return <>{children}</>;
}
