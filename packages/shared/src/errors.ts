/** Stable API error codes (PROJECT_PLAN §8.1). The frontend switches on these, never on messages. */
export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  WRONG_PORTAL: "WRONG_PORTAL",
  TOKEN_INVALID: "TOKEN_INVALID",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorBody {
  statusCode: number;
  code: ErrorCode | string;
  message: string;
  details?: unknown;
  requestId?: string;
}
