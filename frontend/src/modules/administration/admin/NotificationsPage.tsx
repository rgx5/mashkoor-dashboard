import { NOTIFICATION_STATUSES, type NotificationRow, type NotificationStatus } from "@mashkoor/shared";
import { CheckCircle2, Mail, MessageCircle, RotateCw, Send, TriangleAlert, Wallet } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { errorMessage } from "@/core/api/errors";
import { formatDateTime } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, Card, PageHeader } from "@/core/ui/layout";
import { useIntegrations, useNotifications, useResendNotification, useSendTestEmail } from "../api";

const tone = (s: NotificationStatus) => (s === "SENT" ? "green" : s === "FAILED" ? "red" : "amber");

/** Email log, plus what's connected. This is where staff confirm MSG91 works and retry anything that failed. */
export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const ability = useAbility("admin");
  const resend = useResendNotification();
  const page = Number(params.get("page") ?? 1);
  const status = (params.get("status") ?? "") as NotificationStatus | "";
  const q = params.get("q") ?? "";
  const { data, isLoading, error } = useNotifications({ page, q, status: status || undefined });

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      value ? next.set(key, value) : next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });

  const retry = async (id: string) => {
    try {
      const result = await resend.mutateAsync(id);
      if (result.status === "SENT") toast.success("Sent");
      else toast.error(result.error ?? "Still failing");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const columns: Column<NotificationRow>[] = [
    {
      key: "subject",
      header: "Email",
      cell: (n) => (
        <div className="max-w-md">
          <p className="truncate font-semibold">{n.subject}</p>
          <p className="truncate text-xs text-ink-500">
            To {n.toName ? `${n.toName} · ` : ""}
            {n.toEmail}
          </p>
        </div>
      ),
    },
    { key: "event", header: "Type", cell: (n) => <span className="text-xs text-ink-500">{n.event}</span> },
    {
      key: "status",
      header: "Status",
      cell: (n) => (
        <div>
          <Badge tone={tone(n.status)}>{n.status.charAt(0) + n.status.slice(1).toLowerCase()}</Badge>
          {n.error && <p className="mt-1 max-w-xs truncate text-xs text-red-600" title={n.error}>{n.error}</p>}
        </div>
      ),
    },
    { key: "provider", header: "Via", cell: (n) => <span className="text-xs text-ink-500">{n.provider}{n.attempts > 1 ? ` · ${n.attempts} tries` : ""}</span> },
    { key: "when", header: "When", cell: (n) => <span className="text-ink-500">{formatDateTime(n.sentAt ?? n.createdAt)}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (n) =>
        ability.can("update", "NotificationLog") && n.status !== "SENT" ? (
          <Button variant="ghost" size="sm" aria-label="Retry sending" onClick={() => void retry(n.id)} loading={resend.isPending && resend.variables === n.id}>
            <RotateCw className="h-4 w-4" aria-hidden />
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader title="Emails & integrations" description="Every email the system sends, and the services it's connected to." />
      <IntegrationCards />
      <div className="mb-4 flex flex-wrap gap-3">
        <input type="search" placeholder="Search recipient, subject or type…" defaultValue={q} onChange={(e) => set("q", e.target.value)} className={`${inputClass} w-72`} />
        <select aria-label="Status" value={status} onChange={(e) => set("status", e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">All statuses</option>
          {NOTIFICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(n) => n.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: Mail, title: "No emails yet", description: "Emails appear here as soon as the system sends one." }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => set("page", String(p))}
      />
    </>
  );
}

function IntegrationCards() {
  const { data } = useIntegrations();
  const ability = useAbility("admin");
  const test = useSendTestEmail();
  const [to, setTo] = useState("");
  if (!data) return null;

  const sendTest = async () => {
    try {
      const result = await test.mutateAsync(to);
      if (result.status === "SENT") toast.success(`Test email sent via ${result.provider}`);
      else toast.error(result.error ?? "The test email failed");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Mail className="h-4 w-4 text-plum-600" aria-hidden /> Email
          <Badge tone={data.mail.provider === "msg91" && data.mail.configured ? "green" : data.mail.provider === "msg91" ? "red" : "amber"}>
            {data.mail.provider === "msg91" ? (data.mail.configured ? "MSG91 · live" : "MSG91 · not configured") : "Console only"}
          </Badge>
        </h2>
        {data.mail.provider === "console" && <p className="mt-2 text-xs text-ink-500">Emails are logged here but not delivered. Set MAIL_PROVIDER=msg91 in the server settings to send for real.</p>}
        {data.mail.missing.length > 0 && (
          <p className="mt-2 flex gap-1.5 text-xs text-red-600">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Missing settings: {data.mail.missing.join(", ")}
          </p>
        )}
        {data.mail.from && <p className="mt-2 text-xs text-ink-500">Sending from {data.mail.from}</p>}
        {ability.can("update", "NotificationLog") && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendTest();
            }}
          >
            <input type="email" required aria-label="Send a test email to" placeholder="you@example.com" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            <Button type="submit" size="md" loading={test.isPending}>
              <Send className="h-4 w-4" aria-hidden /> Test
            </Button>
          </form>
        )}
      </Card>
      <Card className="p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Wallet className="h-4 w-4 text-plum-600" aria-hidden /> Payments
          <Badge tone="amber">Test gateway</Badge>
        </h2>
        <p className="mt-2 text-xs text-ink-500">{data.payments.note}</p>
      </Card>
      <Card className="p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="h-4 w-4 text-plum-600" aria-hidden /> WhatsApp
          <Badge tone="green">
            <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden /> Click-to-chat
          </Badge>
        </h2>
        <p className="mt-2 text-xs text-ink-500">Staff open a WhatsApp chat from a lead or customer. Two-way inbox and automated messages need the WhatsApp Business API, which isn't connected yet.</p>
      </Card>
    </div>
  );
}
