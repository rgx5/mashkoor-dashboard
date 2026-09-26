import type { BookingDetail, BookingInput, BookingItemInput, BookingListQuery, BookingRow, BookingStatusChange, BookingUpdateData, Paginated } from "@mashkoor/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";
import { sessionStore } from "@/core/auth/session-store";

const admin = api("admin");
const bookingsKey = ["admin", "bookings"] as const;

export const useBookings = (filters: Partial<BookingListQuery>) =>
  useQuery({ queryKey: [...bookingsKey, "list", filters], queryFn: () => admin.get<Paginated<BookingRow>>("/bookings", { ...filters }), placeholderData: keepPreviousData });

export const useBooking = (id: string) => useQuery({ queryKey: [...bookingsKey, "detail", id], queryFn: () => admin.get<BookingDetail>(`/bookings/${id}`), enabled: Boolean(id) });

/** The export endpoint needs the bearer token, so it's fetched and saved as a file rather than linked to directly. */
export async function downloadBookingsCsv(query: Record<string, string | undefined>) {
  const params = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => Boolean(e[1])));
  const token = sessionStore.get("admin").accessToken;
  const res = await fetch(`/api/v1/admin/bookings/export?${params.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "bookings.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: bookingsKey }) });
}

export const useCreateBooking = () => useInvalidating((input: BookingInput) => admin.post<BookingDetail>("/bookings", input));
export const useUpdateBooking = () => useInvalidating(({ id, input }: { id: string; input: BookingUpdateData }) => admin.patch<BookingDetail>(`/bookings/${id}`, input));
export const useAddBookingItem = () => useInvalidating(({ id, input }: { id: string; input: BookingItemInput }) => admin.post<BookingDetail>(`/bookings/${id}/items`, input));
export const useRemoveBookingItem = () => useInvalidating(({ id, itemId }: { id: string; itemId: string }) => admin.delete<BookingDetail>(`/bookings/${id}/items/${itemId}`));
export const useChangeBookingStatus = () => useInvalidating(({ id, input }: { id: string; input: BookingStatusChange }) => admin.post<BookingDetail>(`/bookings/${id}/status`, input));
