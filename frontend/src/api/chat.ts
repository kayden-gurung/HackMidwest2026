export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function askRoam(
  prompt: string,
  history: ChatMessage[],
  mode: "Co-pilot" | "Surprise me",
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, history, mode }),
    signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof body?.detail === "string" ? body.detail : response.status >= 500
      ? "Roam is temporarily unavailable. Please try again."
      : "Roam could not process this message. Try a shorter message or start a new journey.");
  }
  if (typeof body?.reply !== "string" || !body.reply.trim()) {
    throw new Error("Roam returned an empty reply. Please try again.");
  }
  return body.reply;
}
