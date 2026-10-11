import { useEffect, useState } from "react"
import { fetchDestinationPhoto, type DestinationPhoto } from "../api/destinationPhoto"
import type { DriveDraft } from "../types"
import { Icon } from "./ui"

export interface DriveSession { id: string; draft: DriveDraft }

function DriveCard({ session: { id, draft }, onOpen }: { session: DriveSession; onOpen: (id: string) => void }) {
  const [photo, setPhoto] = useState<DestinationPhoto | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setPhoto(null)
    setLoading(true)
    setFailed(false)
    fetchDestinationPhoto(draft.destination)
      .then((result) => { if (active) setPhoto(result) })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [draft.destination])

  const hasPhoto = photo && !failed

  return (
    <article className="group relative overflow-hidden border border-line bg-white transition-all duration-200 hover:-translate-y-1 hover:border-school/50 hover:shadow-lg">
      <button
        type="button"
        onClick={() => onOpen(id)}
        aria-label={`Open drive from ${draft.start} to ${draft.destination}`}
        className="block w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-school"
      >
        <div className="h-56 w-full overflow-hidden bg-mint">
          {hasPhoto ? (
            <img
              src={photo.imageUrl}
              alt={photo.imageAlt}
              loading="lazy"
              onError={() => setFailed(true)}
              className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-3 px-4 text-school" role="status">
              <Icon name="camera" className={`size-8 ${loading ? "animate-pulse" : ""}`} />
              <span className="text-xs">{loading ? `Loading photo of ${draft.destination}…` : `Photo unavailable for ${draft.destination}`}</span>
            </div>
          )}
        </div>
        <div className="p-4">
          <h2 className="font-display text-xl font-semibold">{draft.start} → {draft.destination}</h2>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-school">{draft.departureDate} · {draft.detourBudget} extra driving minutes</p>
          <p className="mt-3 flex items-center gap-1 text-xs font-bold text-school">
            Open plan and conversation
            <Icon name="chevron" className="size-3.5 transition-transform group-hover:translate-x-1" />
          </p>
        </div>
      </button>
      {hasPhoto && photo.sourceUrl && (
        <a
          href={photo.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Photo source and license for ${draft.destination}`}
          className="absolute right-2 top-48 rounded bg-white/90 px-2 py-1 text-[9px] font-semibold text-school hover:underline focus-visible:outline-2 focus-visible:outline-school"
        >
          Photo source ↗
        </a>
      )}
    </article>
  )
}

export default function DriveDashboard({ sessions, onNew, onOpen }: { sessions: DriveSession[]; onNew: () => void; onOpen: (id: string) => void }) {
  return (
    <div className="h-full overflow-y-auto p-5 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-school">Roam planner</p>
            <h1 className="mt-2 font-display text-4xl font-semibold">Your drives</h1>
            <p className="mt-2 text-sm text-muted">Places worth pulling over for, planned around your route.</p>
          </div>
          <button type="button" onClick={onNew} className="flex items-center gap-2 rounded-md bg-school px-5 py-3 text-xs font-bold text-white"><Icon name="plus" className="size-4" /> New trip</button>
        </div>
        {sessions.length ? (
          <div className="mt-7 grid items-start gap-5 md:grid-cols-3">
            {sessions.map((session) => <DriveCard key={session.id} session={session} onOpen={onOpen} />)}
          </div>
        ) : (
          <div className="mt-10 rounded-md border border-dashed border-line p-10 text-center">
            <Icon name="compass" className="mx-auto size-8 text-school" />
            <h2 className="mt-4 font-display text-2xl">Where will the road take you?</h2>
            <p className="mt-2 text-sm text-muted">Choose a start, a destination, and what you enjoy along the way.</p>
            <button type="button" onClick={onNew} className="mt-5 rounded-md bg-school px-5 py-3 text-xs font-bold text-white">Plan your first drive</button>
          </div>
        )}
        <p className="mt-7 text-xs leading-5 text-muted">Plans and conversations are kept in this browser session. Reloading clears them. Place and routing outages are reported in chat; fuel and other costs are estimates.</p>
      </div>
    </div>
  )
}
