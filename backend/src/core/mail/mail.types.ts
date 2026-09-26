/** A message to send. `event` names the business reason (shown in the notification log); `dedupeKey` makes a send idempotent. */
export interface MailMessage {
  to: string;
  toName?: string | null;
  subject: string;
  text: string;
  html?: string;
  event?: string;
  dedupeKey?: string;
  entityType?: string;
  entityId?: string;
}

export interface OutgoingMail {
  to: string;
  toName: string | null;
  subject: string;
  text: string;
  html: string;
}

export interface MailProvider {
  readonly name: "console" | "msg91";
  send(mail: OutgoingMail): Promise<{ ref?: string }>;
}
