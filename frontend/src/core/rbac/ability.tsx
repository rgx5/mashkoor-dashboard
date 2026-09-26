import { createMongoAbility, subject, type MongoAbility } from "@casl/ability";
import type { Portal } from "@mashkoor/shared";
import { useMemo, type ReactNode } from "react";
import { useSession } from "../auth/session-store";

export type Ability = MongoAbility;

/** Builds the user's ability from rules sent by the API (/auth/:portal/me). The API still enforces everything. */
export function useAbility(portal: Portal): Ability {
  const { rules } = useSession(portal);
  // Rules come from @casl/prisma on the server; their simple equality conditions are Mongo-compatible.
  return useMemo(() => createMongoAbility(rules as never), [rules]);
}

export function Can({ portal, I, a, this: record, children, fallback = null }: { portal: Portal; I: string; a: string; this?: object; children: ReactNode; fallback?: ReactNode }) {
  const ability = useAbility(portal);
  const allowed = record ? ability.can(I, subject(a, { ...record })) : ability.can(I, a);
  return <>{allowed ? children : fallback}</>;
}
