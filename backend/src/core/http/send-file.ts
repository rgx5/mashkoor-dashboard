import { StreamableFile } from "@nestjs/common";
import type { Response } from "express";

export interface DownloadableFile {
  fileName: string;
  mimeType: string;
  data: Buffer;
}

/** `attachment; filename="ascii-fallback"; filename*=UTF-8''percent-encoded` — safe for any name, no header injection. */
export function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

/**
 * Sends a file as a download. Always returns a `StreamableFile` — returning a raw Buffer from a Nest handler makes
 * Nest serialise it as JSON (`{"type":"Buffer","data":[…]}`), which is what corrupted every document download before.
 * The headers stop a browser from sniffing, rendering or caching what is often somebody's passport or visa.
 */
export function sendFile(res: Response, file: DownloadableFile) {
  res.set({
    "Content-Type": file.mimeType,
    "Content-Length": String(file.data.length),
    "Content-Disposition": contentDisposition(file.fileName),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  return new StreamableFile(file.data);
}
