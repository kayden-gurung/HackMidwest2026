import { parseIsoDate } from "../../../lib/format";
import type { BudgetCategory, Itinerary, ItineraryItem } from "../types";

/** The Budget sections, in the order they are shown. */
export const budgetCategories: BudgetCategory[] = ["Flights", "Driving", "Stays", "Food", "Activities"];

/**
 * The Budget sections to show for these items. A trip is usually either flown or driven, so an empty
 * "Driving" section is hidden, and an empty "Flights" section is hidden on a trip that has driving costs.
 */
export function visibleBudgetCategories(items: ItineraryItem[]): BudgetCategory[] {
  const has = (category: BudgetCategory) => items.some((item) => item.category === category);
  return budgetCategories.filter((category) => {
    if (category === "Driving") return has("Driving");
    if (category === "Flights") return has("Flights") || !has("Driving");
    return true;
  });
}

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
  return items.reduce((sum, item) => sum + (item.costUsd ?? 0), 0);
}

/** Spent, remaining and percent of the planned budget. All arithmetic on money happens here, in code. */
export function budgetTotals(itinerary: Itinerary) {
  const spentUsd = totalCost(itinerary.items);
  const { plannedUsd } = itinerary.budget;
  return {
    spentUsd,
    remainingUsd: plannedUsd == null ? null : plannedUsd - spentUsd,
    percentUsed: plannedUsd != null && plannedUsd > 0 ? Math.round((spentUsd / plannedUsd) * 100) : 0,
    unknownCosts: itinerary.items.filter((item) => item.costUsd == null).length,
  };
}

export function itemCostLabel(item: ItineraryItem): string {
  return item.costUsd == null ? "Cost TBD" : item.costUsd === 0 ? "Free" : `Est. $${item.costUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function hasCoordinates(item: ItineraryItem): item is ItineraryItem & { location: { name: string; lat: number; lng: number } } {
  return Number.isFinite(item.location?.lat) && Number.isFinite(item.location?.lng);
}

/**
 * Opens the place in Google Maps.
 * - Name + address when there is an address: finds the real listing.
 * - Otherwise the exact coordinates: a name alone ("Blue Plate") makes Google guess, and it
 *   usually lands on the town center or near wherever the viewer is.
 * - Name only as a last resort.
 */
export function googleMapsUrl(item: ItineraryItem): string | undefined {
  const { location } = item;
  if (!location) return undefined;
  const query = location.address
    ? [location.name, location.address].filter(Boolean).join(", ")
    : hasCoordinates(item)
      ? `${location.lat},${location.lng}`
      : location.name;
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : undefined;
}

/** Links come from the agent and its tools, so only plain web links are ever rendered. */
/** What a stop's link opens: flight ticket searches, driving directions, or the place's website. */
export function websiteLabel(item: ItineraryItem): string {
  const url = item.websiteUrl ?? "";
  if (item.category === "Flights" && /google\.com\/travel\/flights|kayak\./.test(url)) return "Find tickets";
  if (/google\.com\/maps\/dir/.test(url)) return "Directions";
  return "Website";
}

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
