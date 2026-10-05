/** Turns the server's per-field errors (`lines.0.description`) into sentences, and says which pricing lines failed so they can be marked. */
export function explainFieldErrors(fieldErrors: Record<string, string>) {
  const lines = new Set<number>();
  const messages = Object.entries(fieldErrors).map(([path, message]) => {
    const [head, index] = path.split(".");
    const n = Number(index) + 1;
    const label =
      head === "lines" ? `Pricing line ${n}` : head === "days" ? `Day ${n}` : head === "flights" ? `Flight ${n}` : head === "hotels" ? `Hotel ${n}` : head === "paymentSchedule" ? `Instalment ${n}` : head === "title" ? "Title" : path === "_" ? "" : path;
    if (head === "lines" && Number.isFinite(n)) lines.add(n - 1);
    return label ? `${label}: ${message}` : message;
  });
  return { messages, lines };
}
