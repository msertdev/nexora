"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiClient, ApiError, type SafeUser } from "../lib/api-client";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "authenticated"; user: SafeUser }
  | { status: "unauthenticated"; user: null }
  | { status: "unavailable"; user: null };

type AuthContextValue = AuthState & {
  refresh: () => Promise<void>;
  setUser: (user: SafeUser | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({
    status: "loading",
    user: null,
  });

  const refresh = useCallback(async () => {
    setAuth({ status: "loading", user: null });
    try {
      const user = await apiClient.me();
      setAuth({ status: "authenticated", user });
    } catch (error) {
      setAuth({
        status:
          error instanceof ApiError && error.status === 401
            ? "unauthenticated"
            : "unavailable",
        user: null,
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setUser = useCallback((user: SafeUser | null) => {
    setAuth(
      user
        ? { status: "authenticated", user }
        : { status: "unauthenticated", user: null },
    );
  }, []);

  const value = useMemo(
    () => ({ ...auth, refresh, setUser }),
    [auth, refresh, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
