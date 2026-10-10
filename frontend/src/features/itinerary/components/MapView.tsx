import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import { EmptyState } from "../../../components/ui";
import { formatDay, formatTime, googleMapsUrl, hasCoordinates, inTripOrder, itemCostLabel, safeWebUrl } from "../lib/itinerary";
import type { Itinerary, ItineraryItem } from "../types";
import { categoryStyle } from "./categoryStyle";
import { ItemRow } from "./ItemRow";
import "./mapView.css";

// OpenStreetMap's public tiles: free, no API key. Fine for a demo; swap for a keyed provider before real traffic.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Close enough to tell apart stops in the same town. */
const FOCUS_ZOOM = 14;

/** Popup content is built as DOM nodes with textContent, never as an HTML string, because the text comes from the agent. */
function popupContent(item: ItineraryItem, markerNumber: number): HTMLElement {
  const root = document.createElement("div");
  const add = (className: string, text: string) => {
    const element = document.createElement("div");
    element.className = className;
    element.textContent = text;
    root.append(element);
  };
  add("roam-popup-title", `${markerNumber}. ${item.title}`);
  add("roam-popup-meta", [formatDay(item.date), item.time ? formatTime(item.time) : undefined, itemCostLabel(item)].filter(Boolean).join(" · "));
  if (item.location?.name) add("roam-popup-meta", item.location.name);

  const links = document.createElement("div");
  links.className = "roam-popup-links";
  const addLink = (label: string, url: string | undefined) => {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${label} ↗`;
    links.append(link);
  };
  addLink("Google Maps", googleMapsUrl(item));
  addLink("Website", safeWebUrl(item.websiteUrl));
  if (links.childElementCount > 0) root.append(links);
  return root;
}

function markerIcon(item: ItineraryItem, markerNumber: number, selected: boolean): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="roam-marker${selected ? " roam-marker-selected" : ""}" style="background:${categoryStyle[item.category].markerColor}">${markerNumber}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

/**
 * Map tab: a pannable, zoomable map with a numbered marker for every item that has coordinates,
 * joined in trip order, plus the same stops as a list underneath. Clicking a marker or a list row
 * selects that stop in both places.
 */
export function MapView({
  itinerary,
  focusedItemId,
  onFocusItem,
}: {
  itinerary: Itinerary;
  focusedItemId?: string;
  onFocusItem: (itemId: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  // Latest callback without re-creating the map when the parent re-renders.
  const onFocusRef = useRef(onFocusItem);
  onFocusRef.current = onFocusItem;

  const ordered = useMemo(() => inTripOrder(itinerary.items), [itinerary.items]);
  const mapped = useMemo(() => ordered.filter(hasCoordinates), [ordered]);
  const unmapped = useMemo(() => ordered.filter((item) => !hasCoordinates(item)), [ordered]);

  // Build the map once per itinerary.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapped.length === 0) return;

    const map = L.map(container, { scrollWheelZoom: true });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);

    // Stops at exactly the same spot (two flights at one airport, say) are nudged about 60 m apart
    // so each keeps its own clickable marker.
    const seen = new Map<string, number>();
    const points = mapped.map((item) => {
      const key = `${item.location.lat},${item.location.lng}`;
      const repeats = seen.get(key) ?? 0;
      seen.set(key, repeats + 1);
      return L.latLng(item.location.lat, item.location.lng + repeats * 0.0007);
    });
    L.polyline(points, { color: "#173b3a", weight: 2, opacity: 0.55, dashArray: "4 6" }).addTo(map);

    const markers = markersRef.current;
    mapped.forEach((item, index) => {
      const marker = L.marker(points[index], { icon: markerIcon(item, index + 1, false), title: item.title, keyboard: true })
        .bindPopup(popupContent(item, index + 1), { className: "roam-popup", maxWidth: 240 })
        .on("click", () => onFocusRef.current(item.id))
        .addTo(map);
      markers.set(item.id, marker);
    });

    map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 14 });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, [mapped]);

  // Move to the selected stop, enlarge its marker and open its popup.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    mapped.forEach((item, index) => {
      const selected = item.id === focusedItemId;
      // The selected marker is drawn above its neighbours, which often overlap in a small town.
      markersRef.current.get(item.id)?.setIcon(markerIcon(item, index + 1, selected)).setZIndexOffset(selected ? 1000 : 0);
    });
    const marker = focusedItemId ? markersRef.current.get(focusedItemId) : undefined;
    if (!marker) return;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), FOCUS_ZOOM), { animate: true });
    marker.openPopup();
    rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focusedItemId, mapped]);

  return (
    <div ref={rootRef}>
      <div className="flex items-end justify-between">
        <div className="font-display text-2xl font-semibold">Your route</div>
        <div className="text-xs font-semibold text-sea">{mapped.length} {mapped.length === 1 ? "stop" : "stops"} on the map</div>
      </div>

      {mapped.length === 0 ? (
        <EmptyState message="Nothing to put on the map yet. Stops appear here once they have a location." className="mt-4" />
      ) : (
        <div ref={containerRef} role="application" aria-label="Map of the trip's stops" className="roam-map isolate mt-4 h-80 overflow-hidden rounded-2xl border border-line" />
      )}

      {mapped.length > 0 && (
        <div className="mt-5 space-y-2">
          {mapped.map((item, index) => (
            <div key={item.id} onClick={() => onFocusItem(item.id)} className="cursor-pointer">
              <ItemRow item={item} showDate markerNumber={index + 1} selected={item.id === focusedItemId} onShowOnMap={onFocusItem} />
            </div>
          ))}
        </div>
      )}

      {unmapped.length > 0 && (
        <>
          <div className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Not on the map yet</div>
          <div className="mt-2 space-y-2">
            {unmapped.map((item) => (
              <ItemRow key={item.id} item={item} showDate />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
