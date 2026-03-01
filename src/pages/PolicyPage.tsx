import { useParams, Link } from "react-router-dom";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { motion } from "framer-motion";
import { Shield, Lock, FileText, ArrowLeft } from "lucide-react";

const POLICY_CONFIG = {
  dmca: {
    title: "DMCA Policy",
    icon: Shield,
    key: "dmcaContent" as const,
    color: "text-primary",
  },
  privacy: {
    title: "Privacy Policy",
    icon: Lock,
    key: "privacyContent" as const,
    color: "text-accent",
  },
  terms: {
    title: "Terms of Service",
    icon: FileText,
    key: "termsContent" as const,
    color: "text-primary",
  },
};

export default function PolicyPage() {
  const { type } = useParams<{ type: string }>();
  const { settings } = useSiteSettings();

  const config = POLICY_CONFIG[type as keyof typeof POLICY_CONFIG];

  if (!config) {
    return (
      <div className="container py-16 text-center text-muted-foreground">
        Policy not found.
      </div>
    );
  }

  const Icon = config.icon;
  const content = settings[config.key];

  return (
    <div className="container py-10 max-w-3xl">
      <Link
        to="/"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center">
            <Icon className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground">{config.title}</h1>
        </div>

        <div className="bg-card border border-border rounded-xl p-8">
          <div className="prose prose-invert max-w-none">
            {content ? (
              content.split("\n").map((para, i) =>
                para.trim() ? (
                  <p key={i} className="text-muted-foreground leading-relaxed mb-4">
                    {para}
                  </p>
                ) : null
              )
            ) : (
              <p className="text-muted-foreground">Content not configured yet.</p>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-8">
          © {new Date().getFullYear()} {settings.siteName || "Beat Anistream"} — Last updated {new Date().toLocaleDateString()}
        </p>
      </motion.div>
    </div>
  );
}
