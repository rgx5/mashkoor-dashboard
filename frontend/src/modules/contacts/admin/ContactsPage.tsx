import { zodResolver } from "@hookform/resolvers/zod";
import { CONTACT_TYPE_LABELS, CONTACT_TYPES, contactInputSchema, contactUpdateSchema, type ContactRow, type ContactType } from "@mashkoor/shared";
import { Building2, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, errorMessage, withToast } from "@/core/api/errors";
import { timeAgo } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, inputClass, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { useContacts, useCreateContact, useDeleteContact, useMarkContacted, useUpdateContact } from "../api";

const typeTone = (t: ContactType) => (t === "SUPPLIER" ? "plum" : t === "AGENT" ? "amber" : "neutral");

/** A small rolodex for suppliers, agents and other people who aren't a travel customer. */
export function ContactsPage() {
  const [params, setParams] = useSearchParams();
  const ability = useAbility("admin");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const markContacted = useMarkContacted();
  const remove = useDeleteContact();
  const page = Number(params.get("page") ?? 1);
  const q = params.get("q") ?? "";
  const type = (params.get("type") ?? "") as ContactType | "";
  const { data, isLoading, error } = useContacts({ page, q, type: type || undefined });

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      value ? next.set(key, value) : next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });

  const columns: Column<ContactRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (c) => (
        <button type="button" className="text-left font-semibold text-plum-700 hover:underline" onClick={() => setEditing(c)}>
          {c.name}
          {c.company && <span className="block text-xs font-normal text-ink-500">{c.company}{c.designation ? ` · ${c.designation}` : ""}</span>}
        </button>
      ),
    },
    { key: "type", header: "Type", cell: (c) => <Badge tone={typeTone(c.type)}>{CONTACT_TYPE_LABELS[c.type]}</Badge> },
    {
      key: "contact",
      header: "Contact",
      cell: (c) => (
        <span className="text-ink-700">
          {c.phone && <span className="block">{c.phone}</span>}
          {c.email && <span className="block text-xs text-ink-500">{c.email}</span>}
        </span>
      ),
    },
    { key: "location", header: "Location", cell: (c) => [c.city, c.state].filter(Boolean).join(", ") || "—" },
    { key: "lastContacted", header: "Last contacted", cell: (c) => (c.lastContactedAt ? timeAgo(c.lastContactedAt) : "Never") },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (c) => (
        <span className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" aria-label="Mark contacted" title="Mark contacted" onClick={() => withToast(markContacted.mutateAsync(c.id), "Marked as contacted")}>
            <Phone className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Edit" onClick={() => setEditing(c)}>
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
          {ability.can("delete", "Contact") && (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Delete"
              onClick={() => {
                if (window.confirm(`Delete ${c.name}?`)) void withToast(remove.mutateAsync(c.id), "Contact deleted");
              }}
            >
              <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Suppliers, agents and other people you deal with — not a travel customer, not a financial record."
        actions={
          ability.can("create", "Contact") && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Add contact
            </Button>
          )
        }
      >
        <input type="search" placeholder="Search name, phone, email, company…" defaultValue={q} onChange={(e) => set("q", e.target.value)} className={`${inputClass} w-72`} />
        <select aria-label="Type" value={type} onChange={(e) => set("type", e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">All types</option>
          {CONTACT_TYPES.map((t) => (
            <option key={t} value={t}>
              {CONTACT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </PageHeader>
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(c) => c.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: Building2, title: "No contacts yet", description: "Add a hotel contact, a visa agent, or anyone else you deal with often." }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => set("page", String(p))}
      />
      {creating && <ContactDialog onClose={() => setCreating(false)} />}
      {editing && <ContactDialog contact={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

type FormIn = z.input<typeof contactInputSchema>;
type FormOut = z.output<typeof contactInputSchema>;

function ContactDialog({ contact, onClose }: { contact?: ContactRow; onClose: () => void }) {
  const create = useCreateContact();
  const update = useUpdateContact();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(contactInputSchema),
    defaultValues: contact
      ? { type: contact.type, name: contact.name, phone: contact.phone, altPhone: contact.altPhone, email: contact.email, company: contact.company, designation: contact.designation, city: contact.city, state: contact.state, notes: contact.notes }
      : { type: "GENERAL" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (contact) await update.mutateAsync({ id: contact.id, input: values as z.output<typeof contactUpdateSchema> });
      else await create.mutateAsync(values);
      toast.success(contact ? "Contact saved" : "Contact added");
      onClose();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <Dialog open onClose={onClose} title={contact ? "Edit contact" : "Add contact"} size="lg">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Type" {...register("type")}>
            {CONTACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTACT_TYPE_LABELS[t]}
              </option>
            ))}
          </SelectField>
          <TextField label="Name" required autoFocus error={formState.errors.name?.message} {...register("name")} />
          <TextField label="Phone" error={formState.errors.phone?.message} {...register("phone")} />
          <TextField label="Alt phone" {...register("altPhone")} />
          <TextField label="Email" type="email" error={formState.errors.email?.message} {...register("email")} />
          <TextField label="Company" {...register("company")} />
          <TextField label="Designation" {...register("designation")} />
          <TextField label="City" {...register("city")} />
          <TextField label="State" {...register("state")} />
        </div>
        <TextareaField label="Notes" rows={3} {...register("notes")} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={formState.isSubmitting}>
            {contact ? "Save" : "Add contact"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
