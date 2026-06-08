"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  clearStoredToken,
  fetchSession,
  getStoredToken,
  login,
  logout,
  setStoredToken,
  type AuthPermission,
  type AuthSession,
  type AuthUser,
} from "./auth-client";

type AuthState = {
  isLoading: boolean;
  token: string | null;
  user: AuthUser | null;
  permissions: AuthPermission[];
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasPermission: (permission: PermissionRequirement) => boolean;
};

export type PermissionRequirement = {
  module: string;
  action: string;
  scope?: string;
  sensitiveArea?: string | null;
};

const AuthContext = createContext<AuthState | null>(null);

function permissionMatches(permission: AuthPermission, requirement: PermissionRequirement) {
  return (
    permission.module === requirement.module &&
    permission.action === requirement.action &&
    (!requirement.scope || permission.scope === requirement.scope) &&
    (requirement.sensitiveArea === undefined || permission.sensitiveArea === requirement.sensitiveArea)
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetchSession(token)
      .then(setSession)
      .catch(() => {
        clearStoredToken();
        setSession(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await login(email, password);
    setStoredToken(result.token);
    const nextSession = await fetchSession(result.token);
    setSession(nextSession);
  }, []);

  const signOut = useCallback(async () => {
    const token = session?.token ?? getStoredToken();
    if (token) {
      await logout(token);
    }
    clearStoredToken();
    setSession(null);
    window.location.href = "/login";
  }, [session?.token]);

  const hasPermission = useCallback(
    (requirement: PermissionRequirement) => session?.permissions.some((permission) => permissionMatches(permission, requirement)) ?? false,
    [session?.permissions],
  );

  const value = useMemo<AuthState>(
    () => ({
      isLoading,
      token: session?.token ?? null,
      user: session?.user ?? null,
      permissions: session?.permissions ?? [],
      signIn,
      signOut,
      hasPermission,
    }),
    [hasPermission, isLoading, session?.permissions, session?.token, session?.user, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
