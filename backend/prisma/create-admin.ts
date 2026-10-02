import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

/**
 * Creates a Super Admin, or — if that email already exists — makes it an active Super Admin with the new password.
 * Adds nothing else (no demo data, no settings).
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long password 1' pnpm --filter @mashkoor/backend admin:create
 */
const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME?.trim() || "Super Admin";
  if (!email.includes("@")) throw new Error("Set ADMIN_EMAIL to the email address to sign in with");
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error("ADMIN_PASSWORD needs at least 10 characters, with a letter and a number");

  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const user = await prisma.user.upsert({
    where: { email },
    update: { type: "STAFF", role: "SUPER_ADMIN", passwordHash, status: "ACTIVE", failedLogins: 0, lockedUntil: null },
    create: { type: "STAFF", role: "SUPER_ADMIN", name, email, passwordHash, status: "ACTIVE" },
  });
  console.log(`Super Admin ready: ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
