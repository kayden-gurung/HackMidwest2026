import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { useEffect, useRef } from "react"
import type { ExploreResult, ExploreRoute, ExploreSpot } from "../api/explore"
import { safeWebUrl } from "../lib/mapLinks"
import "./driveMap.css"

// Same free OpenStreetMap tiles and marker styles as the drive map (see DriveMap).
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const FIT_PADDING: L.PointExpression = [48, 48]

/** Text goes in with textContent, never as HTML: names come from OpenStreetMap. */
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const element = document.createElement(tag)
  element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

export function formatDrive(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** Directions on Google Maps from the start city to the spot. */
export function directionsUrl(origin: ExploreResult["origin"], spot: ExploreSpot): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${origin.lat},${origin.lng}`,
    destination: `${spot.lat},${spot.lng}`,
    travelmode: "driving",
  })
  return `https://www.google.com/maps/dir/?${params}`
}

function popup(origin: ExploreResult["origin"], spot: ExploreSpot, number: number): HTMLElement {
  const root = node("div", "")
  root.append(node("div", "drive-popup-title", `${number}. ${spot.name}`))
  root.append(node("div", "drive-popup-meta", [spot.kind, spot.town].filter(Boolean).join(" · ")))
  root.append(node("div", "drive-popup-meta", `${formatDrive(spot.drive_minutes)} · ${spot.drive_miles} mi by road`))
  const links = node("div", "drive-popup-links")
  for (const [label, url] of [
    ["Directions", directionsUrl(origin, spot)],
    ["Website", safeWebUrl(spot.website_url ?? undefined)],
    ["Wikipedia", safeWebUrl(spot.wikipedia_url ?? undefined)],
  ] as const) {
    if (!url) continue
    const anchor = node("a", "", `${label} ↗`)
    anchor.href = url
    anchor.target = "_blank"
    anchor.rel = "noopener noreferrer"
    links.append(anchor)
  }
  root.append(links)
  return root
}

function spotIcon(number: number, selected: boolean): L.DivIcon {
  const marker = node("div", "drive-marker", String(number))
  if (selected) marker.classList.add("drive-marker-added", "drive-marker-selected")
  return L.divIcon({ className: "", html: marker, iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -18] })
}

function startIcon(name: string): L.DivIcon {
  const root = node("div", "drive-endpoint")
  root.append(node("div", "drive-endpoint-dot drive-endpoint-start", "A"))
  root.append(node("div", "drive-endpoint-label", name))
  return L.divIcon({ className: "", html: root, iconSize: [32, 32], iconAnchor: [16, 16] })
}

/** The start city, every spot as a numbered pin, and the road to the selected spot. */
export default function ExploreMap({
  result,
  selectedId,
  route,
  onSelect,
}: {
  result: ExploreResult
  selectedId: string | null
  route: ExploreRoute | null
  onSelect: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const pinsRef = useRef<L.LayerGroup | null>(null)
  const roadRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const map = L.map(container, { zoomControl: false, scrollWheelZoom: true })
    L.control.zoom({ position: "bottomright" }).addTo(map)
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map)
    roadRef.current = L.layerGroup().addTo(map)
    pinsRef.current = L.layerGroup().addTo(map)
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)
    mapRef.current = map
    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
      pinsRef.current = null
      roadRef.current = null
    }
  }, [])

  // The start and every spot; the view fits all of them whenever the results change.
  useEffect(() => {
    const map = mapRef.current
    const layer = pinsRef.current
    if (!map || !layer) return
    layer.clearLayers()
    markersRef.current.clear()
    const { origin, spots } = result
    L.marker([origin.lat, origin.lng], { icon: startIcon(origin.name), keyboard: false, zIndexOffset: 500 }).addTo(layer)
    spots.forEach((spot, index) => {
      const marker = L.marker([spot.lat, spot.lng], { icon: spotIcon(index + 1, false), title: spot.name })
        .bindPopup(popup(origin, spot, index + 1), { className: "drive-popup", maxWidth: 260 })
        .on("click", () => onSelectRef.current(spot.id))
        .addTo(layer)
      markersRef.current.set(spot.id, marker)
    })
    const bounds = L.latLngBounds([[origin.lat, origin.lng], ...spots.map((spot) => [spot.lat, spot.lng] as [number, number])])
    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: 10 })
  }, [result])

  // The selected pin stands out and opens its popup.
  useEffect(() => {
    result.spots.forEach((spot, index) => {
      const marker = markersRef.current.get(spot.id)
      if (!marker) return
      const selected = spot.id === selectedId
      marker.setIcon(spotIcon(index + 1, selected))
      marker.setZIndexOffset(selected ? 400 : 0)
      if (selected) marker.openPopup()
    })
  }, [result, selectedId])

  // The road to the selected spot, drawn like the drive map's route; the view follows it.
  useEffect(() => {
    const map = mapRef.current
    const layer = roadRef.current
    if (!map || !layer) return
    layer.clearLayers()
    if (!route || route.path.length < 2) return
    const line = route.path.map(([lat, lng]) => L.latLng(lat, lng))
    L.polyline(line, { color: "#ffffff", weight: 9, opacity: 0.9, lineCap: "round" }).addTo(layer)
    L.polyline(line, { color: "#31594c", weight: 5, opacity: 0.95, lineCap: "round" }).addTo(layer)
    map.fitBounds(L.latLngBounds(line), { padding: FIT_PADDING })
  }, [route])

  return <div ref={containerRef} className="drive-map size-full" role="region" aria-label="Map of places to explore" />
}
