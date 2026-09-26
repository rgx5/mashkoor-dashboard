import { BOOKING_DOCUMENT_KIND_LABELS, BOOKING_DOCUMENT_KINDS, type BookingDocumentKind } from "@mashkoor/shared";
import { Download, Eye, EyeOff, FileUp, MessageSquare, Send, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { errorMessage, withToast } from "@/core/api/errors";
import { formatDate, formatDateTime } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { CheckboxField, inputClass, SelectField, TextField } from "@/core/ui/form";
import { Badge, Card } from "@/core/ui/layout";
import {
  downloadDocument,
  useBookingDocuments,
  useBookingUpdates,
  useDeleteDocument,
  useDeleteTripUpdate,
  usePostTripUpdate,
  useSetDocumentVisibility,
  useUploadDocument,
} from "./tripExperienceApi";

/** Updates staff post for the customer/agency to see, and the documents (visas, tickets, vouchers) attached to a booking. */
export function TripExperiencePanel({ bookingId }: { bookingId: string }) {
  return (
    <>
      <UpdatesCard bookingId={bookingId} />
      <DocumentsCard bookingId={bookingId} />
    </>
  );
}

function UpdatesCard({ bookingId }: { bookingId: string }) {
  const { data: updates } = useBookingUpdates(bookingId);
  const post = usePostTripUpdate();
  const remove = useDeleteTripUpdate();
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(true);

  const send = async () => {
    try {
      await post.mutateAsync({ bookingId, message, notify });
      setMessage("");
      toast.success(notify ? "Update posted and emailed" : "Update posted");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className="mb-4 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <MessageSquare className="h-4 w-4 text-plum-600" aria-hidden /> Trip updates
      </h2>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start">
        <input className={`${inputClass} flex-1`} placeholder="e.g. Visa submitted, hotel confirmed…" value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs whitespace-nowrap text-ink-500">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email them
          </label>
          <Button size="sm" onClick={() => void send()} loading={post.isPending} disabled={message.trim().length < 2}>
            <Send className="h-4 w-4" aria-hidden /> Post
          </Button>
        </div>
      </div>
      {updates?.length === 0 && <p className="text-sm text-ink-500">No updates yet.</p>}
      <ul className="divide-y divide-line text-sm">
        {updates?.map((u) => (
          <li key={u.id} className="flex items-start justify-between gap-3 py-2">
            <span>
              {u.message}
              <span className="block text-xs text-ink-500">
                {u.author} · {formatDateTime(u.createdAt)}
              </span>
            </span>
            <Button variant="ghost" size="sm" aria-label="Delete update" onClick={() => withToast(remove.mutateAsync(u.id), "Update removed")}>
              <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DocumentsCard({ bookingId }: { bookingId: string }) {
  const { data: documents } = useBookingDocuments(bookingId);
  const upload = useUploadDocument();
  const setVisibility = useSetDocumentVisibility();
  const remove = useDeleteDocument();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BookingDocumentKind>("OTHER");
  const [visibleToCustomer, setVisibleToCustomer] = useState(true);
  const [notify, setNotify] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  };

  const send = async () => {
    if (!file) return;
    try {
      await upload.mutateAsync({ bookingId, file, name: name || file.name, kind, visibleToCustomer, notify });
      toast.success("Document uploaded");
      setFile(null);
      setName("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className="mb-4 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <FileUp className="h-4 w-4 text-plum-600" aria-hidden /> Documents
      </h2>
      <div className="mb-4 grid gap-2 rounded-lg bg-surface p-3 sm:grid-cols-2">
        <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => onPick(e.target.files?.[0])} className={inputClass} />
        <TextField label="" placeholder="Document name" value={name} onChange={(e) => setName(e.target.value)} />
        <SelectField label="" value={kind} onChange={(e) => setKind(e.target.value as BookingDocumentKind)}>
          {BOOKING_DOCUMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {BOOKING_DOCUMENT_KIND_LABELS[k]}
            </option>
          ))}
        </SelectField>
        <div className="flex items-center gap-4">
          <CheckboxField label="Visible to customer" checked={visibleToCustomer} onChange={(e) => setVisibleToCustomer(e.target.checked)} />
          <CheckboxField label="Email them" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        </div>
        <div className="sm:col-span-2">
          <Button size="sm" onClick={() => void send()} loading={upload.isPending} disabled={!file}>
            <FileUp className="h-4 w-4" aria-hidden /> Upload
          </Button>
        </div>
      </div>
      {documents?.length === 0 && <p className="text-sm text-ink-500">No documents yet.</p>}
      <ul className="divide-y divide-line text-sm">
        {documents?.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-2">
            <span>
              {d.name} <Badge tone="plum">{BOOKING_DOCUMENT_KIND_LABELS[d.kind]}</Badge>
              <span className="block text-xs text-ink-500">
                {formatDate(d.createdAt)} · {(d.sizeBytes / 1024).toFixed(0)} KB
              </span>
            </span>
            <span className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label={d.visibleToCustomer ? "Hide from customer" : "Show to customer"}
                title={d.visibleToCustomer ? "Visible to customer — click to hide" : "Hidden from customer — click to show"}
                onClick={() => void setVisibility.mutateAsync({ id: d.id, visibleToCustomer: !d.visibleToCustomer })}
              >
                {d.visibleToCustomer ? <Eye className="h-4 w-4 text-emerald-600" aria-hidden /> : <EyeOff className="h-4 w-4 text-ink-500" aria-hidden />}
              </Button>
              <Button variant="ghost" size="sm" aria-label="Download" onClick={() => void downloadDocument(d.id, d.fileName).catch((e) => toast.error(errorMessage(e)))}>
                <Download className="h-4 w-4" aria-hidden />
              </Button>
              <Button variant="ghost" size="sm" aria-label="Delete" onClick={() => withToast(remove.mutateAsync(d.id), "Document deleted")}>
                <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
