import type { MeResponse, Portal } from "@mashkoor/shared";
import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { authApi, refreshSession } from "../api/client";
import { FullPageSpinner } from "../ui/Spinner";
import { sessionStore, useSession } from "./session-store";

/**
 * Restores the portal session on first load (refresh cookie → access token → /me),
 * then renders children or redirects to that portal's login page.
 */
export function RequirePortalSession({ portal, children }: { portal: Portal; children: ReactNode }) {
  const session = useSession(portal);
  const location = useLocation();

  useEffect(() => {
    if (session.status !== "unknown") return;
    let cancelled = false;
    (async () => {
      const refreshed = session.accessToken ? true : await refreshSession(portal);
      if (!refreshed) return sessionStore.clear(portal);
      try {
        const me = await authApi(portal).get<MeResponse>("/me");
        if (!cancelled) sessionStore.setMe(portal, me);
      } catch {
        if (!cancelled) sessionStore.clear(portal);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portal, session.status, session.accessToken]);

  if (session.status === "unknown") return <FullPageSpinner />;
  if (session.status === "anonymous") {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/${portal}/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}
