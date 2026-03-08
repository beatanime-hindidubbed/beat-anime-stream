import { useState } from "react";
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  animeId: string;
  animeName?: string;
}

export default function AnimeReportButton({ animeId, animeName }: Props) {
  const { reportAnimeFail } = useSiteSettings();
  const [reported, setReported] = useState(false);
  const [loading, setLoading] = useState(false);

  const alreadyReported = localStorage.getItem(`reported_${animeId}`) === "true";

  const handleReport = async () => {
    if (alreadyReported || reported) return;
    setLoading(true);
    try {
      await reportAnimeFail(animeId);
      localStorage.setItem(`reported_${animeId}`, "true");
      setReported(true);
    } catch {
      // silent
    }
    setLoading(false);
  };

  if (alreadyReported || reported) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-green-400 text-sm"
      >
        <CheckCircle className="w-4 h-4" /> Reported — Thanks!
      </motion.div>
    );
  }

  return (
    <button
      onClick={handleReport}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-all duration-200 disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <AlertTriangle className="w-4 h-4" />
      )}
      Report Broken
    </button>
  );
}
