import { z } from "zod";
import { ROLES, STAFF_ROLES, type Portal, type Role, type UserStatus, type UserType } from "./constants";
import { patchOf } from "./patch";

export const loginSchema = z.object({
  email: z.email("Enter a valid email address").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Enter your password"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

export const acceptInviteSchema = z.object({
  token: z.string().min(20),
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase().trim()),
});

export const resetPasswordSchema = acceptInviteSchema;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const otpRequestSchema = z.object({
  email: z.email("Enter a valid email address").transform((v) => v.toLowerCase().trim()),
});
export const otpVerifySchema = otpRequestSchema.extend({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

export const createStaffUserSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  email: z.email("Enter a valid email address").transform((v) => v.toLowerCase().trim()),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => v || undefined),
  role: z.enum(STAFF_ROLES),
});
export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>;

export const updateStaffUserSchema = patchOf(createStaffUserSchema.omit({ email: true }));
export type UpdateStaffUserInput = z.infer<typeof updateStaffUserSchema>;

/** Claims inside an access token. `aud` is the portal the token is valid for. */
export interface AccessTokenClaims {
  sub: string;
  aud: Portal;
  role: Role;
  partnerId?: string | null;
  customerId?: string | null;
}

/** Serialisable CASL rule, sent to the frontend so UI can hide actions. */
export interface AbilityRule {
  action: string | string[];
  subject: string | string[];
  conditions?: Record<string, unknown>;
  fields?: string[];
  inverted?: boolean;
}

export interface SessionUser {
  id: string;
  type: UserType;
  role: Role;
  name: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  partnerId: string | null;
  customerId: string | null;
}

export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
}

export interface MeResponse {
  user: SessionUser;
  portal: Portal;
  rules: AbilityRule[];
}

export const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);
