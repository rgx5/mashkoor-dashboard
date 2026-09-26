import type {
  BookingDetail,
  BookingDocumentRow,
  BookingPaymentSummary,
  BookingRow,
  ItineraryRow,
  Paginated,
  PaymentLinkRow,
  TripReview,
  TripReviewInput,
  TripTimeline,
  TripUpdateRow,
} from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";
import { sessionStore } from "@/core/auth/session-store";

const b2c = api("b2c");

export const useMyTrips = (page: number) => useQuery({ queryKey: ["b2c", "trips", "list", page], queryFn: () => b2c.get<Paginated<BookingRow>>("/trips", { page, pageSize: 25 }) });
export const useMyTrip = (id: string) => useQuery({ queryKey: ["b2c", "trips", "detail", id], queryFn: () => b2c.get<BookingDetail>(`/trips/${id}`), enabled: Boolean(id) });
export const useMyTripPayments = (id: string) => useQuery({ queryKey: ["b2c", "trips", "payments", id], queryFn: () => b2c.get<BookingPaymentSummary>(`/trips/${id}/payments`), enabled: Boolean(id) });
/** Creates (or reuses) a payment link for the whole balance; the caller then sends the customer to `url`. */
export const usePayMyBalance = () => useMutation({ mutationFn: (bookingId: string) => b2c.post<PaymentLinkRow>(`/trips/${bookingId}/pay`) });
export const useMyItineraries = () => useQuery({ queryKey: ["b2c", "itineraries"], queryFn: () => b2c.get<ItineraryRow[]>("/itineraries") });

export const useMyTripTimeline = (id: string) => useQuery({ queryKey: ["b2c", "trips", "timeline", id], queryFn: () => b2c.get<TripTimeline>(`/trips/${id}/timeline`), enabled: Boolean(id) });
export const useMyTripDocuments = (id: string) => useQuery({ queryKey: ["b2c", "trips", "documents", id], queryFn: () => b2c.get<BookingDocumentRow[]>(`/trips/${id}/documents`), enabled: Boolean(id) });
export const useMyTripUpdates = (id: string) => useQuery({ queryKey: ["b2c", "trips", "updates", id], queryFn: () => b2c.get<TripUpdateRow[]>(`/trips/${id}/updates`), enabled: Boolean(id) });
export const useMyReview = (id: string) => useQuery({ queryKey: ["b2c", "trips", "review", id], queryFn: () => b2c.get<TripReview | null>(`/trips/${id}/review`), enabled: Boolean(id) });

function useInvalidatingTrip() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["b2c", "trips"] });
}

export function useRequestCancellation(id: string) {
  const invalidate = useInvalidatingTrip();
  return useMutation({ mutationFn: (reason: string) => b2c.post<{ requested: boolean }>(`/trips/${id}/cancel-request`, { reason }), onSuccess: invalidate });
}

export function useSubmitReview(id: string) {
  const invalidate = useInvalidatingTrip();
  return useMutation({ mutationFn: (input: TripReviewInput) => b2c.post<TripReview>(`/trips/${id}/review`, input), onSuccess: invalidate });
}

/** Downloads a document via the API client (so the auth header is attached) rather than a plain link. */
export async function downloadMyDocument(bookingId: string, documentId: string, fileName: string) {
  const res = await fetch(`/api/v1/b2c/trips/${bookingId}/documents/${documentId}/download`, {
    headers: { Authorization: `Bearer ${sessionStore.get("b2c").accessToken ?? ""}` },
  });
  if (!res.ok) throw new Error("Could not download this file");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
