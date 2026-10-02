import type { InvoiceDetail, InvoiceInput, InvoiceListQuery, InvoiceRow, Paginated } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, download, saveFile } from "@/core/api/client";

const admin = api("admin");
const key = ["admin", "invoices"] as const;

export const useInvoices = (filters: Partial<InvoiceListQuery>) => useQuery({ queryKey: [...key, "list", filters], queryFn: () => admin.get<Paginated<InvoiceRow>>("/invoices", { ...filters, pageSize: 25 }) });
export const useInvoice = (id: string) => useQuery({ queryKey: [...key, "detail", id], queryFn: () => admin.get<InvoiceDetail>(`/invoices/${id}`), enabled: Boolean(id) });

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  // An invoice touches the lead, booking and payment screens too.
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }) });
}

export const useCreateInvoice = () => useInvalidating((input: InvoiceInput) => admin.post<InvoiceDetail>("/invoices", input));
export const useSendInvoice = () => useInvalidating((id: string) => admin.post<{ sent: boolean; reason?: string }>(`/invoices/${id}/send`));
export const useCancelInvoice = () => useInvalidating((id: string) => admin.post<InvoiceDetail>(`/invoices/${id}/cancel`));

/** Downloads the invoice PDF. */
export async function downloadInvoice(id: string, fileName: string) {
  saveFile(await download("admin", `/api/v1/admin/invoices/${id}/pdf`), fileName);
}
