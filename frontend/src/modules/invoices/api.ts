import type { InvoiceDetail, InvoiceInput, InvoiceListQuery, InvoicePrefill, InvoiceRow, InvoiceUpdateInput, Paginated } from "@mashkoor/shared";
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

export type PrefillSource = { bookingId?: string; quotationId?: string };
/** What the invoice editor starts from for a booking or a quotation. */
export const fetchInvoicePrefill = (source: PrefillSource) => admin.get<InvoicePrefill>("/invoices/prefill", { ...source });
export const useInvoicePrefill = (source: PrefillSource) => useQuery({ queryKey: [...key, "prefill", source], queryFn: () => fetchInvoicePrefill(source), enabled: Boolean(source.bookingId || source.quotationId), staleTime: 0, gcTime: 0 });
export const useUpdateInvoice = () => useInvalidating(({ id, input }: { id: string; input: InvoiceUpdateInput }) => admin.patch<InvoiceDetail>(`/invoices/${id}`, input));
export const useCreateInvoice = () => useInvalidating((input: InvoiceInput) => admin.post<InvoiceDetail>("/invoices", input));
export const useSendInvoice = () => useInvalidating((id: string) => admin.post<{ sent: boolean; reason?: string }>(`/invoices/${id}/send`));
export const useCancelInvoice = () => useInvalidating((id: string) => admin.post<InvoiceDetail>(`/invoices/${id}/cancel`));

/** Downloads the invoice PDF. */
export async function downloadInvoice(id: string, fileName: string, breakup = true) {
  saveFile(await download("admin", `/api/v1/admin/invoices/${id}/pdf`, { breakup }), fileName);
}
