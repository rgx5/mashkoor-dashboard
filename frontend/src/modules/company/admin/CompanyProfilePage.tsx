import { type CompanyProfile } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/core/api/client";
import { errorMessage } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { TextareaField, TextField } from "@/core/ui/form";
import { Card, PageHeader } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";

const admin = api("admin");
const key = ["admin", "company-profile"] as const;

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

interface Form {
  name: string;
  legalName: string;
  address: string;
  email: string;
  phones: string;
  gstin: string;
  pan: string;
  beneficiary: string;
  bankName: string;
  accountNo: string;
  ifsc: string;
  branch: string;
  upiId: string;
  logoDataUrl: string;
  documentsRequired: string;
  defaultTerms: string;
}

const fromProfile = (p: CompanyProfile): Form => ({
  name: p.name,
  legalName: p.legalName ?? "",
  address: p.address ?? "",
  email: p.email ?? "",
  phones: p.phones.join(", "),
  gstin: p.gstin ?? "",
  pan: p.pan ?? "",
  beneficiary: p.bank.beneficiary ?? "",
  bankName: p.bank.bankName ?? "",
  accountNo: p.bank.accountNo ?? "",
  ifsc: p.bank.ifsc ?? "",
  branch: p.bank.branch ?? "",
  upiId: p.upiId ?? "",
  logoDataUrl: p.logoDataUrl ?? "",
  documentsRequired: p.documentsRequired.join("\n"),
  defaultTerms: p.defaultTerms ?? "",
});

const toPayload = (f: Form) => ({
  name: f.name,
  legalName: f.legalName || null,
  address: f.address || null,
  email: f.email || null,
  phones: f.phones.split(",").map((p) => p.trim()).filter(Boolean),
  gstin: f.gstin || null,
  pan: f.pan || null,
  bank: { beneficiary: f.beneficiary || null, bankName: f.bankName || null, accountNo: f.accountNo || null, ifsc: f.ifsc || null, branch: f.branch || null },
  upiId: f.upiId || null,
  logoDataUrl: f.logoDataUrl || null,
  documentsRequired: lines(f.documentsRequired),
  defaultTerms: f.defaultTerms || null,
});

/** Letterhead, tax, bank and standard terms printed on every quotation. */
export function CompanyProfilePage() {
  const client = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => admin.get<CompanyProfile>("/company-profile") });
  const save = useMutation({ mutationFn: (input: ReturnType<typeof toPayload>) => admin.put<CompanyProfile>("/company-profile", input), onSuccess: () => client.invalidateQueries({ queryKey: key }) });
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (data) setForm(fromProfile(data));
  }, [data]);

  if (isLoading || !form)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );

  const set = (changes: Partial<Form>) => setForm({ ...form, ...changes });
  const submit = async () => {
    try {
      await save.mutateAsync(toPayload(form));
      toast.success("Company profile saved");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title="Company profile" description="Printed on every quotation: letterhead, tax numbers, bank details and standard terms." />
      <div className="space-y-4">
        <Card className="flex flex-wrap items-center gap-4 p-5">
          <div className="flex h-16 w-40 items-center justify-center rounded-lg border border-dashed border-line bg-surface">
            {form.logoDataUrl ? <img src={form.logoDataUrl} alt="Company logo" className="max-h-14 max-w-36 object-contain" /> : <span className="text-xs text-ink-500">No logo</span>}
          </div>
          <div>
            <p className="text-sm font-semibold">Letterhead logo</p>
            <p className="mb-2 text-xs text-ink-500">PNG or JPEG, under 300 KB. Printed top-left on quotations.</p>
            <div className="flex gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium hover:bg-surface">
                Upload
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 300_000) return void toast.error("That logo is over 300 KB — use a smaller file");
                    const reader = new FileReader();
                    reader.onload = () => set({ logoDataUrl: String(reader.result) });
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {form.logoDataUrl && (
                <Button variant="ghost" size="sm" onClick={() => set({ logoDataUrl: "" })}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <TextField label="Trade name" required value={form.name} onChange={(e) => set({ name: e.target.value })} />
          <TextField label="Legal name" hint="Shown on the letterhead if different" value={form.legalName} onChange={(e) => set({ legalName: e.target.value })} />
          <div className="sm:col-span-2">
            <TextareaField label="Address" rows={2} value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </div>
          <TextField label="Email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          <TextField label="Phone numbers" hint="Comma separated" value={form.phones} onChange={(e) => set({ phones: e.target.value })} />
          <TextField label="GSTIN" value={form.gstin} onChange={(e) => set({ gstin: e.target.value })} />
          <TextField label="PAN" value={form.pan} onChange={(e) => set({ pan: e.target.value })} />
        </Card>

        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="text-base font-semibold sm:col-span-2">Bank and UPI</h2>
          <TextField label="Beneficiary name" value={form.beneficiary} onChange={(e) => set({ beneficiary: e.target.value })} />
          <TextField label="Bank name" value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} />
          <TextField label="Account number" value={form.accountNo} onChange={(e) => set({ accountNo: e.target.value })} />
          <TextField label="IFSC" value={form.ifsc} onChange={(e) => set({ ifsc: e.target.value })} />
          <TextField label="Branch" value={form.branch} onChange={(e) => set({ branch: e.target.value })} />
          <TextField label="UPI ID" hint="Becomes a scan-to-pay QR on quotations" value={form.upiId} onChange={(e) => set({ upiId: e.target.value })} />
        </Card>

        <Card className="grid gap-4 p-5">
          <TextareaField label="Documents required" hint="One per line" rows={4} value={form.documentsRequired} onChange={(e) => set({ documentsRequired: e.target.value })} />
          <TextareaField label="Standard terms & conditions" hint="Pre-fills every new quotation; edit per quote if needed" rows={12} value={form.defaultTerms} onChange={(e) => set({ defaultTerms: e.target.value })} />
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => void submit()} loading={save.isPending} disabled={form.name.trim().length < 2}>
            <Save className="h-4 w-4" aria-hidden /> Save profile
          </Button>
        </div>
      </div>
    </>
  );
}
