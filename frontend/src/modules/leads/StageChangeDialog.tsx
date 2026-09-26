import { LEAD_STAGE_LABELS, LOST_REASON_LABELS, LOST_REASONS, type LeadStage, type LostReason } from "@mashkoor/shared";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/core/api/client";
import { errorMessage } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, FormError, inputClass } from "@/core/ui/form";
import { useChangeStage } from "./api";

export interface PendingStageChange {
  leadId: string;
  refNo: string;
  from: LeadStage;
  to: LeadStage;
  /** The server asked for a note because nothing has been logged yet. */
  needsNote?: boolean;
}

/** Collects what a stage change needs: a lost reason, or a note when no contact has been logged. */
export function StageChangeDialog({ pending, onClose }: { pending: PendingStageChange | null; onClose: () => void }) {
  const change = useChangeStage();
  const [lostReason, setLostReason] = useState<LostReason | "">("");
  const [note, setNote] = useState("");
  const [needsNote, setNeedsNote] = useState(false);

  const close = () => {
    setLostReason("");
    setNote("");
    setNeedsNote(false);
    change.reset();
    onClose();
  };

  if (!pending) return null;
  const requireNote = needsNote || pending.needsNote;

  const submit = async () => {
    try {
      await change.mutateAsync({ id: pending.leadId, stage: pending.to, lostReason: lostReason || null, note: note.trim() || null });
      toast.success(`${pending.refNo} moved to ${LEAD_STAGE_LABELS[pending.to]}`);
      close();
    } catch (error) {
      if (error instanceof ApiError && error.code === "LEAD_NO_CONTACT") setNeedsNote(true);
    }
  };

  return (
    <Dialog open onClose={close} title={`Move to ${LEAD_STAGE_LABELS[pending.to]}`} description={`${pending.refNo} · currently ${LEAD_STAGE_LABELS[pending.from]}`}>
      <div className="space-y-4">
        <FormError message={change.error && !(change.error instanceof ApiError && change.error.code === "LEAD_NO_CONTACT") ? errorMessage(change.error) : null} />
        {pending.to === "LOST" && (
          <Field label="Why was this lead lost?" required>
            <select value={lostReason} onChange={(e) => setLostReason(e.target.value as LostReason)} className={inputClass} autoFocus>
              <option value="">Choose a reason…</option>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {LOST_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={requireNote ? "What happened in your conversation?" : "Note"} required={requireNote} hint={requireNote ? "No call or message has been logged yet — add a short note." : "Optional"}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputClass} autoFocus={pending.to !== "LOST"} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} loading={change.isPending} disabled={(pending.to === "LOST" && !lostReason) || (requireNote && !note.trim())} variant={pending.to === "LOST" ? "danger" : "primary"}>
            Move lead
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
