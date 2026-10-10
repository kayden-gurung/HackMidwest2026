/** Resolves with a copy of `data` after `delayMs`, so mock services behave like real async calls. */
export function mockResponse<T>(data: T, delayMs = 0): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(data)), delayMs));
}

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
