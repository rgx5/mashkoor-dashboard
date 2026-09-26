import { zodResolver } from "@hookform/resolvers/zod";
import { LEAD_STAGE_LABELS, leadInputSchema, PRODUCT_TYPE_LABELS, PRODUCT_TYPES, type LeadRow } from "@mashkoor/shared";
import { Plus, Target } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, errorMessage } from "@/core/api/errors";
import { formatDate, travellersLabel } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { useCreateMyEnquiry, useMyEnquiries } from "./api";

type FormIn = z.input<typeof leadInputSchema>;
type FormOut = z.output<typeof leadInputSchema>;

export function B2BEnquiriesPage() {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const page = Number(params.get("page") ?? 1);
  const { data, isLoading, error } = useMyEnquiries({ page, q: params.get("q") ?? undefined });

  const columns: Column<LeadRow>[] = [
    {
      key: "contact",
      header: "Enquiry",
      cell: (l) => (
        <div>
          <span className="font-semibold">{l.contactName}</span>
          <span className="block text-xs text-ink-500">
            {l.refNo} · {PRODUCT_TYPE_LABELS[l.productType]}
          </span>
        </div>
      ),
    },
    { key: "travellers", header: "Travellers", cell: (l) => travellersLabel(l.adults, l.children, l.infants) },
    { key: "stage", header: "Status", cell: (l) => <Badge tone="plum">{LEAD_STAGE_LABELS[l.stage]}</Badge> },
    { key: "created", header: "Raised", cell: (l) => formatDate(l.createdAt) },
  ];

  return (
    <>
      <PageHeader
        title="Enquiries to Mashkoor"
        description="Trip requests you've raised for Mashkoor's team to quote."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden /> New enquiry
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(l) => l.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: Target, title: "No enquiries yet" }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => setParams((prev) => new URLSearchParams({ ...Object.fromEntries(prev), page: String(p) }))}
      />
      <Dialog open={creating} onClose={() => setCreating(false)} title="New enquiry" size="lg">
        <EnquiryForm onDone={() => setCreating(false)} />
      </Dialog>
    </>
  );
}

function EnquiryForm({ onDone }: { onDone: () => void }) {
  const create = useCreateMyEnquiry();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(leadInputSchema),
    defaultValues: { source: "B2B", priority: "WARM", productType: "HOLIDAY", adults: 2, children: 0, infants: 0 },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await create.mutateAsync(values);
      toast.success("Enquiry sent to Mashkoor");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Contact name" required autoFocus error={formState.errors.contactName?.message} {...register("contactName")} />
        <TextField label="Mobile" type="tel" required error={formState.errors.phone?.message} {...register("phone")} />
        <SelectField label="Product" {...register("productType")}>
          {PRODUCT_TYPES.map((p) => (
            <option key={p} value={p}>
              {PRODUCT_TYPE_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <TextField label="Destination" {...register("destination")} />
        <TextField label="Departure" type="date" {...register("travelFrom")} />
        <TextField label="Return" type="date" {...register("travelTo")} />
        <TextField label="Adults" type="number" min={0} {...register("adults")} />
        <TextField label="Children" type="number" min={0} {...register("children")} />
      </div>
      <TextareaField label="Requirements" {...register("requirements")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Send enquiry
        </Button>
      </div>
    </form>
  );
}
