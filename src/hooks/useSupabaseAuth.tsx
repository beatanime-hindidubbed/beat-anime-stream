import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isPremium: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (email: string, password: string, username: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAdmin = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      setIsAdmin(!!data);
    } catch {
      setIsAdmin(false);
    }
  }, []);

  const checkPremium = useCallback(async (userId: string) => {
    try {
      // Check if user has premium role or premium subscription
      const { data: roleData } = await supabase.rpc("has_role", { _user_id: userId, _role: "premium" });
      
      // Also check profile for premium flag
      const { data: profileData } = await supabase
        .from("profiles")
        .select("is_premium")
        .eq("user_id", userId)
        .single();
      
      setIsPremium(!!roleData || !!profileData?.is_premium);
    } catch {
      setIsPremium(false);
    }
  }, []);

  useEffect(() => {
    // Set up auth listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => {
          checkAdmin(sess.user.id);
          checkPremium(sess.user.id);
        }, 0);
      } else {
        setIsAdmin(false);
        setIsPremium(false);
      }
      setLoading(false);
    });

    // Then get initial session
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        checkAdmin(sess.user.id);
        checkPremium(sess.user.id);
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [checkAdmin, checkPremium]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Provide user-friendly error messages
        if (error.message.includes("Invalid login")) return { error: "Invalid email or password" };
        if (error.message.includes("Email not confirmed")) return { error: "Please verify your email before logging in" };
        return { error: error.message };
      }
      return {};
    } catch (err: any) {
      // Handle network/fetch errors
      if (err?.message?.includes("fetch") || err?.name === "TypeError") {
        return { error: "Network error. Please check your connection and try again." };
      }
      return { error: "Something went wrong. Please try again." };
    }
  }, []);

  const register = useCallback(async (email: string, password: string, username: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username }, emailRedirectTo: window.location.origin },
      });
      if (error) {
        if (error.message.includes("already registered")) return { error: "This email is already registered. Try logging in." };
        return { error: error.message };
      }
      return {};
    } catch (err: any) {
      if (err?.message?.includes("fetch") || err?.name === "TypeError") {
        return { error: "Network error. Please check your connection and try again." };
      }
      return { error: "Something went wrong. Please try again." };
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, isPremium, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useSupabaseAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useSupabaseAuth must be inside SupabaseAuthProvider");
  return ctx;
}
