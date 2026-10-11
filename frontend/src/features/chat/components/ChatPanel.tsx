import { useEffect, useRef } from "react";
import { ErrorState, LoadingState } from "../../../components/ui";
import { useChat } from "../hooks/useChat";
import type { AskRequest, TravelPreferences } from "../types";
import { AssistantReply } from "./AssistantReply";
import { Composer } from "./Composer";
import { UserBubble } from "./UserBubble";

/** What the status line says while Roam uses each backend tool. */
const toolStatus: Record<string, string> = {
  find_places: "Searching real places…",
  locate: "Looking up locations…",
  update_itinerary: "Updating your plan…",
};

/**
 * The center column: conversation with Roam plus the message composer.
 * `preferences` are the traveler's settings, sent to Roam with every message.
 * `onUserMessage` fires with each message the traveler sends, before Roam replies.
 */
export function ChatPanel({
  tripId,
  preferences,
  mode,
  onUserMessage,
}: {
  tripId: string;
  preferences?: TravelPreferences;
  mode?: AskRequest["mode"];
  onUserMessage?: (text: string) => void;
}) {
  const { messages, sendStatus, error, draft, send, retry } = useChat(tripId, preferences, mode);
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view, including when a saved conversation is reopened.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, sendStatus, draft?.text.length]);

  const handleSend = (text: string) => {
    if (!text.trim() || sendStatus === "sending") return;
    onUserMessage?.(text);
    send(text);
  };

  return (
    <section className="flex min-h-0 flex-col border-line xl:border-r">
      <div className="flex-1 overflow-y-auto px-5 py-7 md:px-10 lg:px-12">
        <div className="mx-auto max-w-3xl space-y-8">
          {messages.length === 0 && <div className="py-10 text-center text-sm text-muted">Tell Roam where you want to go to start planning.</div>}
          {messages.map((message) =>
            message.role === "user" ? (
              <UserBubble key={message.id} text={message.text} />
            ) : (
              <AssistantReply key={message.id} message={message} onSuggestion={handleSend} />
            ),
          )}
          {/* While streaming: the reply so far, then a status line that names the tool Roam is using. */}
          {sendStatus === "sending" && draft?.text && <AssistantReply message={{ id: "draft", role: "assistant", text: draft.text }} onSuggestion={handleSend} />}
          {sendStatus === "sending" && (
            <LoadingState label={(draft?.tool && toolStatus[draft.tool]) || (draft?.tool ? "Working…" : draft?.text ? "Writing…" : "Roam is thinking…")} className="pl-11" />
          )}
          {sendStatus === "error" && <ErrorState message={error ?? "Roam couldn’t reply. Please try again."} onRetry={retry} className="pl-11" />}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 px-5 pb-5 pt-2 md:px-10 lg:px-12">
        <Composer onSend={handleSend} disabled={sendStatus === "sending"} />
      </div>
    </section>
  );
}
