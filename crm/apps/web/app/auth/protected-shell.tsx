"use client";

import { useEffect } from "react";
import { useAuth } from "./auth-provider";

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { isLoading, user } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.href = "/login";
    }
  }, [isLoading, user]);

  if (isLoading) {
    return (
      <main className="auth-loading">
        <div>
          <span />
          <strong>Carregando GT3 CRM</strong>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
