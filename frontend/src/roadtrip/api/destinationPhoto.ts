import { config } from "../../config/env"
import { safeWebUrl } from "../lib/mapLinks"

export interface DestinationPhoto {
  imageUrl: string
  imageAlt: string
  sourceUrl?: string
}

// Reopening the dashboard and multiple drives to the same city share one lookup.
// Failed or missing photos are removed so a later visit can retry.
const photos = new Map<string, Promise<DestinationPhoto | null>>()

export function fetchDestinationPhoto(destination: string): Promise<DestinationPhoto | null> {
  const query = destination.trim().replace(/\s+/g, " ")
  if (!query) return Promise.resolve(null)
  const key = query.toLowerCase()
  const cached = photos.get(key)
  if (cached) return cached

  const request = (async () => {
    const params = new URLSearchParams({ q: query })
    const response = await fetch(`${config.apiBaseUrl}/api/places/photo?${params}`)
    if (!response.ok) throw new Error("Destination photo unavailable.")
    const body = await response.json()
    const imageUrl = safeWebUrl(typeof body?.image_url === "string" ? body.image_url : undefined)
    if (!imageUrl) return null
    return {
      imageUrl,
      imageAlt: typeof body.image_alt === "string" && body.image_alt.trim() ? body.image_alt : `View of ${query}`,
      sourceUrl: safeWebUrl(typeof body.source_url === "string" ? body.source_url : undefined),
    }
  })().then((photo) => {
    if (!photo) photos.delete(key)
    return photo
  }).catch((error: unknown) => {
    photos.delete(key)
    throw error
  })
  photos.set(key, request)
  return request
}
