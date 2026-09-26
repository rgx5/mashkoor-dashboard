import { useQuery } from "@tanstack/react-query";
import { api } from "@/core/api/client";

/** Every destination, for pickers (package editor). */
export function useDestinationOptions() {
  const { data } = useQuery({
    queryKey: ["admin", "destinations", "options"],
    queryFn: () => api("admin").get<{ data: { id: string; name: string }[] }>("/destinations", { page: 1, pageSize: 200 }),
    staleTime: 60_000,
  });
  return data?.data ?? [];
}
