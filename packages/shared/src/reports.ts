import { z } from "zod";

export const REPORT_NAMES = ["sales", "ageing", "daybook", "lead-sources", "staff-performance"] as const;
export type ReportName = (typeof REPORT_NAMES)[number];

export const REPORT_INFO: Record<ReportName, { title: string; description: string }> = {
  sales: { title: "Sales register", description: "Every booking sold in the period, with what's been collected and what's still due." },
  ageing: { title: "Receivables ageing", description: "Money still owed by customers, grouped by how long the booking has been open." },
  daybook: { title: "Daybook", description: "All payments and refunds recorded in the period, by day and method." },
  "lead-sources": { title: "Lead sources", description: "Where enquiries come from and how many turn into bookings." },
  "staff-performance": { title: "Staff performance", description: "Leads, wins, bookings and sales value per team member." },
};

export const reportQuerySchema = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });
export type ReportQuery = z.output<typeof reportQuerySchema>;

export type ReportValueKind = "text" | "number" | "money" | "date" | "percent";

export interface ReportResult {
  name: ReportName;
  title: string;
  /** `YYYY-MM-DD`. For point-in-time reports (ageing) both are today. */
  period: { from: string; to: string };
  summary: { label: string; value: number | string; kind: ReportValueKind }[];
  columns: { key: string; label: string; kind: ReportValueKind }[];
  rows: Record<string, string | number | null>[];
}
