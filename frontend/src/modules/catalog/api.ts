import type {
  Destination,
  DestinationInput,
  DestinationListQuery,
  DestinationUpdateData,
  Faq,
  FaqInput,
  FaqUpdateData,
  Paginated,
  PackageDepartureData,
  PackageDepartureRow,
  PackageDepartureUpdateData,
  PackageDetail,
  PackageInput,
  PackageListQuery,
  PackageRow,
  PackageUpdateData,
  Testimonial,
  TestimonialInput,
  TestimonialUpdateData,
} from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const admin = api("admin");

function crudHooks<TRow, TInput, TUpdate>(key: string, base: string) {
  const invalidate = (client: ReturnType<typeof useQueryClient>) => client.invalidateQueries({ queryKey: ["admin", key] });
  return {
    useCreate: () => {
      const client = useQueryClient();
      return useMutation({ mutationFn: (input: TInput) => admin.post<TRow>(base, input), onSuccess: () => invalidate(client) });
    },
    useUpdate: () => {
      const client = useQueryClient();
      return useMutation({ mutationFn: ({ id, input }: { id: string; input: TUpdate }) => admin.patch<TRow>(`${base}/${id}`, input), onSuccess: () => invalidate(client) });
    },
    useDelete: () => {
      const client = useQueryClient();
      return useMutation({ mutationFn: (id: string) => admin.delete<void>(`${base}/${id}`), onSuccess: () => invalidate(client) });
    },
  };
}

// ─── Destinations ───────────────────────────────────────────────────────────

export const useDestinations = (filters: Partial<DestinationListQuery>) => useQuery({ queryKey: ["admin", "destinations", filters], queryFn: () => admin.get<Paginated<Destination>>("/destinations", { ...filters }) });
const destinationCrud = crudHooks<Destination, DestinationInput, DestinationUpdateData>("destinations", "/destinations");
export const useCreateDestination = destinationCrud.useCreate;
export const useUpdateDestination = destinationCrud.useUpdate;
export const useDeleteDestination = destinationCrud.useDelete;

// ─── Packages ───────────────────────────────────────────────────────────────

export const packageKeys = { detail: (id: string) => ["admin", "packages", "detail", id] as const };
export const usePackages = (filters: Partial<PackageListQuery>) => useQuery({ queryKey: ["admin", "packages", "list", filters], queryFn: () => admin.get<Paginated<PackageRow>>("/packages", { ...filters }) });
export const usePackage = (id: string) => useQuery({ queryKey: packageKeys.detail(id), queryFn: () => admin.get<PackageDetail>(`/packages/${id}`), enabled: Boolean(id) });

function useInvalidating<TArgs, TResult>(key: string, fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["admin", key] }) });
}

export const useCreatePackage = () => useInvalidating("packages", (input: PackageInput) => admin.post<PackageDetail>("/packages", input));
export const useUpdatePackage = () => useInvalidating("packages", ({ id, input }: { id: string; input: PackageUpdateData }) => admin.patch<PackageDetail>(`/packages/${id}`, input));
export const useDeletePackage = () => useInvalidating("packages", (id: string) => admin.delete<void>(`/packages/${id}`));

// ─── Package departures ─────────────────────────────────────────────────────

export const usePackageDepartures = (packageId: string) =>
  useQuery({ queryKey: ["admin", "packages", packageId, "departures"], queryFn: () => admin.get<PackageDepartureRow[]>(`/packages/${packageId}/departures`), enabled: Boolean(packageId) });

function useInvalidatingDepartures<TArgs, TResult>(packageId: string, fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "packages", packageId, "departures"] }) });
}

export const useCreateDeparture = (packageId: string) => useInvalidatingDepartures(packageId, (input: PackageDepartureData) => admin.post<PackageDepartureRow>(`/packages/${packageId}/departures`, input));
export const useUpdateDeparture = (packageId: string) =>
  useInvalidatingDepartures(packageId, ({ id, input }: { id: string; input: PackageDepartureUpdateData }) => admin.patch<PackageDepartureRow>(`/packages/${packageId}/departures/${id}`, input));
export const useDeleteDeparture = (packageId: string) => useInvalidatingDepartures(packageId, (id: string) => admin.delete<void>(`/packages/${packageId}/departures/${id}`));

// ─── Testimonials & FAQs ────────────────────────────────────────────────────

export const useTestimonials = (filters: { page: number; q?: string }) =>
  useQuery({ queryKey: ["admin", "testimonials", filters], queryFn: () => admin.get<Paginated<Testimonial>>("/testimonials", { ...filters, pageSize: 50 }) });
const testimonialCrud = crudHooks<Testimonial, TestimonialInput, TestimonialUpdateData>("testimonials", "/testimonials");
export const useCreateTestimonial = testimonialCrud.useCreate;
export const useUpdateTestimonial = testimonialCrud.useUpdate;
export const useDeleteTestimonial = testimonialCrud.useDelete;

export const useFaqs = () => useQuery({ queryKey: ["admin", "faqs"], queryFn: () => admin.get<Faq[]>("/faqs") });
const faqCrud = crudHooks<Faq, FaqInput, FaqUpdateData>("faqs", "/faqs");
export const useCreateFaq = faqCrud.useCreate;
export const useUpdateFaq = faqCrud.useUpdate;
export const useDeleteFaq = faqCrud.useDelete;
