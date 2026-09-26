import { Injectable, Logger } from "@nestjs/common";
import { AppConfig } from "../config/app-config.service";

const TIMEOUT_MS = 5000;

/**
 * Tells the public website to drop its cached copy of some content (Next.js cache tags: packages, destinations,
 * testimonials). Best effort and never throws: a website that is down must not make a staff edit fail — the site
 * refreshes itself on its own every few minutes anyway, this just makes a change show up immediately.
 */
@Injectable()
export class WebsiteRevalidator {
  private readonly logger = new Logger(WebsiteRevalidator.name);
  private readonly pending = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly config: AppConfig) {}

  get enabled() {
    return Boolean(this.config.get("WEBSITE_URL") && this.config.get("REVALIDATE_SECRET"));
  }

  /** Batches bursts of edits (e.g. bulk reordering) into one call. */
  revalidate(tags: string[]) {
    if (!this.enabled) return;
    tags.forEach((t) => this.pending.add(t));
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const batch = [...this.pending];
      this.pending.clear();
      void this.send(batch);
    }, 1000);
    this.timer.unref();
  }

  private async send(tags: string[]) {
    const base = this.config.get("WEBSITE_URL")!.replace(/\/$/, "");
    try {
      const res = await fetch(`${base}/api/revalidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-revalidate-secret": this.config.get("REVALIDATE_SECRET")! },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) this.logger.warn(`Website revalidate for [${tags.join(", ")}] answered ${res.status}`);
    } catch (error) {
      this.logger.warn(`Website revalidate for [${tags.join(", ")}] failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}
