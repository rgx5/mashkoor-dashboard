import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "./client";

/** Maps API field errors onto a react-hook-form form; returns the top-level message. */
export function applyApiErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Please try again.";
  for (const [field, message] of Object.entries(error.fieldErrors)) setError(field as Path<T>, { message });
  return error.message;
}

export const errorMessage = (error: unknown, fallback = "Something went wrong") => (error instanceof ApiError ? error.message : fallback);

/** Runs a mutation and shows a toast either way. */
export async function withToast<T>(action: Promise<T>, success: string): Promise<T | undefined> {
  try {
    const result = await action;
    toast.success(success);
    return result;
  } catch (error) {
    toast.error(errorMessage(error));
    return undefined;
  }
}
