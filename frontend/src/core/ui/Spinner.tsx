import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-plum-600", className)} aria-label="Loading" />;
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
