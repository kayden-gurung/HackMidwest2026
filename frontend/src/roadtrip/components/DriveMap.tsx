import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { useEffect, useMemo, useRef } from "react"
import {
  googleMapsDirectionsUrl,
  googleMapsPlaceUrl,
  hasCoordinates,
  safeWebUrl,
} from "../lib/mapLinks"
import type { CommunityDiscovery, DriveRoute, DriveStop } from "../types"
import { Action, Icon } from "./ui"
import "./driveMap.css"

// OpenStreetMap's public tiles: free, no API key. Fine for a demo; swap for a keyed provider
// before real traffic.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// Close enough to tell a small town's stops apart.
const FOCUS_ZOOM = 11
const FIT_PADDING: L.PointExpression = [48, 48]
// The stop detail panel (see StopDetail) covers this much of the map on wide screens.
const DETAIL_PANEL_WIDTH = 420
const DETAIL_PANEL_MIN_SCREEN = 640

type Mappable = DriveStop & { lat: number; lng: number }

/** Builds a DOM node. Text goes in with textContent, never as an HTML string, because it comes from the backend and from visitors. */
function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

function link(label: string, url: string | undefined): HTMLAnchorElement | undefined {
  if (!url) return undefined
  const anchor = node("a", "", `${label} ↗`)
  anchor.href = url
  anchor.target = "_blank"
  anchor.rel = "noopener noreferrer"
  return anchor
}

type StopHandlers = {
  onToggle: (id: string) => void
  onDetails: (id: string) => void
}

function stopPopup(
  stop: Mappable,
  number: number,
  added: boolean,
  handlers: StopHandlers,
): HTMLElement {
  const root = node("div", "")
  root.append(node("div", "drive-popup-title", `${number}. ${stop.name}`))
  root.append(node("div", "drive-popup-meta", stop.category))
  root.append(
    node(
      "div",
      "drive-popup-meta",
      `+${stop.detourMinutes} min drive · ~$${stop.gasCost.toFixed(2)} gas · ${stop.visitMinutes} min visit`,
    ),
  )
  root.append(node("div", "drive-popup-meta", stop.sourceLabel))

  const links = node("div", "drive-popup-links")
  for (const anchor of [
    link("Google Maps", googleMapsPlaceUrl(stop)),
    link("Source", safeWebUrl(stop.sourceUrl)),
  ]) {
    if (anchor) links.append(anchor)
  }
  if (links.childElementCount > 0) root.append(links)

  const actions = node("div", "drive-popup-actions")
  const toggle = node(
    "button",
    added ? "drive-popup-button" : "drive-popup-button drive-popup-button-primary",
    added ? "Remove stop" : "Add stop",
  )
  toggle.type = "button"
  toggle.addEventListener("click", () => handlers.onToggle(stop.id))
  const details = node("button", "drive-popup-button", "Details")
  details.type = "button"
  details.addEventListener("click", () => handlers.onDetails(stop.id))
  actions.append(toggle, details)
  root.append(actions)
  return root
}

function stopIcon(
  stop: Mappable,
  number: number,
  added: boolean,
  selected: boolean,
): L.DivIcon {
  const marker = node("div", "drive-marker", String(number))
  if (added) marker.classList.add("drive-marker-added")
  if (selected) marker.classList.add("drive-marker-selected")
  // The less a place is visited, the more it stands out.
  if (stop.lessExplored) marker.classList.add("drive-marker-rare")
  return L.divIcon({
    className: "",
    html: marker,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  })
}

