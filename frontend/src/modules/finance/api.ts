import type { FinanceBookingsPage, FinanceBookingsQuery, FinanceEntryInput, FinanceOverview, FinanceRange, LedgerPage, LedgerQuery, LedgerRow } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, download, saveFile } from "@/core/api/client";
import { sessionStore } from "@/core/auth/session-store";

const admin = api("admin");
const key = ["admin", "finance"] as const;

export const useFinanceOverview = (range: FinanceRange) => useQuery({ queryKey: [...key, "overview", range], queryFn: () => admin.get<FinanceOverview>("/finance/overview", { ...range }) });
export const useLedger = (query: Partial<LedgerQuery>) => useQuery({ queryKey: [...key, "ledger", query], queryFn: () => admin.get<LedgerPage>("/finance/ledger", { ...query }) });
export const useFinanceBookings = (query: Partial<FinanceBookingsQuery>) => useQuery({ queryKey: [...key, "bookings", query], queryFn: () => admin.get<FinanceBookingsPage>("/finance/bookings", { ...query }) });
export const useFinanceParties = () => useQuery({ queryKey: [...key, "parties"], queryFn: () => admin.get<string[]>("/finance/parties"), staleTime: 60_000 });

/** The whole range at once, for the CSV — the screen itself only ever loads one page. */
export const fetchWholeLedger = (query: Partial<LedgerQuery>) => admin.get<LedgerPage>("/finance/ledger", { ...query, page: 1, pageSize: 5000 });

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: key }) });
}

export const useCreateFinanceEntry = () => useInvalidating((input: FinanceEntryInput) => admin.post<LedgerRow>("/finance/entries", input));
export const useReverseFinanceEntry = () => useInvalidating(({ id, reason }: { id: string; reason: string }) => admin.post<LedgerRow>(`/finance/entries/${id}/reverse`, { reason }));

export async function uploadReceipt(id: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/v1/admin/finance/entries/${id}/receipt`, { method: "POST", headers: { Authorization: `Bearer ${sessionStore.get("admin").accessToken ?? ""}` }, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message ?? "Could not upload the receipt");
}

export async function downloadReceipt(id: string, fileName: string) {
  saveFile(await download("admin", `/api/v1/admin/finance/entries/${id}/receipt`), fileName);
}
