import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig } from "../config/app-config.service";
import { StorageIntegrityError, StorageService } from "./storage.service";

const KEY = randomBytes(32).toString("base64");
const config = (dir: string, encrypt = true) => ({ get: (k: string) => ({ UPLOAD_DIR: dir, STORAGE_ENCRYPT: encrypt, FIELD_ENCRYPTION_KEY: KEY })[k] }) as unknown as AppConfig;

describe("StorageService", () => {
  let dir: string;
  let storage: StorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "mk-storage-"));
    storage = new StorageService(config(dir));
    await storage.onModuleInit();
  });
  afterEach(async () => fs.rm(dir, { recursive: true, force: true }));

  it("stores and returns the exact bytes", async () => {
    const data = Buffer.from("%PDF-1.4 hello passport");
    const stored = await storage.save("documents", data);
    expect(stored.size).toBe(data.length);
    expect(stored.key).toMatch(/^documents\/[0-9a-f]{2}\/[0-9a-f]{32}$/);
    expect((await storage.read(stored.key, stored.sha256)).equals(data)).toBe(true);
  });

  it("encrypts at rest: the plaintext is not on disk", async () => {
    const secret = "PASSPORT-M1234567-SECRET";
    const stored = await storage.save("documents", Buffer.from(`%PDF-1.4 ${secret}`));
    const raw = await fs.readFile(path.join(dir, ...stored.key.split("/")));
    expect(raw.includes(Buffer.from(secret))).toBe(false);
    expect(raw.subarray(0, 4).toString()).toBe("MKF1");
  });

  it("can store unencrypted when switched off, and still reads it", async () => {
    const plain = new StorageService(config(dir, false));
    await plain.onModuleInit();
    const stored = await plain.save("documents", Buffer.from("plain bytes"));
    expect((await plain.read(stored.key, stored.sha256)).toString()).toBe("plain bytes");
  });

  it("detects a tampered file", async () => {
    const stored = await storage.save("documents", Buffer.from("original content here"));
    const file = path.join(dir, ...stored.key.split("/"));
    const raw = await fs.readFile(file);
    raw[raw.length - 1] ^= 0xff;
    await fs.writeFile(file, raw);
    await expect(storage.read(stored.key, stored.sha256)).rejects.toBeInstanceOf(StorageIntegrityError);
  });

  it("rejects a file whose content does not match the recorded SHA-256", async () => {
    const plain = new StorageService(config(dir, false));
    await plain.onModuleInit();
    const stored = await plain.save("documents", Buffer.from("aaa"));
    await expect(plain.read(stored.key, "00".repeat(32))).rejects.toBeInstanceOf(StorageIntegrityError);
  });

  it("refuses keys that could escape the storage folder", async () => {
    for (const key of ["../../etc/passwd", "documents/../../x", "/etc/passwd", "documents/zz/../../..", "documents/ab/notahexname", "documents\\ab\\" + "a".repeat(32)]) {
      await expect(storage.read(key)).rejects.toThrow("Invalid storage key");
      await expect(storage.remove(key)).rejects.toThrow("Invalid storage key");
    }
  });

  it("never puts client-chosen text in the path", async () => {
    const stored = await storage.save("documents", Buffer.from("x".repeat(20)));
    expect(stored.key).not.toMatch(/\.\.|\s/);
  });

  it("removes files, and removing a missing file is fine", async () => {
    const stored = await storage.save("documents", Buffer.from("bye"));
    expect(await storage.exists(stored.key)).toBe(true);
    await storage.remove(stored.key);
    expect(await storage.exists(stored.key)).toBe(false);
    await expect(storage.remove(stored.key)).resolves.toBeUndefined();
  });

  it("leaves no temp files behind after saving", async () => {
    await storage.save("documents", Buffer.from("data data data"));
    expect(await fs.readdir(path.join(dir, ".tmp"))).toEqual([]);
  });

  it("lists only old files (for orphan clean-up)", async () => {
    const fresh = await storage.save("documents", Buffer.from("fresh file"));
    const old = await storage.save("documents", Buffer.from("old file!!"));
    const past = new Date(Date.now() - 3 * 24 * 3600_000);
    await fs.utimes(path.join(dir, ...old.key.split("/")), past, past);
    const listed = await storage.listOlderThan("documents", 24 * 3600_000);
    expect(listed).toContain(old.key);
    expect(listed).not.toContain(fresh.key);
  });

  it("uses owner-only permissions on POSIX systems", async () => {
    if (process.platform === "win32") return;
    const stored = await storage.save("documents", Buffer.from("perm check!"));
    const file = await fs.stat(path.join(dir, ...stored.key.split("/")));
    const folder = await fs.stat(path.join(dir, stored.key.split("/")[0]!));
    expect(file.mode & 0o077).toBe(0);
    expect(folder.mode & 0o077).toBe(0);
  });
});
