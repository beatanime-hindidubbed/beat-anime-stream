import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

export function useIsPremium() {
  const { user } = useSupabaseAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsPremium(false);
      setLoading(false);
      return;
    }

    supabase
      .from("profiles")
      .select("premium_until")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.premium_until) {
          setIsPremium(new Date(data.premium_until) > new Date());
        } else {
          setIsPremium(false);
        }
        setLoading(false);
      });
  }, [user]);

  return { isPremium, loading };
}
