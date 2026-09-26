import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { ERROR_CODES, type ApiErrorBody } from "@mashkoor/shared";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";

const STATUS_CODES: Partial<Record<number, string>> = {
  400: ERROR_CODES.VALIDATION_FAILED,
  401: ERROR_CODES.UNAUTHENTICATED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.CONFLICT,
  429: ERROR_CODES.RATE_LIMITED,
};

/** Every error leaves the API in the same shape: { statusCode, code, message, details?, requestId }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    let body: ApiErrorBody;

    if (exception instanceof ThrottlerException) {
      body = { statusCode: 429, code: ERROR_CODES.RATE_LIMITED, message: "Too many requests. Please wait a moment and try again." };
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse() as string | { code?: string; message?: string | string[]; details?: unknown };
      const message = typeof response === "string" ? response : Array.isArray(response.message) ? response.message.join(", ") : (response.message ?? exception.message);
      body = {
        statusCode: status,
        code: (typeof response === "object" && response.code) || STATUS_CODES[status] || ERROR_CODES.INTERNAL_ERROR,
        message,
        details: typeof response === "object" ? response.details : undefined,
      };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === "P2002") {
      body = { statusCode: 409, code: ERROR_CODES.CONFLICT, message: "A record with these details already exists" };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === "P2025") {
      body = { statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: "Record not found" };
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      body = { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, code: ERROR_CODES.INTERNAL_ERROR, message: "Something went wrong. Please try again." };
    }

    body.requestId = typeof req.id === "string" ? req.id : undefined;
    res.status(body.statusCode).json(body);
  }
}
