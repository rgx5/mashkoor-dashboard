import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@mashkoor/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { ApiError } from "@/core/api/client";
import { signInWithPassword } from "@/core/auth/actions";
import { useSession } from "@/core/auth/session-store";
import { Button } from "@/core/ui/Button";
import { FormError, TextField } from "@/core/ui/form";
import { AuthLayout } from "./AuthLayout";

/** The public website, where agencies apply. Override with VITE_WEBSITE_URL for staging. */
const WEBSITE_URL = ((import.meta.env.VITE_WEBSITE_URL as string | undefined) || "https://mashkoor.co.in").replace(/\/$/, "");

const safeNext = (next: string | null, portal: string) => (next && next.startsWith(`/${portal}`) && !next.startsWith("//") ? next : `/${portal}`);

export function PasswordLoginPage({ portal }: { portal: "admin" | "b2b" }) {
  const session = useSession(portal);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  if (session.status === "authenticated") return <Navigate to={safeNext(params.get("next"), portal)} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signInWithPassword(portal, values);
      navigate(safeNext(params.get("next"), portal), { replace: true });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Unable to sign in. Check your connection and try again.");
    }
  });

  return (
    <AuthLayout portal={portal} title="Sign in" subtitle={portal === "admin" ? "Use your Mashkoor staff account." : "Use your partner account."}>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <FormError message={formError} />
        <TextField label="Email" type="email" autoComplete="email" autoFocus error={formState.errors.email?.message} {...register("email")} />
        <TextField label="Password" type="password" autoComplete="current-password" error={formState.errors.password?.message} {...register("password")} />
        <div className="flex justify-end">
          <Link to={`/${portal}/forgot-password`} className="text-sm font-semibold text-plum-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Sign in
        </Button>
      </form>
      {portal === "b2b" && (
        <p className="mt-8 text-center text-sm text-ink-500">
          Not a partner yet?{" "}
          <a href={`${WEBSITE_URL}/b2b-partners`} className="font-semibold text-plum-700 hover:underline">
            Apply to join
          </a>
        </p>
      )}
    </AuthLayout>
  );
}
