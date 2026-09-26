import { forwardRef, useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "./cn";

export const inputClass =
  "block [:where(&)]:w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-[0_1px_0_rgb(30_19_32/0.03)] placeholder:text-ink-300 transition hover:border-ink-300 focus:border-plum-500 focus:ring-3 focus:ring-plum-100 focus:outline-none aria-invalid:border-red-500 disabled:bg-surface";

export function Field({ label, error, hint, required, children, htmlFor }: { label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink-700">
        {label}
        {required && <span className="text-plum-600"> *</span>}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-sm text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

type InputProps = ComponentProps<"input"> & { label: string; error?: string; hint?: string };

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField({ label, error, hint, required, className, id, ...props }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} error={error} hint={hint} required={required} htmlFor={inputId}>
      <input ref={ref} id={inputId} aria-invalid={Boolean(error)} className={cn(inputClass, className)} {...props} />
    </Field>
  );
});

type SelectProps = ComponentProps<"select"> & { label: string; error?: string };

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(function SelectField({ label, error, required, className, id, children, ...props }, ref) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <Field label={label} error={error} required={required} htmlFor={selectId}>
      <select ref={ref} id={selectId} aria-invalid={Boolean(error)} className={cn(inputClass, "pr-8", className)} {...props}>
        {children}
      </select>
    </Field>
  );
});

type TextareaProps = ComponentProps<"textarea"> & { label: string; error?: string; hint?: string };

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaProps>(function TextareaField({ label, error, hint, required, className, id, ...props }, ref) {
  const autoId = useId();
  const areaId = id ?? autoId;
  return (
    <Field label={label} error={error} hint={hint} required={required} htmlFor={areaId}>
      <textarea ref={ref} id={areaId} aria-invalid={Boolean(error)} rows={3} className={cn(inputClass, "resize-y", className)} {...props} />
    </Field>
  );
});

export function CheckboxField({ label, className, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className={cn("flex items-center gap-2 text-sm text-ink-700", className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-line accent-plum-600" {...props} />
      {label}
    </label>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
      {message}
    </p>
  );
}
