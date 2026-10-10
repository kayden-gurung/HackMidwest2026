import { useCallback, useEffect, useState, type DependencyList } from "react";

export type AsyncState<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "success"; data: T; error?: undefined }
  | { status: "error"; data?: undefined; error: Error };

/**
 * Runs `load` on mount and whenever `deps` change, and tracks its loading / success / error state.
 * Feature hooks wrap this around their service calls so components never fetch directly.
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    load().then(
      (data) => {
        if (!cancelled) setState({ status: "success", data });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: "error", error: error instanceof Error ? error : new Error(String(error)) });
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is recreated every render; callers list what it depends on in `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  return { ...state, reload };
}