function endpointIcon(letter: string, tone: "start" | "end", name: string): L.DivIcon {
  const root = node("div", "drive-endpoint")
  root.append(node("div", `drive-endpoint-dot drive-endpoint-${tone}`, letter))
  root.append(node("div", "drive-endpoint-label", name))
  return L.divIcon({
    className: "",
    html: root,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

function discoveryIcon(discovery: CommunityDiscovery): L.DivIcon {
  const root = node("div", "drive-photo")
  // One visit is the rarest a place can be.
  if (discovery.count <= 1) root.classList.add("drive-photo-rare")
  const image = node("img", "drive-photo-image")
  image.alt = ""
  image.src = safeWebUrl(discovery.image) ?? ""
  root.append(image, node("div", "drive-photo-tip"))
  if (discovery.count > 1) {
    root.append(node("div", "drive-photo-count", String(discovery.count)))
  }
  return L.divIcon({
    className: "",
    html: root,
    iconSize: [52, 60],
    iconAnchor: [26, 60],
  })
}

export type DriveMapProps = {
  route: DriveRoute
  stops: DriveStop[]
  addedIds: string[]
  selectedId: string | null
  /** Bumped on every selection, so picking the same stop again still moves the map. */
  focusTick: number
  detailOpen: boolean
  discoveries: CommunityDiscovery[]
  showSuggestions: boolean
  showCommunity: boolean
  /** True while waiting for the visitor to click where their photo pin goes. */
  placing: boolean
  onSelectStop: (id: string) => void
  onToggleStop: (id: string) => void
  onOpenDetail: (id: string) => void
  onSelectDiscovery: (discovery: CommunityDiscovery) => void
  onPlace: (lat: number, lng: number) => void
}

/**
 * The drive map: a pannable, zoomable street map with the route line, a numbered marker for every
 * stop that has a location, and the community photo pins. Everything it draws comes from props,
 * so a new plan from the backend redraws it with no changes here.
 */
export function DriveMap(props: DriveMapProps) {
  const { route, stops, addedIds, selectedId, discoveries } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const stopLayerRef = useRef<L.LayerGroup | null>(null)
  const discoveryLayerRef = useRef<L.LayerGroup | null>(null)
  const stopMarkersRef = useRef(new Map<string, L.Marker>())

  // Latest props for Leaflet's event handlers, without rebuilding the map on every render.
  const latest = useRef(props)
  latest.current = props

  const numbered = useMemo(
    () =>
      stops
        .map((stop, index) => ({ stop, number: index + 1 }))
        .filter((entry): entry is { stop: Mappable; number: number } =>
          hasCoordinates(entry.stop),
        ),
    [stops],
  )
  const addedKey = addedIds.join("|")

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const map = L.map(container, { zoomControl: false, scrollWheelZoom: true })
    L.control.zoom({ position: "bottomright" }).addTo(map)
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map)
    routeLayerRef.current = L.layerGroup().addTo(map)
    stopLayerRef.current = L.layerGroup().addTo(map)
    discoveryLayerRef.current = L.layerGroup().addTo(map)
    map.on("click", (event: L.LeafletMouseEvent) => {
      if (latest.current.placing) latest.current.onPlace(event.latlng.lat, event.latlng.lng)
    })
    // The map can change size without the window changing (the mobile list sheet, side panels).
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)
    mapRef.current = map
    const markers = stopMarkersRef.current
    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
      routeLayerRef.current = null
      stopLayerRef.current = null
      discoveryLayerRef.current = null
      markers.clear()
    }
  }, [])

  // The route line and its two ends. Fits the view to the whole drive whenever the route changes.
  useEffect(() => {
    const map = mapRef.current
    const layer = routeLayerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const line = route.path.map(([lat, lng]) => L.latLng(lat, lng))
    // A white casing under the green line is what makes it read as a road, as on Google Maps.
    L.polyline(line, { color: "#ffffff", weight: 9, opacity: 0.9, lineCap: "round" }).addTo(layer)
    L.polyline(line, { color: "#31594c", weight: 5, opacity: 0.95, lineCap: "round" })
      .bindTooltip(`${route.origin.name} → ${route.destination.name} · ${route.distanceMiles} mi`, { sticky: true })
      .addTo(layer)
    for (const [place, letter, tone] of [
      [route.origin, "A", "start"],
      [route.destination, "B", "end"],
    ] as const) {
      L.marker([place.lat, place.lng], {
        icon: endpointIcon(letter, tone, place.name),
        title: place.name,
        keyboard: false,
        zIndexOffset: 500,
      }).addTo(layer)
    }
    map.fitBounds(L.latLngBounds(line), { padding: FIT_PADDING })
  }, [route])

  // One marker per mappable stop. Rebuilt only when the list of stops changes.
  useEffect(() => {
    const layer = stopLayerRef.current
    if (!layer) return
    layer.clearLayers()
    const markers = stopMarkersRef.current
    markers.clear()
    for (const { stop, number } of numbered) {
      const marker = L.marker([stop.lat, stop.lng], {
        icon: stopIcon(stop, number, false, false),
        title: stop.name,
        keyboard: true,
        zIndexOffset: 400,
      })
        .bindPopup(
          stopPopup(stop, number, false, {
            onToggle: (id) => latest.current.onToggleStop(id),
            onDetails: (id) => latest.current.onOpenDetail(id),
          }),
          { className: "drive-popup", maxWidth: 260, autoPan: false },
        )
        .on("click", () => latest.current.onSelectStop(stop.id))
      marker.addTo(layer)
      markers.set(stop.id, marker)
    }
  }, [numbered])

  // Show or hide the stop layer.
  useEffect(() => {
    const map = mapRef.current
    const layer = stopLayerRef.current
    if (!map || !layer) return
    if (props.showSuggestions) layer.addTo(map)
    else layer.remove()
  }, [props.showSuggestions])

  // Restyle markers (added / selected) and refresh popup buttons without recreating anything.
  useEffect(() => {
    for (const { stop, number } of numbered) {
      const marker = stopMarkersRef.current.get(stop.id)
      if (!marker) continue
      const added = addedIds.includes(stop.id)
      const selected = stop.id === selectedId
      marker.setIcon(stopIcon(stop, number, added, selected))
      // Stops are drawn above photo pins, and the selected stop above its neighbours.
      marker.setZIndexOffset(selected ? 1000 : added ? 500 : 400)
      marker.setPopupContent(
        stopPopup(stop, number, added, {
          onToggle: (id) => latest.current.onToggleStop(id),
          onDetails: (id) => latest.current.onOpenDetail(id),
        }),
      )
    }
    // addedKey stands in for addedIds, which is a new array on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numbered, addedKey, selectedId])

  // Community photo pins.
  useEffect(() => {
    const layer = discoveryLayerRef.current
    if (!layer) return
    layer.clearLayers()
    for (const discovery of discoveries) {
      if (!Number.isFinite(discovery.lat) || !Number.isFinite(discovery.lng)) continue
      L.marker([discovery.lat, discovery.lng], {
        icon: discoveryIcon(discovery),
        title: discovery.place,
        keyboard: true,
        // Rarer pins sit on top, so they aren't buried under busy ones.
        zIndexOffset: discovery.count <= 1 ? 300 : 100,
      })
        .on("click", () => latest.current.onSelectDiscovery(discovery))
        .addTo(layer)
    }
  }, [discoveries])

  useEffect(() => {
    const map = mapRef.current
    const layer = discoveryLayerRef.current
    if (!map || !layer) return
    if (props.showCommunity) layer.addTo(map)
    else layer.remove()
  }, [props.showCommunity])

  // Move to the selected stop. With the detail panel open, centre it in the part of the map still visible.
  useEffect(() => {
    const map = mapRef.current
    if (!map || props.focusTick === 0 || !selectedId) return
    const marker = stopMarkersRef.current.get(selectedId)
    if (!marker) return
    const zoom = Math.max(map.getZoom(), FOCUS_ZOOM)
    const panelCovers = props.detailOpen && window.innerWidth >= DETAIL_PANEL_MIN_SCREEN
    const centre = panelCovers
      ? map.unproject(map.project(marker.getLatLng(), zoom).add([DETAIL_PANEL_WIDTH / 2, 0]), zoom)
      : marker.getLatLng()
    map.setView(centre, zoom, { animate: true })
    if (props.detailOpen) marker.closePopup()
    else marker.openPopup()
    // Only a new selection moves the map, not the detail panel opening or closing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusTick])

  // The detail panel replaces the popup.
  useEffect(() => {
    if (props.detailOpen) mapRef.current?.closePopup()
  }, [props.detailOpen])

  // Crosshair while the visitor is choosing where their pin goes.
  useEffect(() => {
    containerRef.current?.classList.toggle("drive-map-placing", props.placing)
  }, [props.placing])

  const fitRoute = () =>
    mapRef.current?.fitBounds(
      L.latLngBounds(route.path.map(([lat, lng]) => L.latLng(lat, lng))),
      { padding: FIT_PADDING, animate: true },
    )
  const directionsUrl = googleMapsDirectionsUrl(
    route,
    stops.filter((stop) => addedIds.includes(stop.id)),
  )

  return (
    <div className="relative size-full">
      <div
        ref={containerRef}
        role="application"
        aria-label={`Map of the drive from ${route.origin.name} to ${route.destination.name}`}
        className="drive-map absolute inset-0 isolate"
      />
      <div className="absolute bottom-4 left-4 z-10 flex flex-col items-start gap-2">
        <Action
          onClick={fitRoute}
          className="flex items-center gap-2 border border-line bg-white/95 px-3 py-2 text-[10px] font-bold shadow-sm"
        >
          <Icon name="map" className="size-3.5" /> Show whole route
        </Action>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 border border-line bg-white/95 px-3 py-2 text-[10px] font-bold shadow-sm"
        >
          <Icon name="car" className="size-3.5" /> Open drive in Google Maps ↗
        </a>
      </div>
      {props.placing && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-10 max-w-[90%] -translate-x-1/2 text-center bg-ink px-4 py-2 text-[11px] font-bold text-white shadow-lg">
          Click the map where you made your discovery
        </div>
      )}
    </div>
  )
}
