const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** 3200 -> "$3,200" */
export function formatUsd(amount: number): string {
  return usd.format(amount);
}

/** Parses "YYYY-MM-DD" as a local date (new Date("YYYY-MM-DD") would be UTC and can shift a day). */
export function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** ("2029-06-18", "2029-06-25") -> "Jun 18–25", or "June 18–25" with month "long". */
export function formatDateRange(start: string, end: string, month: "short" | "long" = "short"): string {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  const startLabel = startDate.toLocaleDateString("en-US", { month, day: "numeric" });
  const endLabel =
    startDate.getMonth() === endDate.getMonth()
      ? String(endDate.getDate())
      : endDate.toLocaleDateString("en-US", { month, day: "numeric" });
  return `${startLabel}–${endLabel}`;
}

export function nightsBetween(start: string, end: string): number {
  return Math.round((parseIsoDate(end).getTime() - parseIsoDate(start).getTime()) / 86_400_000);
}
