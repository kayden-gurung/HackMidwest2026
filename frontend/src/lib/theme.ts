import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "roam.theme";

/** Saved choice, else the OS preference. */
export function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage unavailable; fall through to the OS preference.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** Current theme plus a setter that applies and remembers the choice. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || getInitialTheme());

  useEffect(() => applyTheme(theme), [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Still applies for this session.
    }
  };
  return { theme, setTheme };
}
