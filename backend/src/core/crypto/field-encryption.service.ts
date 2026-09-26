import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppConfig } from "../config/app-config.service";

const VERSION = "v1";

/**
 * AES-256-GCM encryption for sensitive fields such as passport numbers (PROJECT_PLAN §13.2).
 * Stored format: `v1:<iv>:<authTag>:<ciphertext>` (base64url parts).
 */
@Injectable()
export class FieldEncryptionService {
  private readonly key: Buffer;

  constructor(config: AppConfig) {
    this.key = Buffer.from(config.get("FIELD_ENCRYPTION_KEY"), "base64");
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
  }

  decrypt(stored: string): string {
    const [version, iv, tag, data] = stored.split(":");
    if (version !== VERSION || !iv || !tag || !data) throw new Error("Unsupported ciphertext format");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  }
}
