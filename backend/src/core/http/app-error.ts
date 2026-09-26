import { HttpException, HttpStatus } from "@nestjs/common";
import { ERROR_CODES, type ErrorCode } from "@mashkoor/shared";

/** HttpException carrying a stable machine-readable `code` (see @mashkoor/shared ERROR_CODES). */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: ErrorCode | string,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  static unauthenticated(message = "Please sign in to continue") {
    return new AppError(HttpStatus.UNAUTHORIZED, ERROR_CODES.UNAUTHENTICATED, message);
  }
  static forbidden(message = "You don't have permission to do this") {
    return new AppError(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, message);
  }
  static notFound(entity = "Record") {
    return new AppError(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, `${entity} not found`);
  }
  static conflict(message: string) {
    return new AppError(HttpStatus.CONFLICT, ERROR_CODES.CONFLICT, message);
  }
}
