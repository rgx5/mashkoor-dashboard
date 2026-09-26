import { cn } from "./cn";

const sizes = { sm: "text-base", md: "text-xl", lg: "text-3xl" } as const;

/** "Mashkoor Tourism" wordmark. `onDark` is for the plum sidebar/header, `onLight` for white surfaces. */
export function BrandName({ tone = "onLight", size = "md", className }: { tone?: "onDark" | "onLight"; size?: keyof typeof sizes; className?: string }) {
  return (
    <span className={cn("font-lg leading-none font-semibold tracking-tight whitespace-nowrap", sizes[size], tone === "onDark" ? "text-white" : "text-plum-800", className)}>
      Mashkoor <span className={tone === "onDark" ? "text-gold-300" : "text-gold-700"}>Tourism</span>
    </span>
  );
}
