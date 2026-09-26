import type { ReportName, ReportResult } from "@mashkoor/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/core/api/client";

export const useReport = (name: ReportName, from?: string, to?: string) =>
  useQuery({ queryKey: ["admin", "reports", name, from, to], queryFn: () => api("admin").get<ReportResult>(`/reports/${name}`, { from, to }) });
