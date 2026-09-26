import type { BookingData, BookingDetail, BookingRow, Paginated } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const b2b = api("b2b");
const key = ["b2b", "bookings"] as const;

export const useMyBookings = (filters: { page: number; status?: string }) => useQuery({ queryKey: [...key, "list", filters], queryFn: () => b2b.get<Paginated<BookingRow>>("/bookings", { ...filters, pageSize: 25 }) });
export const useMyBooking = (id: string) => useQuery({ queryKey: [...key, "detail", id], queryFn: () => b2b.get<BookingDetail>(`/bookings/${id}`), enabled: Boolean(id) });

export function useCancelMyBooking() {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => b2b.post<BookingDetail>(`/bookings/${id}/cancel`, { reason }), onSuccess: () => client.invalidateQueries({ queryKey: key }) });
}

export function useCreateMyBooking() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: BookingData) => b2b.post<BookingDetail>("/bookings", input), onSuccess: () => client.invalidateQueries({ queryKey: key }) });
}
