import { z } from "zod";

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || undefined),
  /** e.g. `-createdAt` for descending */
  sort: z
    .string()
    .regex(/^-?[a-zA-Z]+$/)
    .optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
