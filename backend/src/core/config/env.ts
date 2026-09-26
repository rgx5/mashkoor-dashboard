import path from "node:path";
import { parseFeatures } from "@mashkoor/shared";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default("http://localhost:5173"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  // How many reverse proxies sit in front of the API (client IP and rate limits depend on it). Production runs Caddy then nginx = 2.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(14),
  TOKEN_PEPPER: z.string().min(16),
  // Email: "console" prints to the log (dev); "msg91" sends through MSG91's email API.
  MAIL_PROVIDER: z.enum(["console", "msg91"]).default("console"),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_EMAIL_DOMAIN: z.string().optional(),
  MSG91_EMAIL_FROM: z.string().optional(),
  MSG91_EMAIL_FROM_NAME: z.string().default("Mashkoor Tourism"),
  MSG91_EMAIL_TEMPLATE_ID: z.string().optional(),
  MSG91_EMAIL_API_URL: z.url().default("https://control.msg91.com/api/v5/email/send"),
  // Payments: only a mock gateway exists until one is chosen. Its webhook is signed with this secret.
  PAYMENT_GATEWAY: z.enum(["mock"]).default("mock"),
  MOCK_GATEWAY_SECRET: z.string().min(16).default("mock-gateway-secret-change-me"),
  // Public website: when set, catalog edits tell it to refresh its cached pages (POST {WEBSITE_URL}/api/revalidate).
  // A blank value in the .env file means "not set".
  WEBSITE_URL: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional()),
  REVALIDATE_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(16).optional()),
  FIELD_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded"),
  // Which optional areas are switched on: "all", "none" (CRM core only) or a list such as "quotations,portal".
  // See packages/shared/src/features.ts. Anything switched off answers 404 and disappears from the dashboard.
  ENABLED_FEATURES: z.string().default("all"),
  // Where uploaded files (visas, tickets, vouchers …) live on disk. In production use an absolute path outside the app
  // folder, owned by the app user with mode 700, and include it in backups. Nothing serves this folder directly.
  UPLOAD_DIR: z.string().min(1).default("./storage"),
  // Encrypt files at rest (AES-256-GCM, key derived from FIELD_ENCRYPTION_KEY). Leave on unless you have a reason.
  STORAGE_ENCRYPT: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule — fails fast with a readable message when configuration is wrong. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const featureErrors = parseFeatures(parsed.data.ENABLED_FEATURES).errors;
  if (featureErrors.length) {
    throw new Error(`Invalid environment configuration:\n${featureErrors.map((e) => `  - ENABLED_FEATURES: ${e}`).join("\n")}`);
  }
  if (parsed.data.NODE_ENV === "production" && !path.isAbsolute(parsed.data.UPLOAD_DIR)) {
    throw new Error("Invalid environment configuration:\n  - UPLOAD_DIR: use an absolute path in production, e.g. /var/lib/mashkoor/uploads");
  }
  return parsed.data;
}
