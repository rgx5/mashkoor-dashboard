import { z } from "zod";

/**
 * Builds the schema for a PATCH body from an object schema: every field becomes optional, and a field the caller
 * did NOT send stays absent from the parsed result.
 *
 * Plain `.partial()` is not enough. In Zod 4 an omitted key still runs through `.default(...)` and through
 * `.optional().nullable().transform(v => v || null)`, so a PATCH of `{ status: "DONE" }` would silently reset every
 * defaulted field and null every optional text field. Sending an explicit `null` or `""` still clears a field.
 *
 * The result has exactly the type `.partial()` would give, so forms and services are typed as before.
 */
export function patchOf<T extends z.ZodObject<z.ZodRawShape>>(schema: T): z.ZodObject<{ [K in keyof T["shape"]]: z.ZodOptional<T["shape"][K]> }> {
  const shape: Record<string, z.ZodType> = {};
  // `preprocess` hides the inner schema's own "I accept undefined" flag, so `optional()` short-circuits before any
  // default or transform runs. Present values are validated by the original field, with its original messages.
  for (const [key, field] of Object.entries(schema.shape)) shape[key] = z.optional(z.preprocess((value) => value, field as z.ZodType));
  return z.object(shape) as never;
}
