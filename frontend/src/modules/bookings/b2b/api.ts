import type { B2BFlightAvailability, B2BInventorySearchQuery, B2BRoomAvailability, BookingData, BookingDetail, BookingRow, Paginated } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const b2b = api("b2b");
const key = ["b2b", "bookings"] as const;
const inventoryKey = ["b2b", "inventory"] as const;

export const useMyRoomAvailability = (query: B2BInventorySearchQuery, enabled: boolean) =>
  useQuery({ queryKey: [...inventoryKey, "search", query], queryFn: () => b2b.get<B2BRoomAvailability[]>("/inventory/search", { ...query }), enabled });
export const useMyFlightAvailability = (query: B2BInventorySearchQuery, enabled: boolean) =>
  useQuery({ queryKey: [...inventoryKey, "search", query], queryFn: () => b2b.get<B2BFlightAvailability[]>("/inventory/search", { ...query }), enabled });

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
