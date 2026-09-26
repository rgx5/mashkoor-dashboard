import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { AppConfig } from "../config/app-config.service";

/** What the caller keeps in the database to find the file again and to prove it wasn't altered. */
export interface StoredFile {
  /** Opaque location, e.g. `documents/3f/9a…`. Never contains anything the client chose. */
  key: string;
  /** SHA-256 of the file's original bytes (hex). */
  sha256: string;
  size: number;
}

export class StorageIntegrityError extends Error {
  constructor(key: string) {
    super(`Stored file ${key} failed its integrity check`);
  }
}

/** `<namespace>/<2 hex>/<32 hex>` — the only shape ever resolved to a path, so `..`, absolute paths and odd names can't get in. */
const KEY_PATTERN = /^[a-z][a-z0-9-]{0,30}\/[0-9a-f]{2}\/[0-9a-f]{32}$/;
/** On-disk header: 4 magic bytes say whether the body is AES-256-GCM (`MKF1`: iv, tag, ciphertext) or raw (`MKF0`). */
const MAGIC_ENCRYPTED = Buffer.from("MKF1");
const MAGIC_PLAIN = Buffer.from("MKF0");
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * File storage on the server's own disk (M12 documents). Files are:
 *  - kept outside the web root, in `UPLOAD_DIR`, and only ever served through an authenticated API route;
 *  - named by random keys — the client's file name is metadata in the database, never part of a path;
 *  - written atomically (temp file → fsync → rename) with owner-only permissions (dir 0700, file 0600);
 *  - encrypted at rest with AES-256-GCM using a key derived from FIELD_ENCRYPTION_KEY (turn off with STORAGE_ENCRYPT=false);
 *  - checked against the SHA-256 recorded at upload every time they are read.
 * The surface is small (`save` / `read` / `remove`) so an S3-compatible driver can replace it later without touching callers.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger("Storage");
  private readonly root: string;
  private readonly encrypt: boolean;
  private readonly key: Buffer;

  constructor(config: AppConfig) {
    this.root = path.resolve(config.get("UPLOAD_DIR"));
    this.encrypt = config.get("STORAGE_ENCRYPT");
    this.key = Buffer.from(hkdfSync("sha256", Buffer.from(config.get("FIELD_ENCRYPTION_KEY"), "base64"), Buffer.alloc(0), "mashkoor:files:v1", 32));
  }

  get directory() {
    return this.root;
  }

  async onModuleInit() {
    await fs.mkdir(this.tmpDir, { recursive: true, mode: 0o700 });
    // Fail at start-up, not on the first customer upload, if the folder can't be written.
    const probe = path.join(this.tmpDir, `probe-${randomBytes(6).toString("hex")}`);
    await fs.writeFile(probe, "ok", { mode: 0o600 });
    await fs.unlink(probe);
    this.logger.log(`Uploads are stored in ${this.root} (${this.encrypt ? "encrypted at rest" : "NOT encrypted"})`);
  }

  private get tmpDir() {
    return path.join(this.root, ".tmp");
  }

  /** Resolves a key to a path inside the storage root, refusing anything that isn't a well-formed key. */
  private resolve(key: string) {
    if (!KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
    const full = path.join(this.root, ...key.split("/"));
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async save(namespace: string, data: Buffer): Promise<StoredFile> {
    const id = randomBytes(16).toString("hex");
    const key = `${namespace}/${id.slice(0, 2)}/${id}`;
    const target = this.resolve(key);
    const sha256 = createHash("sha256").update(data).digest("hex");

    const body = this.encrypt ? this.seal(data) : Buffer.concat([MAGIC_PLAIN, data]);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temp = path.join(this.tmpDir, `${id}.part`);
    const handle = await fs.open(temp, "wx", 0o600);
    try {
      await handle.writeFile(body);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.rename(temp, target);
    } catch (error) {
      await fs.unlink(temp).catch(() => undefined);
      throw error;
    }
    return { key, sha256, size: data.length };
  }

  /** Returns the original bytes. Throws `StorageIntegrityError` if the file was altered or doesn't match `expectedSha256`. */
  async read(key: string, expectedSha256?: string | null): Promise<Buffer> {
    const raw = await fs.readFile(this.resolve(key));
    const magic = raw.subarray(0, 4);
    let data: Buffer;
    if (magic.equals(MAGIC_ENCRYPTED)) {
      try {
        data = this.open(raw);
      } catch {
        throw new StorageIntegrityError(key);
      }
    } else if (magic.equals(MAGIC_PLAIN)) {
      data = raw.subarray(4);
    } else {
      throw new StorageIntegrityError(key);
    }
    if (expectedSha256) {
      const actual = createHash("sha256").update(data).digest();
      const expected = Buffer.from(expectedSha256, "hex");
      if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) throw new StorageIntegrityError(key);
    }
    return data;
  }

  /** Deletes a file. Missing files are fine (the goal is "gone"). */
  async remove(key: string) {
    try {
      await fs.unlink(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async exists(key: string) {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  /** Keys in `namespace` older than `olderThanMs` — used to find files no database row points to any more. */
  async listOlderThan(namespace: string, olderThanMs: number): Promise<string[]> {
    const base = path.join(this.root, namespace);
    const found: string[] = [];
    let shards: string[];
    try {
      shards = await fs.readdir(base);
    } catch {
      return found;
    }
    const cutoff = Date.now() - olderThanMs;
    for (const shard of shards) {
      if (!/^[0-9a-f]{2}$/.test(shard)) continue;
      for (const name of await fs.readdir(path.join(base, shard)).catch(() => [] as string[])) {
        if (!/^[0-9a-f]{32}$/.test(name)) continue;
        const stat = await fs.stat(path.join(base, shard, name)).catch(() => null);
        if (stat && stat.mtimeMs < cutoff) found.push(`${namespace}/${shard}/${name}`);
      }
    }
    return found;
  }

  private seal(data: Buffer) {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([MAGIC_ENCRYPTED, iv, cipher.getAuthTag(), encrypted]);
  }

  private open(raw: Buffer) {
    const iv = raw.subarray(4, 4 + IV_BYTES);
    const tag = raw.subarray(4 + IV_BYTES, 4 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(raw.subarray(4 + IV_BYTES + TAG_BYTES)), decipher.final()]);
  }
}
