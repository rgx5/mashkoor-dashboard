import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names and resolves conflicts the way Tailwind expects: when two classes from the same group collide
 * (e.g. a component's own `bg-white` and a caller's `bg-plum-900`), the one that appears LAST wins — not whichever
 * Tailwind's generated stylesheet happens to order last. Without this, conflicting utilities on the same element are
 * a silent, hard-to-spot bug (this bit us before: a logo's height, and a "next trip" card that rendered white text
 * on a white card because its background override lost the cascade).
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
