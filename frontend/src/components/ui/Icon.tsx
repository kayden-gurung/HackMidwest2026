import type { ReactNode } from "react";

export type IconName =
  | "sparkles"
  | "plus"
  | "search"
  | "calendar"
  | "map"
  | "wallet"
  | "plane"
  | "hotel"
  | "utensils"
  | "send"
  | "chevron"
  | "more"
  | "settings"
  | "compass"
  | "sun"
  | "clock"
  | "bell";

const paths: Record<IconName, ReactNode> = {
  sparkles: <path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2L12 3ZM5.5 14l-.8 2.7L2 17.5l2.7.8.8 2.7.8-2.7 2.7-.8-2.7-.8L5.5 14Zm12 0-.8 2.7-2.7.8 2.7.8.8 2.7.8-2.7 2.7-.8-2.7-.8-.8-2.7Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <path d="m21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />,
  calendar: <path d="M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3 8h2m4 0h2m-8 4h2m4 0h2" />,
  map: <path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2V6Zm5-2v13m8-10v13" />,
  wallet: <path d="M4 6.5h14a2 2 0 0 1 2 2V18H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13M16 11h4v4h-4a2 2 0 0 1 0-4Z" />,
  plane: <path d="m22 2-7.5 18-3.2-7.3L4 9.5 22 2Z" />,
  hotel: <path d="M4 20V5h16v15M4 14h16M8 8h2m4 0h2M7 20v-3h10v3" />,
  utensils: <path d="M6 3v7m3-7v7m-6-7v4a3 3 0 0 0 6 0M6 10v11m11-18v18m0-18c-2 1-3 3-3 6v3h3" />,
  send: <path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  // Gear (cog) outline with a center hole.
  settings: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  compass: <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm3.5-13.5-2 5-5 2 2-5 5-2Z" />,
  sun: <path d="M12 3V1m0 22v-2m9-9h2M1 12h2m16.4-7.4L18 6M6 18l-1.4 1.4m14.8 0L18 18M6 6 4.6 4.6M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z" />,
  clock: <path d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  bell: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9Zm4.3 13a1.94 1.94 0 0 0 3.4 0" />,
};

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill={name === "sparkles" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
