import { Action, Icon } from "../../../components/ui";
import { formatDay, formatTime, googleMapsUrl, hasCoordinates, itemCostLabel, safeWebUrl } from "../lib/itinerary";
import type { ItineraryItem } from "../types";
import { categoryStyle } from "./categoryStyle";

const linkClass = "font-semibold text-sea underline-offset-2 hover:underline";

/**
 * One itinerary item with its cost and its links: the place's website, Google Maps, and
 * (when it has coordinates) a jump to its marker on the Map tab.
 * Used by the Plan, Map and Budget tabs so an item looks and behaves the same everywhere.
 */
export function ItemRow({
  item,
  showDate = false,
  markerNumber,
  selected = false,
  onShowOnMap,
}: {
  item: ItineraryItem;
  /** Show the day as well as the time. Off in the Plan tab, where items already sit under their day. */
  showDate?: boolean;
  /** When set, the row shows this number (matching its map marker) in place of the category icon. */
  markerNumber?: number;
  selected?: boolean;
  onShowOnMap?: (itemId: string) => void;
}) {
  const style = categoryStyle[item.category];
  const mapsUrl = googleMapsUrl(item);
  const websiteUrl = safeWebUrl(item.websiteUrl);
  const sourceUrls = (item.sourceUrls ?? []).map(safeWebUrl).filter((url): url is string => Boolean(url));
  const when = [showDate ? formatDay(item.date) : undefined, item.time ? formatTime(item.time) : undefined, item.location?.name].filter(Boolean).join(" · ");

  return (
    <div className={`rounded-xl border bg-surface p-3 ${selected ? "border-sea ring-1 ring-sea" : "border-line"}`}>
      <div className="flex items-start gap-2.5">
        {markerNumber === undefined ? (
          <div className={`grid size-7 shrink-0 place-items-center rounded-lg ${style.chip}`}>
            <Icon name={style.icon} className="size-3.5" />
          </div>
        ) : (
          <div className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: style.markerColor }}>
            {markerNumber}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-semibold leading-5">{item.title}</div>
            <div className="shrink-0 text-xs font-bold leading-5">{itemCostLabel(item)}</div>
          </div>
          {when && <div className="mt-0.5 text-xs text-muted">{when}</div>}
          {item.description && <div className="mt-1.5 text-xs leading-5 text-ink/70">{item.description}</div>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {onShowOnMap && hasCoordinates(item) && (
              <Action onClick={() => onShowOnMap(item.id)} className={linkClass}>
                Show on map
              </Action>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                Google Maps ↗
              </a>
            )}
            {websiteUrl && (
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                Website ↗
              </a>
            )}
            {sourceUrls.map((url, index) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-muted underline-offset-2 hover:underline">
                Source{sourceUrls.length > 1 ? ` ${index + 1}` : ""} ↗
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
