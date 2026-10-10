import { parseIsoDate } from "../../../lib/format";
import type { BudgetCategory, Itinerary, ItineraryItem } from "../types";

/** The Budget sections, in the order they are shown. */
export const budgetCategories: BudgetCategory[] = ["Flights", "Stays", "Food", "Activities"];

function toIsoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** ("2029-06-18", 2) -> "2029-06-20" */
export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Every date from start to end inclusive. Capped so bad data can't build an endless list. */
export function tripDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  for (let date = startDate; date <= endDate && dates.length < 60; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** Earliest first: by day, then by time. Items without a time come last in their day. */
export function inTripOrder(items: ItineraryItem[]): ItineraryItem[] {
  return [...items].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
}

export function itemsOn(items: ItineraryItem[], date: string): ItineraryItem[] {
  return inTripOrder(items.filter((item) => item.date === date));
}

export function totalCost(items: ItineraryItem[]): number {
  return items.reduce((sum, item) => sum + item.costUsd, 0);
}

/** Spent, remaining and percent of the planned budget. All arithmetic on money happens here, in code. */
export function budgetTotals(itinerary: Itinerary) {
  const spentUsd = totalCost(itinerary.items);
  const { plannedUsd } = itinerary.budget;
  return {
    spentUsd,
    remainingUsd: plannedUsd - spentUsd,
    percentUsed: plannedUsd > 0 ? Math.round((spentUsd / plannedUsd) * 100) : 0,
  };
}

export function hasCoordinates(item: ItineraryItem): item is ItineraryItem & { location: { name: string; lat: number; lng: number } } {
  return Number.isFinite(item.location?.lat) && Number.isFinite(item.location?.lng);
}

/** Opens the place in Google Maps. Searches by name and address when known, since that finds the real listing. */
export function googleMapsUrl(item: ItineraryItem): string | undefined {
  const { location } = item;
  if (!location) return undefined;
  const text = [location.name, location.address].filter(Boolean).join(", ");
  const query = text || (hasCoordinates(item) ? `${location.lat},${location.lng}` : "");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : undefined;
}

/** Links come from the agent and its tools, so only plain web links are ever rendered. */
export function safeWebUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

/** "17:30" -> "5:30 PM". Anything that isn't HH:MM is shown as given. */
export function formatTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  return `${hours % 12 === 0 ? 12 : hours % 12}:${match[2]} ${hours < 12 ? "AM" : "PM"}`;
}

/** "2029-06-19" -> "Jun 19" */
export function formatDay(isoDate: string): string {
  return parseIsoDate(isoDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
