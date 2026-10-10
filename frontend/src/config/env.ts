/** App configuration read from Vite env vars. See frontend/.env.example. */
export const config = {
  /** Prefix for backend requests. Empty means same origin, which the Vite dev server proxies to the backend. */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, ""),
  /** When true (the default), every feature uses its mock service instead of calling the backend. */
  useMocks: import.meta.env.VITE_USE_MOCKS !== "false",
  /**
   * With mocks off, still show the "A slow week in Puglia" example journey (chat, itinerary, map,
   * budget) so there's always a full demo in the sidebar. Set VITE_SHOW_EXAMPLE=false to hide it.
   */
  showExample: import.meta.env.VITE_SHOW_EXAMPLE !== "false",
};
