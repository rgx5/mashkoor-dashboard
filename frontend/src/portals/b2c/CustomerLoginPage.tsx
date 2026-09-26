import { zodResolver } from "@hookform/resolvers/zod";
import { otpRequestSchema, otpVerifySchema, type OtpVerifyInput } from "@mashkoor/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router";
import { ApiError } from "@/core/api/client";
import { requestCustomerCode, signInWithCode } from "@/core/auth/actions";
import { useSession } from "@/core/auth/session-store";
import { Button } from "@/core/ui/Button";
import { FormError, TextField } from "@/core/ui/form";
import { AuthLayout } from "../shared/AuthLayout";

/** Customers sign in with a one-time code sent to their email — no passwords to remember. */
export function CustomerLoginPage() {
  const session = useSession("b2c");
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const emailForm = useForm<{ email: string }>({ resolver: zodResolver(otpRequestSchema) });
  const codeForm = useForm<OtpVerifyInput>({ resolver: zodResolver(otpVerifySchema) });

  if (session.status === "authenticated") return <Navigate to="/b2c" replace />;

  const sendCode = emailForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await requestCustomerCode(values.email);
      setEmail(values.email);
      codeForm.reset({ email: values.email, code: "" });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Unable to send a code right now.");
    }
  });

  const verify = codeForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signInWithCode(values);
      navigate("/b2c", { replace: true });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Unable to sign in right now.");
    }
  });

  return (
    <AuthLayout portal="b2c" title={email ? "Enter your code" : "Sign in to My Trips"} subtitle={email ? `We sent a 6-digit code to ${email}.` : "Use the email address you gave Mashkoor when booking."}>
      <FormError message={formError} />
      {!email ? (
        <form onSubmit={sendCode} className="mt-5 space-y-5" noValidate>
          <TextField label="Email" type="email" autoComplete="email" autoFocus error={emailForm.formState.errors.email?.message} {...emailForm.register("email")} />
          <Button type="submit" size="lg" className="w-full" loading={emailForm.formState.isSubmitting}>
            Send code
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-5 space-y-5" noValidate>
          <input type="hidden" {...codeForm.register("email")} />
          <TextField
            label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            className="text-center text-2xl tracking-[0.5em]"
            error={codeForm.formState.errors.code?.message}
            {...codeForm.register("code")}
          />
          <Button type="submit" size="lg" className="w-full" loading={codeForm.formState.isSubmitting}>
            Sign in
          </Button>
          <button type="button" onClick={() => setEmail(null)} className="w-full text-sm font-semibold text-plum-700 hover:underline">
            Use a different email
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
