// src/components/VerifyGate.tsx
// Wraps the entire app — blocks access until verified

import { useEffect, useState, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isVerified } from "@/pages/VerifyPage";

const PUBLIC_PATHS = ["/verify", "/admin", "/admin/dashboard"];

interface Props {
  children: ReactNode;
}

export default function VerifyGate({ children }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const v = isVerified();
    setVerified(v);
    setChecked(true);

    const isPublic = PUBLIC_PATHS.some(p => location.pathname.startsWith(p));
    if (!v && !isPublic) {
      navigate("/verify", { replace: true });
    }
  }, [location.pathname]);

  if (!checked) return null;

  const isPublic = PUBLIC_PATHS.some(p => location.pathname.startsWith(p));
  if (!verified && !isPublic) return null;

  return <>{children}</>;
}
