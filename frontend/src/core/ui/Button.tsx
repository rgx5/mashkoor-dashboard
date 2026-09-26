import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-plum-600 text-white hover:bg-plum-700 shadow-sm",
  secondary: "bg-white text-ink-900 border border-line hover:bg-plum-50 hover:border-plum-200",
  ghost: "text-ink-700 hover:bg-plum-50 hover:text-plum-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  gold: "bg-gold-400 text-plum-950 hover:bg-gold-300",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
};

export const buttonClass = (variant: Variant = "primary", size: Size = "md", className?: string) =>
  cn(
    "inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap transition disabled:pointer-events-none disabled:opacity-60",
    variants[variant],
    sizes[size],
    className,
  );

export function Button({ variant, size, loading, className, children, disabled, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button type="button" className={buttonClass(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
