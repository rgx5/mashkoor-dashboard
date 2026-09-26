import type { BookingPaymentSummary, Paginated, PaymentInput, PaymentLinkInput, PaymentLinkRow, PaymentListQuery, PaymentRow } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const admin = api("admin");
const paymentsKey = ["admin", "payments"] as const;

export const usePayments = (filters: Partial<PaymentListQuery>) => useQuery({ queryKey: [...paymentsKey, "list", filters], queryFn: () => admin.get<Paginated<PaymentRow>>("/payments", { ...filters }) });
export const useBookingPayments = (bookingId: string) => useQuery({ queryKey: [...paymentsKey, "booking", bookingId], queryFn: () => admin.get<BookingPaymentSummary>(`/payments/booking/${bookingId}/summary`), enabled: Boolean(bookingId) });
export const useBookingLinks = (bookingId: string) => useQuery({ queryKey: [...paymentsKey, "links", bookingId], queryFn: () => admin.get<PaymentLinkRow[]>("/payment-links", { bookingId }), enabled: Boolean(bookingId) });

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }) });
}

export const useRecordPayment = () => useInvalidating((input: PaymentInput) => admin.post<PaymentRow>("/payments", input));
export const useVerifyPayment = () => useInvalidating((id: string) => admin.post<PaymentRow>(`/payments/${id}/verify`));
export const useRejectPayment = () => useInvalidating(({ id, reason }: { id: string; reason: string }) => admin.post<PaymentRow>(`/payments/${id}/reject`, { reason }));
export const useCreatePaymentLink = () => useInvalidating((input: PaymentLinkInput) => admin.post<PaymentLinkRow>("/payment-links", input));
export const useCancelPaymentLink = () => useInvalidating((id: string) => admin.post<PaymentLinkRow>(`/payment-links/${id}/cancel`));
export const useSendPaymentLink = () => useInvalidating((id: string) => admin.post<{ sent: boolean; reason?: string }>(`/payment-links/${id}/send`));
