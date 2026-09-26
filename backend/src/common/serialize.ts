import type { UserRef } from "@mashkoor/shared";

/** Date columns (`@db.Date`) → `YYYY-MM-DD`; null stays null. */
export const toDateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** `YYYY-MM-DD` → Date at UTC midnight for `@db.Date` columns. */
export const fromDateOnly = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00.000Z`) : s === null ? null : undefined);

export const toIso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export const userRef = (u: { id: string; name: string } | null | undefined): UserRef | null => (u ? { id: u.id, name: u.name } : null);

export const userRefSelect = { select: { id: true, name: true } } as const;

/** Builds a Prisma orderBy from `?sort=-createdAt`, allowing only whitelisted fields. */
export function orderByFrom<T extends string>(sort: string | undefined, allowed: readonly T[], fallback: Partial<Record<T, "asc" | "desc">>) {
  const field = sort?.replace(/^-/, "") as T | undefined;
  if (field && allowed.includes(field)) return { [field]: sort!.startsWith("-") ? "desc" : "asc" } as Partial<Record<T, "asc" | "desc">>;
  return fallback;
}

export const paginate = (page: number, pageSize: number) => ({ skip: (page - 1) * pageSize, take: pageSize });
