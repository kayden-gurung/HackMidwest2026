import type { KeyboardEvent, ReactNode } from "react"

export type IconName = "compass" | "car" | "map" | "calendar" | "wallet" | "plus" | "search" | "send" | "chevron" | "settings" | "sparkles" | "clock" | "utensils" | "camera" | "layers" | "close" | "check" | "alert"

const paths: Record<IconName, ReactNode> = {
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  car: (
    <>
      <path d="m5 16-1 2v2m15-4 1 2v2M5 16h14l-1.5-6h-11L5 16Z" />
      <path d="M8 19h.01M16 19h.01M7 10l1-3h8l1 3" />
    </>
  ),
  map: <path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2V6Zm5-2v13m8-10v13" />,
  calendar: (
    <path d="M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
  ),
  wallet: (
    <path d="M4 6.5h14a2 2 0 0 1 2 2V18H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13M16 11h4v4h-4a2 2 0 0 1 0-4Z" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <path d="m21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />
  ),
  send: <path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4L17 7M7 17l-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6" />
    </>
  ),
  sparkles: (
    <path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2L12 3ZM5 15l-.7 2.3L2 18l2.3.7L5 21l.7-2.3L8 18l-2.3-.7L5 15Z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  utensils: (
    <path d="M6 3v7m3-7v7m-6-7v4a3 3 0 0 0 6 0M6 10v11m11-18v18m0-18c-2 1-3 3-3 6v3h3" />
  ),
  camera: (
    <>
      <path d="M4 7h3l1.5-2h7L17 7h3v12H4V7Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  layers: <path d="m12 3 9 5-9 5-9-5 9-5Zm-8 9 8 5 8-5m-16 4 8 5 8-5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12 4 4L19 6" />,
  alert: (
    <>
      <path d="M12 4 3 20h18L12 4Z" />
      <path d="M12 9v5m0 3h.01" />
    </>
  ),
}

export function Icon({
  name,
  className = "size-5",
}: {
  name: IconName
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={name === "sparkles" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

export function Action({
  children,
  onClick,
  className = "",
  label,
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
  label?: string
}) {
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onClick?.()
    }
  }
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onClick}
      onKeyDown={keyDown}
      className={`cursor-pointer select-none transition-colors active:opacity-75 ${className}`}
    >
      {children}
    </div>
  )
}


export function StatusTag({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "accent" | "warning"
}) {
  const colors =
    tone === "accent"
      ? "bg-mint text-school"
      : tone === "warning"
        ? "bg-peach text-school"
        : "bg-panel text-muted"
  return (
    <div
      className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${colors}`}
    >
      {children}
    </div>
  )
}
