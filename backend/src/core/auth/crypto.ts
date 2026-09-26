import { hash, verify } from "@node-rs/argon2";
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

// argon2id with OWASP-recommended parameters.
const ARGON_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, ARGON_OPTIONS);

export const verifyPassword = async (hashValue: string | null | undefined, password: string) => {
  if (!hashValue) return false;
  try {
    return await verify(hashValue, password);
  } catch {
    return false;
  }
};

/** Opaque random token for refresh cookies, invite and reset links. */
export const randomToken = (bytes = 48) => randomBytes(bytes).toString("base64url");

/** Six-digit one-time code. */
export const randomOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Tokens are stored as keyed hashes so a database leak cannot be replayed. */
export const hashToken = (token: string, pepper: string) => createHmac("sha256", pepper).update(token).digest("hex");

/** Non-reversible IP fingerprint for audit and session records. */
export const hashIp = (ip: string | undefined, pepper: string) => (ip ? createHash("sha256").update(`${pepper}:${ip}`).digest("hex").slice(0, 32) : null);

let dummyHash: Promise<string> | undefined;
/** Real argon2 hash of a throwaway value, so login timing is the same whether or not the email exists. */
export const dummyPasswordHash = () => (dummyHash ??= hashPassword(randomToken(16)));
