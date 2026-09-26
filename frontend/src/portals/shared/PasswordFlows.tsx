import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, passwordSchema } from "@mashkoor/shared";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { ApiError, authApi, publicAuthPost } from "@/core/api/client";
import { Button } from "@/core/ui/Button";
import { FormError, TextField } from "@/core/ui/form";
import { AuthLayout } from "./AuthLayout";

export function ForgotPasswordPage({ portal }: { portal: "admin" | "b2b" }) {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState } = useForm<{ email: string }>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    await authApi(portal).post("/forgot-password", values).catch(() => undefined);
    setSent(true);
  });

  return (
    <AuthLayout portal={portal} title="Reset your password" subtitle="We'll email you a link to set a new password.">
      {sent ? (
        <div className="rounded-xl bg-plum-50 p-5 text-sm text-plum-800">
          <CheckCircle2 className="mb-2 h-6 w-6 text-plum-600" aria-hidden />
          If an account exists for that email, a reset link is on its way. The link is valid for 30 minutes.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <TextField label="Email" type="email" autoComplete="email" autoFocus error={formState.errors.email?.message} {...register("email")} />
          <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-8 text-center text-sm">
        <Link to={`/${portal}/login`} className="font-semibold text-plum-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

const setPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

/** Used for both accepting an invite and resetting a password — same form, different endpoint. */
export function SetPasswordPage({ portal, mode }: { portal: "admin" | "b2b"; mode: "invite" | "reset" }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const token = params.get("token") ?? "";
  const { register, handleSubmit, formState } = useForm<z.infer<typeof setPasswordSchema>>({ resolver: zodResolver(setPasswordSchema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await publicAuthPost(mode === "invite" ? "/accept-invite" : "/reset-password", { token, password });
      navigate(`/${portal}/login`, { replace: true, state: { notice: "Password set. You can now sign in." } });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  });

  return (
    <AuthLayout
      portal={portal}
      title={mode === "invite" ? "Welcome to Mashkoor" : "Choose a new password"}
      subtitle={mode === "invite" ? "Set a password to activate your account." : "Use at least 10 characters with letters and numbers."}
    >
      {!token ? (
        <FormError message="This link is incomplete. Please use the link from your email." />
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <FormError message={formError} />
          <TextField label="New password" type="password" autoComplete="new-password" autoFocus hint="At least 10 characters, with letters and numbers" error={formState.errors.password?.message} {...register("password")} />
          <TextField label="Confirm password" type="password" autoComplete="new-password" error={formState.errors.confirm?.message} {...register("confirm")} />
          <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
            {mode === "invite" ? "Activate account" : "Set password"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
