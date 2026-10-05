import type { B2BFlightAvailability, B2BRoomAvailability, ItineraryDetail, ItineraryInput, ItineraryListQuery, ItineraryRow, Paginated, QuoteInventorySearchQuery, QuoteTransportOption } from "@mashkoor/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, download, saveFile } from "@/core/api/client";

const admin = api("admin");
const key = ["admin", "itineraries"] as const;

export type ItineraryFilters = Partial<Omit<ItineraryListQuery, "template">> & { template?: "true" | "false" };

export const useItineraries = (filters: ItineraryFilters) =>
  useQuery({ queryKey: [...key, "list", filters], queryFn: () => admin.get<Paginated<ItineraryRow>>("/itineraries", { pageSize: 25, ...filters }), placeholderData: keepPreviousData });
export const useItinerary = (id: string) => useQuery({ queryKey: [...key, "detail", id], queryFn: () => admin.get<ItineraryDetail>(`/itineraries/${id}`), enabled: Boolean(id) });

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }) });
}

export const useQuoteRooms = (query: QuoteInventorySearchQuery, enabled: boolean) =>
  useQuery({ queryKey: [...key, "rooms", query], queryFn: () => admin.get<B2BRoomAvailability[]>("/inventory/quote-search", { ...query }), enabled });
export const useQuoteTransport = (query: QuoteInventorySearchQuery, enabled: boolean) =>
  useQuery({ queryKey: [...key, "transport", query], queryFn: () => admin.get<QuoteTransportOption[]>("/inventory/quote-search", { ...query }), enabled });
export const useQuoteFlights = (query: QuoteInventorySearchQuery, enabled: boolean) =>
  useQuery({ queryKey: [...key, "flights", query], queryFn: () => admin.get<B2BFlightAvailability[]>("/inventory/quote-search", { ...query }), enabled });

export const useCreateItinerary = () => useInvalidating((input: ItineraryInput) => admin.post<ItineraryDetail>("/itineraries", input));
export const useUpdateItinerary = () => useInvalidating(({ id, input }: { id: string; input: Partial<ItineraryInput> }) => admin.patch<ItineraryDetail>(`/itineraries/${id}`, input));
export const useDeleteItinerary = () => useInvalidating((id: string) => admin.delete<void>(`/itineraries/${id}`));
export const useDuplicateItinerary = () => useInvalidating(({ id, customerId, leadId }: { id: string; customerId?: string | null; leadId?: string | null }) => admin.post<ItineraryDetail>(`/itineraries/${id}/duplicate`, { customerId, leadId }));
export const useShareItinerary = () => useInvalidating(({ id, validForDays }: { id: string; validForDays: number }) => admin.post<ItineraryDetail>(`/itineraries/${id}/share`, { validForDays }));
export const useUnshareItinerary = () => useInvalidating((id: string) => admin.post<ItineraryDetail>(`/itineraries/${id}/unshare`));
export const useSendItinerary = () => useInvalidating((id: string) => admin.post<{ sent: boolean; reason?: string }>(`/itineraries/${id}/send`));
export const useConvertItinerary = () => useInvalidating((id: string) => admin.post<{ itinerary: ItineraryDetail; bookingId: string }>(`/itineraries/${id}/convert`));

/** Downloads the quotation PDF. `breakup` false prints one package price instead of a price per item. */
export async function downloadQuotation(id: string, fileName: string, breakup = true) {
  saveFile(await download("admin", `/api/v1/admin/itineraries/${id}/pdf`, breakup ? {} : { breakup: "false" }), fileName);
}
