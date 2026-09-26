import type {
  FlightSeatBlockData,
  FlightSeatBlockListQuery,
  FlightSeatBlockRow,
  FlightSeatBlockUpdateData,
  HotelData,
  HotelDetail,
  HotelListQuery,
  HotelRow,
  HotelUpdateData,
  InventorySearchQuery,
  Paginated,
  RatePeriodData,
  RatePeriodRow,
  RatePeriodUpdateData,
  RoomAvailability,
  RoomTypeData,
  RoomTypeRow,
  RoomTypeUpdateData,
} from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const admin = api("admin");
const inventoryKey = ["admin", "inventory"] as const;

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: inventoryKey }) });
}

// ─── Hotels ─────────────────────────────────────────────────────────────────

export const useHotels = (filters: Partial<HotelListQuery>) => useQuery({ queryKey: [...inventoryKey, "hotels", filters], queryFn: () => admin.get<Paginated<HotelRow>>("/hotels", { ...filters }) });
export const useHotel = (id: string) => useQuery({ queryKey: [...inventoryKey, "hotels", "detail", id], queryFn: () => admin.get<HotelDetail>(`/hotels/${id}`), enabled: Boolean(id) });

export const useCreateHotel = () => useInvalidating((input: HotelData) => admin.post<HotelRow>("/hotels", input));
export const useUpdateHotel = () => useInvalidating(({ id, input }: { id: string; input: HotelUpdateData }) => admin.patch<HotelRow>(`/hotels/${id}`, input));
export const useDeleteHotel = () => useInvalidating((id: string) => admin.delete<void>(`/hotels/${id}`));

export const useCreateRoomType = () => useInvalidating((input: RoomTypeData) => admin.post<RoomTypeRow>("/hotels/room-types", input));
export const useUpdateRoomType = () => useInvalidating(({ id, input }: { id: string; input: RoomTypeUpdateData }) => admin.patch<RoomTypeRow>(`/hotels/room-types/${id}`, input));
export const useDeleteRoomType = () => useInvalidating((id: string) => admin.delete<void>(`/hotels/room-types/${id}`));

export const useCreateRatePeriod = () => useInvalidating((input: RatePeriodData) => admin.post<RatePeriodRow>("/hotels/rate-periods", input));
export const useUpdateRatePeriod = () => useInvalidating(({ id, input }: { id: string; input: RatePeriodUpdateData }) => admin.patch<RatePeriodRow>(`/hotels/rate-periods/${id}`, input));
export const useDeleteRatePeriod = () => useInvalidating((id: string) => admin.delete<void>(`/hotels/rate-periods/${id}`));

// ─── Flights ────────────────────────────────────────────────────────────────

export const useFlightSeatBlocks = (filters: Partial<FlightSeatBlockListQuery>) =>
  useQuery({ queryKey: [...inventoryKey, "flights", filters], queryFn: () => admin.get<Paginated<FlightSeatBlockRow>>("/flight-inventory", { ...filters }) });
export const useCreateFlightSeatBlock = () => useInvalidating((input: FlightSeatBlockData) => admin.post<FlightSeatBlockRow>("/flight-inventory", input));
export const useUpdateFlightSeatBlock = () => useInvalidating(({ id, input }: { id: string; input: FlightSeatBlockUpdateData }) => admin.patch<FlightSeatBlockRow>(`/flight-inventory/${id}`, input));
export const useDeleteFlightSeatBlock = () => useInvalidating((id: string) => admin.delete<void>(`/flight-inventory/${id}`));

// ─── Search (used by the booking wizard) ───────────────────────────────────

export const useRoomAvailability = (query: InventorySearchQuery, enabled: boolean) =>
  useQuery({ queryKey: [...inventoryKey, "search", query], queryFn: () => admin.get<RoomAvailability[]>("/inventory/search", { ...query }), enabled });
export const useFlightAvailability = (query: InventorySearchQuery, enabled: boolean) =>
  useQuery({ queryKey: [...inventoryKey, "search", query], queryFn: () => admin.get<FlightSeatBlockRow[]>("/inventory/search", { ...query }), enabled });
