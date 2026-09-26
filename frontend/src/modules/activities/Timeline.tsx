import { ACTIVITY_TYPE_LABELS, MANUAL_ACTIVITY_TYPES, type ActivityEntityType, type ActivityType } from "@mashkoor/shared";
import { ArrowRightLeft, Bot, Mail, MessageCircle, NotebookPen, Phone, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatDateTime, timeAgo } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { inputClass } from "@/core/ui/form";
import { EmptyState } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";
import { useActivities, useLogActivity } from "./api";

const ICONS: Record<ActivityType, LucideIcon> = {
  NOTE: NotebookPen,
  CALL: Phone,
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  MEETING: Users,
  STAGE_CHANGE: ArrowRightLeft,
  STATUS_CHANGE: ArrowRightLeft,
  SYSTEM: Bot,
};

const TONES: Partial<Record<ActivityType, string>> = {
  CALL: "bg-sky-50 text-sky-700",
  WHATSAPP: "bg-emerald-50 text-emerald-700",
  EMAIL: "bg-violet-50 text-violet-700",
  MEETING: "bg-gold-50 text-gold-700",
  STAGE_CHANGE: "bg-plum-50 text-plum-700",
};

/** Activity timeline with an inline composer. Used on lead and customer pages. */
export function Timeline({ entityType, entityId, composer = true, showLeadLinks = false }: { entityType: ActivityEntityType; entityId: string; composer?: boolean; showLeadLinks?: boolean }) {
  const { data, isLoading, error } = useActivities(entityType, entityId);

  return (
    <div>
      {composer && <ActivityComposer entityType={entityType} entityId={entityId} />}
      {isLoading && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}
      {error && <p className="py-6 text-center text-sm text-red-600">{errorMessage(error, "Unable to load activity")}</p>}
      {data?.length === 0 && <EmptyState icon={NotebookPen} title="No activity yet" description="Log calls, WhatsApp chats and notes to build the history." />}
      <ol className="mt-4 space-y-0">
        {data?.map((a, i) => {
          const Icon = ICONS[a.type];
          const system = a.type === "SYSTEM" || a.type === "STAGE_CHANGE" || a.type === "STATUS_CHANGE";
          return (
            <li key={a.id} className="relative flex gap-3 pb-5">
              {i < data.length - 1 && <span className="absolute top-9 bottom-0 left-4 w-px bg-line" aria-hidden />}
              <span className={cn("relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full", TONES[a.type] ?? "bg-surface text-ink-500")}>
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <p className="text-xs text-ink-500">
                  <span className="font-semibold text-ink-700">{a.createdBy?.name ?? "System"}</span> · {ACTIVITY_TYPE_LABELS[a.type]} ·{" "}
                  <time dateTime={a.createdAt} title={formatDateTime(a.createdAt)}>
                    {timeAgo(a.createdAt)}
                  </time>
                  {showLeadLinks && a.lead && (
                    <>
                      {" "}
                      ·{" "}
                      <Link to={`/admin/leads/${a.lead.id}`} className="font-semibold text-plum-700 hover:underline">
                        {a.lead.refNo}
                      </Link>
                    </>
                  )}
                </p>
                <p className={cn("mt-1 text-sm whitespace-pre-line", system ? "text-ink-500" : "rounded-lg bg-surface px-3 py-2 text-ink-900")}>{a.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ActivityComposer({ entityType, entityId }: { entityType: ActivityEntityType; entityId: string }) {
  const [type, setType] = useState<(typeof MANUAL_ACTIVITY_TYPES)[number]>("NOTE");
  const [body, setBody] = useState("");
  const log = useLogActivity();

  const submit = async () => {
    if (!body.trim()) return;
    try {
      await log.mutateAsync({ entityType, entityId, type, body: body.trim() });
      setBody("");
    } catch {
      /* error shown below */
    }
  };

  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <div className="mb-2 flex flex-wrap gap-1">
        {MANUAL_ACTIVITY_TYPES.map((t) => {
          const Icon = ICONS[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition", type === t ? "bg-plum-600 text-white" : "text-ink-500 hover:bg-surface")}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden /> {ACTIVITY_TYPE_LABELS[t]}
            </button>
          );
        })}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        rows={2}
        placeholder={type === "NOTE" ? "Add a note…" : `What happened on this ${ACTIVITY_TYPE_LABELS[type].toLowerCase()}?`}
        className={cn(inputClass, "resize-y border-0 bg-surface focus:ring-0")}
        aria-label="Activity details"
      />
      {log.error && <p className="mt-2 text-sm text-red-600">{errorMessage(log.error)}</p>}
      <div className="mt-2 flex items-center justify-between">
        <span className="hidden text-xs text-ink-300 sm:inline">Ctrl + Enter to save</span>
        <Button size="sm" onClick={submit} loading={log.isPending} disabled={!body.trim()}>
          Log {ACTIVITY_TYPE_LABELS[type].toLowerCase()}
        </Button>
      </div>
    </div>
  );
}
