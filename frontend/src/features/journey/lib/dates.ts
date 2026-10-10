import { formatDateRange, nightsBetween, parseIsoDate } from "../../../lib/format";
import type { DateRange } from "../types";

/** Local Date -> "YYYY-MM-DD" (toISOString would convert to UTC and can shift a day). */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** { start: "2029-06-18", end: "2029-06-25" } -> "Jun 18–25", or "Jun 18" for a one-day trip. */
export function formatTripDates({ start, end }: DateRange): string {
  if (start === end) return parseIsoDate(start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return formatDateRange(start, end);
}

/** "7 nights", "1 night", or "Day trip". */
export function describeLength({ start, end }: DateRange): string {
  const nights = nightsBetween(start, end);
  if (nights === 0) return "Day trip";
  return `${nights} night${nights === 1 ? "" : "s"}`;
}
