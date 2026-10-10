/** App configuration read from Vite env vars. See frontend/.env.example. */
export const config = {
  /** Prefix for backend requests. Empty means same origin, which the Vite dev server proxies to the backend. */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, ""),
  /** Opt into the design demo; live Strands chat is the default. */
  useMocks: import.meta.env.VITE_USE_MOCKS === "true",
};
