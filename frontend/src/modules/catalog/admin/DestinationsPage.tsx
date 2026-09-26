import { zodResolver } from "@hookform/resolvers/zod";
import { destinationInputSchema, type Destination } from "@mashkoor/shared";
import { Globe2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, errorMessage, withToast } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { CheckboxField, FormError, TextareaField, TextField } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { useCreateDestination, useDeleteDestination, useDestinations, useUpdateDestination } from "../api";

type FormIn = z.input<typeof destinationInputSchema>;
type FormOut = z.output<typeof destinationInputSchema>;

export function DestinationsPage() {
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Destination | "new" | null>(null);
  const remove = useDeleteDestination();
  const page = Number(params.get("page") ?? 1);
  const { data, isLoading, error } = useDestinations({ page, pageSize: 25, q: params.get("q") ?? undefined });

  const columns: Column<Destination>[] = [
    {
      key: "name",
      header: "Destination",
      cell: (d) => (
        <div>
          <span className="font-semibold">{d.name}</span>
          <span className="block text-xs text-ink-500">
            {d.country} · /{d.slug}
          </span>
        </div>
      ),
    },
    { key: "packages", header: "Packages", cell: (d) => d.packageCount },
    { key: "status", header: "Status", cell: (d) => <Badge tone={d.published ? "green" : "neutral"}>{d.published ? "Published" : "Draft"}</Badge> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (d) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(d)} aria-label="Edit">
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Delete"
            onClick={() => window.confirm(`Delete ${d.name}?`) && withToast(remove.mutateAsync(d.id), "Destination deleted")}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Destinations"
        description="Countries and regions shown on the website."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> New destination
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(d) => d.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: Globe2, title: "No destinations yet" }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => setParams((prev) => new URLSearchParams({ ...Object.fromEntries(prev), page: String(p) }))}
      />
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing !== "new" && editing ? "Edit destination" : "New destination"} size="lg">
        {editing !== null && <DestinationForm destination={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function DestinationForm({ destination, onDone }: { destination?: Destination; onDone: () => void }) {
  const create = useCreateDestination();
  const update = useUpdateDestination();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(destinationInputSchema),
    defaultValues: destination ?? { published: false, sortOrder: 0, highlights: [] },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (destination) await update.mutateAsync({ id: destination.id, input: values });
      else await create.mutateAsync(values);
      toast.success(destination ? "Destination updated" : "Destination created");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" required autoFocus error={formState.errors.name?.message} {...register("name")} />
        <TextField label="Slug" required hint="Used in the website URL" error={formState.errors.slug?.message} {...register("slug")} />
        <TextField label="Country" required error={formState.errors.country?.message} {...register("country")} />
        <TextField label="Region" hint="Optional" {...register("region")} />
        <TextField label="Hero image URL" hint="Optional" className="sm:col-span-2" {...register("heroImageUrl")} />
      </div>
      <TextareaField label="Summary" hint="Shown on listing cards" {...register("summary")} />
      <TextareaField label="Description" rows={6} {...register("description")} />
      <div className="grid gap-4 rounded-xl bg-surface p-4 sm:grid-cols-2">
        <TextField label="SEO title" {...register("seoTitle")} />
        <TextField label="SEO description" {...register("seoDescription")} />
      </div>
      <CheckboxField label="Published on the website" {...register("published")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Save
        </Button>
      </div>
    </form>
  );
}
