import { Logger } from "@nestjs/common";
import type { AppConfig } from "../config/app-config.service";
import type { MailProvider, OutgoingMail } from "./mail.types";

/** Development provider: prints the email so invite/OTP/reset flows can be tried without a mail account. */
export class ConsoleMailProvider implements MailProvider {
  readonly name = "console" as const;
  private readonly logger = new Logger("Mail");

  async send(mail: OutgoingMail) {
    this.logger.log(`\n──── EMAIL ────\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n───────────────`);
    return { ref: "console" };
  }
}

/**
 * MSG91 email API (transactional). MSG91 sends from a *template*, so one generic template is created in the
 * MSG91 dashboard with the subject `##subject##` and the body `##body_html##`; every email here fills those two
 * variables. Keep this the only place that knows MSG91's request shape — if MSG91's payload differs from your
 * dashboard's "API Integration" snippet, adjust `body` below and nothing else changes.
 */
export class Msg91MailProvider implements MailProvider {
  readonly name = "msg91" as const;

  constructor(private readonly config: AppConfig) {}

  /** The MSG91 settings that must be present for this provider to work. */
  static missing(config: AppConfig): string[] {
    const required = ["MSG91_AUTH_KEY", "MSG91_EMAIL_DOMAIN", "MSG91_EMAIL_FROM", "MSG91_EMAIL_TEMPLATE_ID"] as const;
    return required.filter((key) => !config.get(key)?.trim());
  }

  async send(mail: OutgoingMail) {
    const missing = Msg91MailProvider.missing(this.config);
    if (missing.length) throw new Error(`MSG91 is not configured (missing ${missing.join(", ")})`);

    const body = {
      recipients: [{ to: [{ name: mail.toName ?? mail.to, email: mail.to }], variables: { subject: mail.subject, body_html: mail.html, body_text: mail.text } }],
      from: { name: this.config.get("MSG91_EMAIL_FROM_NAME"), email: this.config.get("MSG91_EMAIL_FROM") },
      domain: this.config.get("MSG91_EMAIL_DOMAIN"),
      template_id: this.config.get("MSG91_EMAIL_TEMPLATE_ID"),
    };

    const res = await fetch(this.config.get("MSG91_EMAIL_API_URL"), {
      method: "POST",
      headers: { authkey: this.config.get("MSG91_AUTH_KEY")!, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { status?: string; type?: string; message?: unknown; data?: { unique_id?: string } | string };
    if (!res.ok || json.status === "fail" || json.type === "error") throw new Error(`MSG91 responded ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return { ref: typeof json.data === "object" ? json.data?.unique_id : typeof json.data === "string" ? json.data : undefined };
  }
}
