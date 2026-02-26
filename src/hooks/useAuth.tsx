import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { store, User } from "@/lib/store";

interface AuthCtx {
  user: User | null;
  login: (email: string, username: string) => void;
  register: (email: string, username: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(store.getUser());

  const login = useCallback((email: string, username: string) => {
    const u = { email, username };
    store.login(u);
    setUser(u);
  }, []);

  const register = useCallback((email: string, username: string) => {
    const u = { email, username };
    store.register(u);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    store.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
