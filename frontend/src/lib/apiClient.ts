import { config } from "../config/env";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Turns a failed response into an ApiError, using the backend's `detail` message when it sent one. */
async function errorFrom(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  return new ApiError(typeof body?.detail === "string" ? body.detail : "Roam could not process the request. Please try again.", response.status);
}

/** Single place every feature service goes through to reach the backend. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) throw await errorFrom(response);
  // 204 No Content (e.g. after a DELETE) has no body to parse.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * POSTs `body` and reads a Server-Sent Events reply, calling `onEvent` with each `data:` JSON payload
 * as it arrives. Resolves with `undefined` once the stream ends. If the server answers with plain JSON
 * instead (an older backend, or a test double), that JSON is returned so the caller can use it as is.
 */
async function postEvents<T>(path: string, body: unknown, onEvent: (event: Record<string, unknown>) => void, signal?: AbortSignal): Promise<T | undefined> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await errorFrom(response);
  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream") || !response.body) return (await response.json()) as T;

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    // Events are separated by a blank line; keep any partial event for the next chunk.
    buffer += value.replace(/\r\n/g, "\n");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      for (const line of block.split("\n")) {
        if (line.startsWith("data:")) onEvent(JSON.parse(line.slice(5).trim()));
      }
    }
  }
  return undefined;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown, signal?: AbortSignal) => request<T>(path, { method: "POST", body: JSON.stringify(body), signal }),
  postEvents,
  delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
};
