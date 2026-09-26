import { HttpStatus, Injectable, PipeTransform } from "@nestjs/common";
import { ERROR_CODES } from "@mashkoor/shared";
import type { ZodType } from "zod";
import { AppError } from "./app-error";

/** Validates and transforms input with a shared Zod schema: `@Body(new ZodPipe(schema))`. */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fieldErrors[key] ??= issue.message;
    }
    throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ERROR_CODES.VALIDATION_FAILED, "Please check the highlighted fields", { fieldErrors });
  }
}
