import { zodResolver } from "@hookform/resolvers/zod";
import type { Paginated, LeadRow, LeadDetail, LeadInput } from "@mashkoor/shared";
import { LEAD_STAGE_LABELS, leadInputSchema, PRODUCT_TYPE_LABELS, PRODUCT_TYPES } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { api } from "@/core/api/client";
import { applyApiErrors } from "@/core/api/errors";
import { formatDate, travellersLabel } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/layout";
import { FullPageSpinner } from "@/core/ui/Spinner";

const b2c = api("b2c");
const key = ["b2c", "trip-requests"] as const;

const useMyRequests = () => useQuery({ queryKey: key, queryFn: () => b2c.get<Paginated<LeadRow>>("/trip-requests", { pageSize: 50 }) });
function useCreateRequest() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: LeadInput) => b2c.post<LeadDetail>("/trip-requests", input), onSuccess: () => client.invalidateQueries({ queryKey: ["b2c"] }) });
}

type FormIn = z.input<typeof leadInputSchema>;
type FormOut = z.output<typeof leadInputSchema>;

export function B2CRequestsPage() {
  const { data, isLoading } = useMyRequests();
  const [creating, setCreating] = useState(false);
  if (isLoading) return <FullPageSpinner />;

  return (
    <>
      <PageHeader
        title="Trip requests"
        description="Tell us where you'd like to go — our team will get back to you."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden /> New request
          </Button>
        }
      />
      {data?.data.length === 0 && <EmptyState icon={Send} title="No requests yet" />}
      <div className="space-y-3">
        {data?.data.map((l) => (
          <Card key={l.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">
                {PRODUCT_TYPE_LABELS[l.productType]}
                {l.destination ? ` · ${l.destination}` : ""}
              </p>
              <p className="text-xs text-ink-500">
                {l.refNo} · {travellersLabel(l.adults, l.children, l.infants)} · sent {formatDate(l.createdAt)}
              </p>
            </div>
            <Badge tone={l.stage === "WON" ? "green" : l.stage === "LOST" ? "red" : "plum"}>{LEAD_STAGE_LABELS[l.stage]}</Badge>
          </Card>
        ))}
      </div>
      <Dialog open={creating} onClose={() => setCreating(false)} title="New trip request" size="lg">
        <RequestForm onDone={() => setCreating(false)} />
      </Dialog>
    </>
  );
}

function RequestForm({ onDone }: { onDone: () => void }) {
  const create = useCreateRequest();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(leadInputSchema),
    // Name and phone come from the customer's account on the server; the placeholders satisfy the shared schema.
    defaultValues: { contactName: "Customer", phone: "9999999999", source: "B2C_PORTAL", priority: "WARM", productType: "HOLIDAY", adults: 2, children: 0, infants: 0 },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await create.mutateAsync(values);
      toast.success("Request sent — we'll be in touch soon");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Product" {...register("productType")}>
          {PRODUCT_TYPES.map((p) => (
            <option key={p} value={p}>
              {PRODUCT_TYPE_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <TextField label="Destination" {...register("destination")} />
        <TextField label="Preferred departure" type="date" {...register("travelFrom")} />
        <TextField label="Return" type="date" {...register("travelTo")} />
        <TextField label="Adults" type="number" min={0} {...register("adults")} />
        <TextField label="Children" type="number" min={0} {...register("children")} />
      </div>
      <TextareaField label="Anything else we should know?" {...register("requirements")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Send request
        </Button>
      </div>
    </form>
  );
}
