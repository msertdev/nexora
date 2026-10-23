"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { loginPathFor, safeAuthReturnTo } from "../lib/team-collaboration";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === "unauthenticated") {
      router.replace(loginPathFor(pathname));
    }
  }, [auth.status, pathname, router]);

  if (auth.status === "unavailable") {
    return (
      <main className="auth-route-state" role="alert">
        <p>We couldn’t verify your session.</p>
        <button type="button" onClick={() => void auth.refresh()}>
          Try again
        </button>
      </main>
    );
  }

  if (auth.status !== "authenticated") {
    return <div className="workspace-loading">Verifying your session…</div>;
  }

  return children;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === "authenticated") {
      const returnTo = new URLSearchParams(window.location.search).get(
        "returnTo",
      );
      router.replace(safeAuthReturnTo(returnTo));
    }
  }, [auth.status, router]);

  if (auth.status === "authenticated" || auth.status === "loading") {
    return <div className="workspace-loading">Checking your session…</div>;
  }

  if (auth.status === "unavailable") {
    return (
      <main className="auth-route-state" role="alert">
        <p>We couldn’t verify your session.</p>
        <button type="button" onClick={() => void auth.refresh()}>
          Try again
        </button>
      </main>
    );
  }

  return children;
}
