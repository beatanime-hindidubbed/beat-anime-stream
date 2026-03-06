// src/components/VerifyGate.tsx
import { useEffect, useState, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Public paths that do NOT require verification
const PUBLIC_PATHS = [
  "/verify",
  "/auth",
  "/owner",
  "/admin",
  "/admin/dashboard",
];

const VERIFY_KEY = "beat-verified";
const EXPIRY_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

interface VerifyState {
  verified: boolean;
  telegramId?: string;
  devicesUsed?: number;
  devicesMax?: number;
  code?: string;
  verifiedAt: number; // timestamp
}

function getStoredVerification(): VerifyState | null {
  try {
    const raw = localStorage.getItem(VERIFY_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VerifyState;
  } catch {
    return null;
  }
}

function isValidVerification(state: VerifyState | null): boolean {
  if (!state || !state.verified) return false;
  const now = Date.now();
  return now - state.verifiedAt < EXPIRY_MS;
}

interface Props {
  children: ReactNode;
}

export default function VerifyGate({ children }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const state = getStoredVerification();
    const valid = isValidVerification(state);
    const isPublic = PUBLIC_PATHS.some((path) =>
      location.pathname.startsWith(path)
    );

    if (!valid && !isPublic) {
      // Redirect to verify page, but preserve the intended destination
      navigate("/verify", { replace: true, state: { from: location } });
    }
    setChecked(true);
  }, [location.pathname, navigate]);

  if (!checked) return null; // Avoid flash of content

  // Allow access if public or verification is valid
  const isPublic = PUBLIC_PATHS.some((path) =>
    location.pathname.startsWith(path)
  );
  if (isPublic || isValidVerification(getStoredVerification())) {
    return <>{children}</>;
  }

  // If not public and not verified, render nothing (redirect will happen)
  return null;
}
