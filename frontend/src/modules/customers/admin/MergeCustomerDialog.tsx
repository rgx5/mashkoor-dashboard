import { formatPhone, type CustomerDetail } from "@mashkoor/shared";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, inputClass } from "@/core/ui/form";
import { useCustomers, useMergeCustomer } from "../api";

/** Merge a duplicate record into this customer. The duplicate's leads, travellers and history move here. */
export function MergeCustomerDialog({ open, onClose, customer }: { open: boolean; onClose: () => void; customer: CustomerDetail }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { data } = useCustomers({ page: 1, q }, q.length >= 2);
  const merge = useMergeCustomer();
  const candidates = (data?.data ?? []).filter((c) => c.id !== customer.id);

  const submit = async () => {
    if (!selected) return;
    try {
      await merge.mutateAsync({ id: customer.id, duplicateId: selected });
      toast.success("Customers merged");
      onClose();
    } catch {
      /* shown below */
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Merge duplicate customer" description={`The selected record will be merged into ${customer.fullName} (${customer.refNo}) and removed.`}>
      <div className="space-y-4">
        <FormError message={merge.error ? errorMessage(merge.error) : null} />
        <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the duplicate by name, mobile or MKC number" className={inputClass} />
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {candidates.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface has-checked:bg-plum-50">
                <input type="radio" name="duplicate" checked={selected === c.id} onChange={() => setSelected(c.id)} className="accent-plum-600" />
                <span className="text-sm">
                  <span className="font-semibold">{c.fullName}</span>{" "}
                  <span className="text-ink-500">
                    · {c.refNo} · {formatPhone(c.phone)}
                  </span>
                </span>
              </label>
            </li>
          ))}
          {q.length >= 2 && candidates.length === 0 && <li className="px-3 py-4 text-sm text-ink-500">No matching customers</li>}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!selected} loading={merge.isPending} onClick={submit}>
            Merge into {customer.refNo}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
