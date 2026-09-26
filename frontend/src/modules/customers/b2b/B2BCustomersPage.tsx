import { zodResolver } from "@hookform/resolvers/zod";
import { customerInputSchema, formatPhone, type CustomerRow } from "@mashkoor/shared";
import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, errorMessage } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { Dialog } from "@/core/ui/Dialog";
import { CheckboxField, FormError, TextField } from "@/core/ui/form";
import { PageHeader } from "@/core/ui/layout";
import { useCreateMyCustomer, useMyCustomers } from "./api";

type FormIn = z.input<typeof customerInputSchema>;
type FormOut = z.output<typeof customerInputSchema>;

export function B2BCustomersPage() {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const page = Number(params.get("page") ?? 1);
  const { data, isLoading, error } = useMyCustomers({ page, q: params.get("q") ?? undefined });

  const columns: Column<CustomerRow>[] = [
    { key: "name", header: "Customer", cell: (c) => <span className="font-semibold">{c.fullName}</span> },
    { key: "phone", header: "Mobile", cell: (c) => formatPhone(c.phone) },
    { key: "city", header: "City", cell: (c) => c.city ?? "—" },
  ];

  return (
    <>
      <PageHeader
        title="My customers"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden /> New customer
          </Button>
        }
      />
      <input
        type="search"
        placeholder="Search customers"
        defaultValue={params.get("q") ?? ""}
        onChange={(e) => setParams((prev) => new URLSearchParams({ ...Object.fromEntries(prev), q: e.target.value }))}
        className="mb-4 block w-full max-w-sm rounded-lg border border-line bg-white px-3 py-2.5 text-sm"
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(c) => c.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: Users, title: "No customers yet" }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => setParams((prev) => new URLSearchParams({ ...Object.fromEntries(prev), page: String(p) }))}
      />
      <Dialog open={creating} onClose={() => setCreating(false)} title="New customer" size="lg">
        <B2BCustomerForm onDone={() => setCreating(false)} />
      </Dialog>
    </>
  );
}

function B2BCustomerForm({ onDone }: { onDone: () => void }) {
  const create = useCreateMyCustomer();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(customerInputSchema),
    defaultValues: { type: "INDIVIDUAL", source: "B2B", preferredChannel: "WHATSAPP", whatsappOptIn: true },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await create.mutateAsync(values);
      toast.success("Customer added");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Full name" required autoFocus error={formState.errors.fullName?.message} {...register("fullName")} />
        <TextField label="Mobile" type="tel" required error={formState.errors.phone?.message} {...register("phone")} />
        <TextField label="Email" type="email" hint="Optional" error={formState.errors.email?.message} {...register("email")} />
        <TextField label="City" {...register("city")} />
      </div>
      <CheckboxField label="Customer agrees to receive WhatsApp messages" {...register("whatsappOptIn")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Create
        </Button>
      </div>
    </form>
  );
}
