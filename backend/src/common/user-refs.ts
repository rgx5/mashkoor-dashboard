import type { UserRef } from "@mashkoor/shared";
import type { PrismaService } from "../core/prisma/prisma.service";

/** Looks up `{ id, name }` for a batch of user IDs stored as plain columns (no Prisma relation), in one query. */
export async function loadUserRefs(prisma: PrismaService, ids: (string | null | undefined)[]): Promise<Map<string, UserRef>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, { id: u.id, name: u.name }]));
}
