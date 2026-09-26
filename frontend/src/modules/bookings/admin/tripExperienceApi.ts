import type { BookingDocumentKind, BookingDocumentRow, TripUpdateRow } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";
import { sessionStore } from "@/core/auth/session-store";

const admin = api("admin");
const key = ["admin", "trip-experience"] as const;

export const useBookingUpdates = (bookingId: string) => useQuery({ queryKey: [...key, "updates", bookingId], queryFn: () => admin.get<TripUpdateRow[]>("/trip-updates", { bookingId }), enabled: Boolean(bookingId) });
export const useBookingDocuments = (bookingId: string) => useQuery({ queryKey: [...key, "documents", bookingId], queryFn: () => admin.get<BookingDocumentRow[]>("/documents", { bookingId }), enabled: Boolean(bookingId) });

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: key }) });
}

export const usePostTripUpdate = () => useInvalidating(({ bookingId, message, notify }: { bookingId: string; message: string; notify: boolean }) => admin.post<TripUpdateRow>("/trip-updates", { bookingId, message, notify }));
export const useDeleteTripUpdate = () => useInvalidating((id: string) => admin.delete<void>(`/trip-updates/${id}`));
export const useSetDocumentVisibility = () => useInvalidating(({ id, visibleToCustomer }: { id: string; visibleToCustomer: boolean }) => admin.patch<BookingDocumentRow>(`/documents/${id}/visibility`, { visibleToCustomer }));
export const useDeleteDocument = () => useInvalidating((id: string) => admin.delete<void>(`/documents/${id}`));

export interface UploadDocumentInput {
  bookingId: string;
  file: File;
  name: string;
  kind: BookingDocumentKind;
  visibleToCustomer: boolean;
  notify: boolean;
}

export function useUploadDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: UploadDocumentInput) => {
      const params = new URLSearchParams({
        bookingId: input.bookingId,
        name: input.name,
        fileName: input.file.name,
        kind: input.kind,
        visibleToCustomer: String(input.visibleToCustomer),
        notify: String(input.notify),
      });
      const body = new FormData();
      body.append("file", input.file);
      const res = await fetch(`/api/v1/admin/documents?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionStore.get("admin").accessToken ?? ""}` },
        body,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? "Upload failed");
      return json as BookingDocumentRow;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
}

export async function downloadDocument(id: string, fileName: string) {
  const res = await fetch(`/api/v1/admin/documents/${id}/download`, { headers: { Authorization: `Bearer ${sessionStore.get("admin").accessToken ?? ""}` } });
  if (!res.ok) throw new Error("Could not download this file");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
