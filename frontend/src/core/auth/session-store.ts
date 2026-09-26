import type { AbilityRule, AuthSession, MeResponse, Portal, SessionUser } from "@mashkoor/shared";
import { create } from "zustand";

export type SessionStatus = "unknown" | "authenticated" | "anonymous";

export interface PortalSession {
  status: SessionStatus;
  accessToken: string | null;
  user: SessionUser | null;
  rules: AbilityRule[];
}

const empty = (status: SessionStatus = "unknown"): PortalSession => ({ status, accessToken: null, user: null, rules: [] });

interface SessionState {
  sessions: Record<Portal, PortalSession>;
}

/** Access tokens live in memory only (never localStorage); refresh tokens stay in httpOnly cookies. */
export const useSessionStore = create<SessionState>(() => ({
  sessions: { admin: empty(), b2b: empty(), b2c: empty() },
}));

const update = (portal: Portal, patch: Partial<PortalSession>) =>
  useSessionStore.setState((s) => ({ sessions: { ...s.sessions, [portal]: { ...s.sessions[portal], ...patch } } }));

export const sessionStore = {
  get: (portal: Portal) => useSessionStore.getState().sessions[portal],
  setSession: (portal: Portal, session: AuthSession) => update(portal, { accessToken: session.accessToken, user: session.user }),
  setMe: (portal: Portal, me: MeResponse) => update(portal, { status: "authenticated", user: me.user, rules: me.rules }),
  clear: (portal: Portal) => useSessionStore.setState((s) => ({ sessions: { ...s.sessions, [portal]: empty("anonymous") } })),
};

export const useSession = (portal: Portal) => useSessionStore((s) => s.sessions[portal]);
