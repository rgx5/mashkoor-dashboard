import type { AdminDashboardSummary, B2BDashboardSummary, CustomerHome } from "@mashkoor/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/core/api/client";

export const useAdminDashboard = () => useQuery({ queryKey: ["admin", "dashboard"], queryFn: () => api("admin").get<AdminDashboardSummary>("/dashboard"), refetchInterval: 60_000 });
export const useB2BDashboard = () => useQuery({ queryKey: ["b2b", "dashboard"], queryFn: () => api("b2b").get<B2BDashboardSummary>("/dashboard") });
/** "What needs you" for the signed-in customer — replaces the older, plainer /b2c/dashboard summary. */
export const useCustomerHome = () => useQuery({ queryKey: ["b2c", "home"], queryFn: () => api("b2c").get<CustomerHome>("/home") });
